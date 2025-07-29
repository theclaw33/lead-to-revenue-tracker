const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import serverless functions for local testing
const webhookFunction = require('./netlify/functions/webhook');
const authFunction = require('./netlify/functions/auth-quickbooks');
const healthFunction = require('./netlify/functions/health');

// Convert serverless functions to Express middleware
function adaptServerlessFunction(handler) {
  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      path: req.path,
      queryStringParameters: req.query,
      headers: req.headers,
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
      isBase64Encoded: false
    };
    
    const context = {};
    
    try {
      const result = await handler(event, context);
      
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.set(key, result.headers[key]);
        });
      }
      
      res.status(result.statusCode || 200);
      
      if (result.body) {
        try {
          const body = JSON.parse(result.body);
          res.json(body);
        } catch {
          res.send(result.body);
        }
      } else {
        res.end();
      }
    } catch (error) {
      console.error('Serverless function error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// Mount serverless functions as Express routes
app.use('/webhooks', webhookFunction.handler);
app.use('/.netlify/functions/webhook', webhookFunction.handler);

app.use('/auth', authFunction.handler);
app.use('/.netlify/functions/auth-quickbooks', authFunction.handler);

app.get('/health', adaptServerlessFunction(healthFunction.handler));
app.get('/.netlify/functions/health', adaptServerlessFunction(healthFunction.handler));

// Legacy routes for backward compatibility
app.post('/webhooks/housecall', (req, res, next) => {
  req.url = '/hcp-webhook';
  webhookFunction.handler(req, res, next);
});

app.post('/webhooks/quickbooks', (req, res, next) => {
  req.url = '/qbo-webhook';
  webhookFunction.handler(req, res, next);
});

app.get('/auth/quickbooks', (req, res, next) => {
  req.url = '/authorize';
  authFunction.handler(req, res, next);
});

app.get('/callback/quickbooks', (req, res, next) => {
  req.url = '/callback';
  authFunction.handler(req, res, next);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Lead-to-Revenue Tracker (Local Dev) started on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🔗 QuickBooks auth: http://localhost:${port}/auth/quickbooks`);
  console.log(`📥 HouseCall Pro webhook: http://localhost:${port}/webhooks/housecall`);
  console.log(`📥 QuickBooks webhook: http://localhost:${port}/webhooks/quickbooks`);
  console.log('');
  console.log('🔧 Testing serverless functions locally...');
  console.log('   Use `npm run netlify:dev` for full Netlify CLI development');
});

module.exports = app;