const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../openapi.json');
const applicationRoutes = require('./routes/applications');
const interviewRoutes = require('./routes/interviews');
const { router: authRoutes, requireAuth } = require('./auth');
const { errorHandler } = require('./errors');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/openapi.json', (_req, res) => res.json(openapi));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  swaggerOptions: { withCredentials: true }
}));
app.use('/auth', authRoutes);
app.use('/api/applications', requireAuth, applicationRoutes);
app.use('/api/interviews', requireAuth, interviewRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;