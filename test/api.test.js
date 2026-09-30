const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../src/app');

let mongo;
const applicationInput = {
  company: 'Northstar Labs',
  position: 'Software Developer',
  location: 'Bogotá, Colombia',
  workMode: 'hybrid',
  employmentType: 'full-time',
  status: 'applied',
  appliedAt: '2026-09-28T14:00:00Z',
  source: 'Company website',
  salaryMin: 40000,
  salaryMax: 60000,
  currency: 'USD'
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'job_application_tracker_test' });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('application CRUD and replacement semantics', async () => {
  const created = await request(app).post('/api/applications').send(applicationInput).expect(201);
  const id = created.body._id;
  assert.match(created.headers.location, new RegExp(`${id}$`));
  assert.equal(created.body.company, applicationInput.company);
  assert.equal((await request(app).get('/api/applications').expect(200)).body.length, 1);
  assert.equal((await request(app).get(`/api/applications/${id}`).expect(200)).body.position, applicationInput.position);

  const updated = await request(app).put(`/api/applications/${id}`)
    .send({ ...applicationInput, status: 'interviewing', salaryMin: undefined, salaryMax: undefined, currency: undefined })
    .expect(200);
  assert.equal(updated.body.status, 'interviewing');
  assert.equal(updated.body.salaryMin, undefined);
  await request(app).delete(`/api/applications/${id}`).expect(204);
  await request(app).get(`/api/applications/${id}`).expect(404);
});

test('interview CRUD, parent validation, and delete conflict', async () => {
  const application = (await request(app).post('/api/applications').send(applicationInput).expect(201)).body;
  const input = {
    applicationId: application._id,
    scheduledAt: '2026-10-02T15:00:00Z',
    type: 'video',
    status: 'scheduled',
    interviewer: 'Hiring manager'
  };
  const created = await request(app).post('/api/interviews').send(input).expect(201);
  const id = created.body._id;
  assert.equal((await request(app).get('/api/interviews').expect(200)).body.length, 1);
  assert.equal((await request(app).get(`/api/interviews/${id}`).expect(200)).body.type, 'video');
  const updated = await request(app).put(`/api/interviews/${id}`)
    .send({ ...input, status: 'completed', interviewer: undefined }).expect(200);
  assert.equal(updated.body.status, 'completed');
  assert.equal(updated.body.interviewer, undefined);
  await request(app).delete(`/api/applications/${application._id}`).expect(409);
  await request(app).delete(`/api/interviews/${id}`).expect(204);
  await request(app).delete(`/api/applications/${application._id}`).expect(204);
});

test('validation and error responses', async () => {
  await request(app).post('/api/applications').send({ ...applicationInput, salaryMin: 70000, salaryMax: 60000 }).expect(400);
  await request(app).post('/api/applications').send({ ...applicationInput, unexpected: true }).expect(400);
  await request(app).get('/api/applications/not-an-id').expect(400);
  await request(app).get('/api/applications?unknown=1').expect(400);
  await request(app).post('/api/applications').set('Content-Type', 'application/json').send('{bad json').expect(400);
  await request(app).post('/api/interviews').send({
    applicationId: new mongoose.Types.ObjectId().toString(),
    scheduledAt: '2026-10-02T15:00:00Z', type: 'video', status: 'scheduled'
  }).expect(422);
  await request(app).get('/missing-route').expect(404);
});

test('documentation endpoints are available', async () => {
  const specification = await request(app).get('/openapi.json').expect(200);
  assert.ok(specification.body.paths['/api/applications/{id}'].put);
  assert.ok(specification.body.paths['/api/interviews/{id}'].delete);
  await request(app).get('/api-docs/').expect(200);
});