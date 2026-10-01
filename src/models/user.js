const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  githubId: { type: String, required: true, unique: true },
  login: { type: String, required: true, trim: true },
  displayName: { type: String, trim: true },
  avatarUrl: { type: String, trim: true },
  sessionVersion: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false, collection: 'users' });

module.exports = mongoose.model('User', userSchema);