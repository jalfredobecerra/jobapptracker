const Application = require('../models/application');
const Interview = require('../models/interview');
const { HttpError } = require('../errors');

async function ensureApplication(applicationId) {
  if (!await Application.exists({ _id: applicationId })) {
    throw new HttpError(422, 'applicationId does not identify an existing application');
  }
}

async function list(_req, res) {
  res.json(await Interview.find().sort({ scheduledAt: 1 }));
}

async function get(req, res) {
  const interview = await Interview.findById(req.validatedId);
  if (!interview) throw new HttpError(404, 'Interview not found');
  res.json(interview);
}

async function create(req, res) {
  await ensureApplication(req.validatedBody.applicationId);
  const interview = await Interview.create(req.validatedBody);
  res.status(201).location(`/api/interviews/${interview.id}`).json(interview);
}

async function replace(req, res) {
  const interview = await Interview.findById(req.validatedId);
  if (!interview) throw new HttpError(404, 'Interview not found');
  await ensureApplication(req.validatedBody.applicationId);
  for (const field of Object.keys(Interview.schema.paths)) {
    if (!['_id', 'createdAt', 'updatedAt'].includes(field)) {
      interview[field] = req.validatedBody[field];
    }
  }
  await interview.save();
  res.json(interview);
}

async function remove(req, res) {
  const interview = await Interview.findById(req.validatedId);
  if (!interview) throw new HttpError(404, 'Interview not found');
  await interview.deleteOne();
  res.status(204).send();
}

module.exports = { list, get, create, replace, remove };