const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const QuickBooksAPI = require('../../src/lib/quickbooks');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize QuickBooks API
const qbo = new QuickBooksAPI();

// Initiate QuickBooks OAuth flow
app.get('/authorize', (req, res) => {
  try {
    const authUrl = qbo.getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('QuickBooks authorization error:', error);
    res.status(500).json({ error: 'Failed to initiate authorization' });
  }
});

// Handle QuickBooks OAuth callback
app.get('/callback', async (req, res) => {
  try {
    const { code, realmId, error } = req.query;
    
    if (error) {
      console.error('QuickBooks OAuth error:', error);
      return res.status(400).json({ error: 'Authorization failed', details: error });
    }
    
    if (!code || !realmId) {
      return res.status(400).json({ error: 'Missing authorization code or realm ID' });
    }

    const tokens = await qbo.exchangeCodeForTokens(code, realmId);
    
    // In production, you should securely store these tokens
    console.log('QuickBooks tokens received:', {
      companyId: tokens.companyId,
      // Don't log actual tokens for security
    });
    
    res.json({ 
      message: 'QuickBooks authentication successful',
      companyId: tokens.companyId 
    });
  } catch (error) {
    console.error('QuickBooks OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Health check for auth service
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'quickbooks-auth',
    timestamp: new Date().toISOString()
  });
});

// Export handler for Netlify
exports.handler = serverless(app);