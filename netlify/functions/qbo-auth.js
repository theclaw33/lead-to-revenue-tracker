const QuickBooksAPI = require('../../src/lib/quickbooks');
require('dotenv').config();

exports.handler = async (event, context) => {
  console.log('QuickBooks auth function called');
  
  try {
    const qbo = new QuickBooksAPI();
    
    // Debug endpoint to check configuration
    if (event.queryStringParameters?.debug) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          redirectUri: process.env.QBO_REDIRECT_URI,
          clientId: process.env.QBO_CLIENT_ID ? 'Set' : 'Not set',
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Handle callback with auth code
    if (event.queryStringParameters?.code && event.queryStringParameters?.realmId) {
      const { code, realmId } = event.queryStringParameters;
      
      console.log('Processing QuickBooks callback...');
      
      const tokens = await qbo.exchangeCodeForTokens(code, realmId);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html'
        },
        body: `
          <!DOCTYPE html>
          <html>
          <head>
            <title>QuickBooks Connected</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
              .success { color: green; }
              .info { margin: 20px 0; padding: 20px; background: #f0f0f0; border-radius: 5px; }
            </style>
          </head>
          <body>
            <h1 class="success">✅ QuickBooks Connected Successfully!</h1>
            <div class="info">
              <p>Your QuickBooks account has been connected and tokens have been saved.</p>
              <p>Company ID: ${tokens.companyId}</p>
              <p>You can now close this window and test the ad spend update.</p>
            </div>
          </body>
          </html>
        `
      };
    }
    
    // Generate auth URL
    const authUrl = qbo.getAuthorizationUrl();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html'
      },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connect QuickBooks</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
            .button { 
              display: inline-block; 
              padding: 10px 20px; 
              background: #0077C5; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
            }
            .info { margin: 20px 0; padding: 20px; background: #f0f0f0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>Connect to QuickBooks</h1>
          <div class="info">
            <p>Click the button below to connect your QuickBooks account.</p>
            <p>You'll be redirected to QuickBooks to authorize the connection.</p>
          </div>
          <a href="${authUrl}" class="button">Connect QuickBooks</a>
        </body>
        </html>
      `
    };
  } catch (error) {
    console.error('QuickBooks auth error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Authentication failed',
        message: error.message
      })
    };
  }
};