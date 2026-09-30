const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../openapi.json');
const applicationRoutes = require('./routes/applications');
const interviewRoutes = require('./routes/interviews');
const { errorHandler } = require('./errors');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/openapi.json', (_req, res) => res.json(openapi));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api/applications', applicationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;