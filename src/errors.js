const mongoose = require('mongoose');
const { ZodError } = require('zod');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.issues.map(issue => ({
      field: issue.path.join('.') || 'body', message: issue.message
    })) });
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: 'Validation failed', details: Object.values(error.errors).map(issue => ({
      field: issue.path, message: issue.message
    })) });
  }
  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: 'Invalid value', details: [{ field: error.path, message: error.message }] });
  }
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { HttpError, errorHandler };