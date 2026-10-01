const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.GITHUB_CLIENT_ID = 'test-client';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/auth/github/callback';
process.env.SESSION_SECRET = 'a-test-session-secret-longer-than-thirty-two-characters';
process.env.NODE_ENV = 'test';

const User = require('../src/models/user');
const app = require('../src/app');

test('browser login, protected route, and logout without external services', async () => {
  const originalFetch = global.fetch;
  const originalUpsert = User.findOneAndUpdate;
  const originalFind = User.findById;

  const fakeUser = {
    id: '507f1f77bcf86cd799439011',
    login: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: '',
    sessionVersion: 0,
    async save() { return this; }
  };

  User.findOneAndUpdate = async () => fakeUser;
  User.findById = async () => fakeUser;
  global.fetch = async url => url === 'https://github.com/login/oauth/access_token'
    ? Response.json({ access_token: 'test-token' })
    : Response.json({ id: 123, login: 'octocat', name: 'The Octocat' });

  try {
    const agent = request.agent(app);
    await agent.get('/auth/me').expect(401);
    await agent.get('/api/applications').expect(401);

    const start = await agent.get('/auth/github').expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    assert.ok(state);
    assert.equal(new URL(start.headers.location).searchParams.get('code_challenge_method'), 'S256');

    await agent.get(`/auth/github/callback?code=test-code&state=${state}`).expect(302);
    const me = await agent.get('/auth/me').expect(200);
    assert.equal(me.body.login, 'octocat');

    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);
    await agent.get('/api/applications').expect(401);
  } finally {
    global.fetch = originalFetch;
    User.findOneAndUpdate = originalUpsert;
    User.findById = originalFind;
  }
});

test('OAuth callback requires matching state', async () => {
  const agent = request.agent(app);
  await agent.get('/auth/github').expect(302);
  await agent.get('/auth/github/callback?code=test-code&state=wrong').expect(400);
});