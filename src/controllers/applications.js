const Application = require('../models/application');
const Interview = require('../models/interview');
const { HttpError } = require('../errors');

async function list(_req, res) {
  res.json(await Application.find().sort({ createdAt: -1 }));
}

async function get(req, res) {
  const application = await Application.findById(req.validatedId);
  if (!application) throw new HttpError(404, 'Application not found');
  res.json(application);
}

async function create(req, res) {
  const application = await Application.create(req.validatedBody);
  res.status(201).location(`/api/applications/${application.id}`).json(application);
}

async function replace(req, res) {
  const application = await Application.findById(req.validatedId);
  if (!application) throw new HttpError(404, 'Application not found');
  for (const field of Object.keys(Application.schema.paths)) {
    if (!['_id', 'createdAt', 'updatedAt'].includes(field)) {
      application[field] = req.validatedBody[field];
    }
  }
  await application.save();
  res.json(application);
}

async function remove(req, res) {
  const application = await Application.findById(req.validatedId);
  if (!application) throw new HttpError(404, 'Application not found');
  if (await Interview.exists({ applicationId: application.id })) {
    throw new HttpError(409, 'Delete the application\'s interviews first');
  }
  await application.deleteOne();
  res.status(204).send();
}

module.exports = { list, get, create, replace, remove };