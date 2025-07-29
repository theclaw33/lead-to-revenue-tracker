require('dotenv').config();
const QuickBooksAPI = require('../../src/lib/quickbooks');

// Initialize QuickBooks API
const qbo = new QuickBooksAPI();

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  try {
    const path = event.path;
    const method = event.httpMethod;
    
    console.log('QuickBooks auth function called:', method, path);
    
    // Handle OPTIONS request for CORS
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: ''
      };
    }
    
    // Extract the action from the path
    // Path will be something like /.netlify/functions/auth-quickbooks or /.netlify/functions/auth-quickbooks/authorize
    const pathParts = path.split('/');
    const action = pathParts[pathParts.length - 1];
    
    console.log('Action determined:', action);
    
    // Default to authorize if no specific action or if action is 'auth-quickbooks'
    if (method === 'GET' && (action === 'auth-quickbooks' || action === 'authorize' || !action)) {
      // Initiate QuickBooks OAuth flow
      try {
        const authUrl = qbo.getAuthorizationUrl();
        console.log('Redirecting to:', authUrl);
        
        return {
          statusCode: 302,
          headers: {
            ...headers,
            'Location': authUrl
          },
          body: ''
        };
      } catch (error) {
        console.error('QuickBooks authorization error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to initiate authorization', details: error.message })
        };
      }
    }
    
    // Handle OAuth callback
    if (method === 'GET' && action === 'callback') {
      try {
        const { code, realmId, error } = event.queryStringParameters || {};
        
        if (error) {
          console.error('QuickBooks OAuth error:', error);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Authorization failed', details: error })
          };
        }
        
        if (!code || !realmId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing authorization code or realm ID' })
          };
        }

        const tokens = await qbo.exchangeCodeForTokens(code, realmId);
        
        // In production, you should securely store these tokens
        console.log('QuickBooks tokens received:', {
          companyId: tokens.companyId,
          // Don't log actual tokens for security
        });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            message: 'QuickBooks authentication successful',
            companyId: tokens.companyId 
          })
        };
      } catch (error) {
        console.error('QuickBooks OAuth callback error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Authentication failed', details: error.message })
        };
      }
    }
    
    // Health check
    if (method === 'GET' && action === 'health') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          status: 'healthy', 
          service: 'quickbooks-auth',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Default response for unmatched routes
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ 
        error: 'Not found',
        path: path,
        method: method,
        availableActions: ['authorize', 'callback', 'health']
      })
    };
    
  } catch (error) {
    console.error('QuickBooks auth function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
};