const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  company: { type: String, required: true, trim: true },
  position: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  workMode: { type: String, required: true, enum: ['remote', 'hybrid', 'onsite'] },
  employmentType: { type: String, required: true, enum: ['full-time', 'part-time', 'contract', 'internship'] },
  status: { type: String, required: true, enum: ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] },
  appliedAt: { type: Date, required: true },
  source: { type: String, required: true, trim: true },
  jobUrl: { type: String, trim: true },
  salaryMin: { type: Number, min: 0 },
  salaryMax: { type: Number, min: 0 },
  currency: { type: String, uppercase: true, trim: true },
  notes: { type: String, trim: true }
}, { timestamps: true, versionKey: false, collection: 'applications' });

module.exports = mongoose.model('Application', applicationSchema);