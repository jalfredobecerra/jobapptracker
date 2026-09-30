const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character MongoDB ObjectId');
const shortText = z.string().trim().min(1).max(120);
const dateTime = z.iso.datetime({ offset: true });

const applicationBody = z.strictObject({
  company: shortText,
  position: shortText,
  location: shortText,
  workMode: z.enum(['remote', 'hybrid', 'onsite']),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']),
  status: z.enum(['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn']),
  appliedAt: dateTime,
  source: shortText,
  jobUrl: z.url().max(2048).optional(),
  salaryMin: z.number().nonnegative().optional(),
  salaryMax: z.number().nonnegative().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/, 'Must be a three-letter currency code').optional(),
  notes: z.string().trim().max(2000).optional()
}).refine(value => value.salaryMin === undefined || value.salaryMax === undefined || value.salaryMin <= value.salaryMax, {
  message: 'salaryMin cannot exceed salaryMax', path: ['salaryMax']
});

const interviewBody = z.strictObject({
  applicationId: objectId,
  scheduledAt: dateTime,
  type: z.enum(['phone', 'video', 'onsite', 'other']),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  interviewer: shortText.optional(),
  location: shortText.optional(),
  notes: z.string().trim().max(2000).optional()
});

const emptyQuery = z.strictObject({});

function validateBody(schema) {
  return (req, _res, next) => {
    req.validatedBody = schema.parse(req.body);
    next();
  };
}

function validateId(req, _res, next) {
  req.validatedId = objectId.parse(req.params.id);
  next();
}

function validateEmptyQuery(req, _res, next) {
  emptyQuery.parse(req.query);
  next();
}

module.exports = { applicationBody, interviewBody, validateBody, validateId, validateEmptyQuery };