const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.GITHUB_CLIENT_ID = 'test-client';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/auth/github/callback';
process.env.SESSION_SECRET = 'a-test-session-secret-longer-than-thirty-two-characters';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
let mongo;
const originalFetch = global.fetch;

const applicationInput = {
  company: 'Northstar Labs',
  position: 'Software Developer',
  location: 'Bogotá, Colombia',
  workMode: 'hybrid',
  employmentType: 'full-time',
  status: 'applied',
  appliedAt: '2026-09-30T14:00:00Z',
  source: 'Company website'
};

async function signIn(githubId = '123') {
  const agent = request.agent(app);
  const start = await agent.get('/auth/github').expect(302);
  const state = new URL(start.headers.location).searchParams.get('state');
  await agent.get(`/auth/github/callback?code=${githubId}&state=${state}`).expect(302);
  return agent;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'job_application_tracker_test' });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  global.fetch = async (url, options) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      const code = new URLSearchParams(options.body).get('code');
      return Response.json({ access_token: `token-${code}` });
    }
    if (url === 'https://api.github.com/user') {
      const id = options.headers.authorization.replace('Bearer token-', '');
      return Response.json({
        id,
        login: `user-${id}`,
        name: `User ${id}`,
        avatar_url: 'https://example.com/avatar.png'
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
});

after(async () => {
  global.fetch = originalFetch;
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('GitHub OAuth creates an account, signs in, and logs out', async () => {
  await request(app).get('/auth/me').expect(401);
  await request(app).get('/api/applications').expect(401);

  const agent = await signIn();
  const me = await agent.get('/auth/me').expect(200);
  assert.equal(me.body.login, 'user-123');
  assert.equal(await mongoose.connection.collection('users').countDocuments(), 1);

  await agent.post('/auth/logout').expect(204);
  await agent.get('/auth/me').expect(401);
  await agent.get('/api/applications').expect(401);
});

test('OAuth rejects a mismatched state', async () => {
  const agent = request.agent(app);
  await agent.get('/auth/github').expect(302);
  await agent.get('/auth/github/callback?code=123&state=wrong').expect(400);
  assert.equal(await mongoose.connection.collection('users').countDocuments(), 0);
});

test('application CRUD is restricted to its owner', async () => {
  const owner = await signIn('123');
  const other = await signIn('456');
  const created = await owner.post('/api/applications').send(applicationInput).expect(201);
  const id = created.body._id;

  assert.ok(created.body.ownerId);
  assert.equal((await owner.get('/api/applications').expect(200)).body.length, 1);
  assert.equal((await other.get('/api/applications').expect(200)).body.length, 0);
  await other.get(`/api/applications/${id}`).expect(404);
  await other.put(`/api/applications/${id}`).send(applicationInput).expect(404);
  await other.delete(`/api/applications/${id}`).expect(404);
  await owner.get(`/api/applications/${id}`).expect(200);

  const updated = await owner.put(`/api/applications/${id}`)
    .send({ ...applicationInput, status: 'interviewing' })
    .expect(200);
  assert.equal(updated.body.status, 'interviewing');

  await owner.delete(`/api/applications/${id}`).expect(204);
  await owner.get(`/api/applications/${id}`).expect(404);
});

test('interview CRUD, parent ownership, and delete conflict', async () => {
  const owner = await signIn('123');
  const other = await signIn('456');
  const application = (await owner.post('/api/applications').send(applicationInput).expect(201)).body;
  const input = {
    applicationId: application._id,
    scheduledAt: '2026-10-02T15:00:00Z',
    type: 'video',
    status: 'scheduled'
  };

  await other.post('/api/interviews').send(input).expect(422);
  const created = await owner.post('/api/interviews').send(input).expect(201);
  const id = created.body._id;

  assert.equal((await owner.get('/api/interviews').expect(200)).body.length, 1);
  assert.equal((await other.get('/api/interviews').expect(200)).body.length, 0);
  await other.get(`/api/interviews/${id}`).expect(404);
  await owner.get(`/api/interviews/${id}`).expect(200);

  const updated = await owner.put(`/api/interviews/${id}`)
    .send({ ...input, status: 'completed' })
    .expect(200);
  assert.equal(updated.body.status, 'completed');

  await owner.delete(`/api/applications/${application._id}`).expect(409);
  await owner.delete(`/api/interviews/${id}`).expect(204);
  await owner.delete(`/api/applications/${application._id}`).expect(204);
});

test('validation and documentation reflect protected routes', async () => {
  const agent = await signIn();

  await agent.post('/api/applications').send({ ...applicationInput, status: 'invalid' }).expect(400);
  await agent.get('/api/applications/not-an-id').expect(400);
  await agent.post('/api/applications')
    .set('Content-Type', 'application/json')
    .send('{bad json')
    .expect(400);

  const spec = await request(app).get('/openapi.json').expect(200);
  assert.deepEqual(spec.body.security, [{ sessionCookie: [] }]);
  assert.deepEqual(spec.body.paths['/health'].get.security, []);
  assert.ok(spec.body.paths['/auth/github']);
  assert.ok(spec.body.paths['/auth/logout']);
  assert.ok(spec.body.paths['/api/applications'].get.responses[401]);
  await request(app).get('/api-docs/').expect(200);
});