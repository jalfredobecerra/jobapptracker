const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
  scheduledAt: { type: Date, required: true },
  type: { type: String, required: true, enum: ['phone', 'video', 'onsite', 'other'] },
  status: { type: String, required: true, enum: ['scheduled', 'completed', 'cancelled'] },
  interviewer: { type: String, trim: true },
  location: { type: String, trim: true },
  notes: { type: String, trim: true }
}, { timestamps: true, versionKey: false, collection: 'interviews' });

module.exports = mongoose.model('Interview', interviewSchema);