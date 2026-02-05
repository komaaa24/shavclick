const express = require('express');
const path = require('path');
const clickRoutes = require('./routes/click.routes');
const clickController = require('./controllers/click.controller');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const requestLogger = require('./middlewares/requestLogger');

const app = express();

// app.disable('x-powered-by'); // Commented out for now
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/pay', clickController.quickPay);
app.get('/payment/callback', clickController.clickReturnCallback);
// Some Click merchant panels allow a single URL for both user return and backend callbacks.
// Handle POST here as a safe alias to the unified endpoint so payments don't fail if the
// provider posts to the same return_url.
app.post('/payment/callback', clickController.clickSingleEndpoint);
// Single endpoint variant for Click (when both Prepare and Complete hit the same URL)
app.post('/api/click', clickController.clickSingleEndpoint);
app.post('/api/click/prepare', clickController.clickPrepare);
app.post('/api/click/complete', clickController.clickComplete);
app.use('/api', clickRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
