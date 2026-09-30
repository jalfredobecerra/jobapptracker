require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const Application = require('./models/application');
const Interview = require('./models/interview');

async function start() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. See .env.example.');
  const dbName = process.env.MONGODB_DB_NAME || 'job_application_tracker';
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  await Promise.all([Application.init(), Interview.init()]);
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port}; database: ${dbName}`));
}

start().catch(error => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});