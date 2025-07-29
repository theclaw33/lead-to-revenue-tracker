exports.handler = async (event, context) => {
  try {
    // Basic health check
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        airtable: process.env.AIRTABLE_API_KEY ? 'configured' : 'not configured',
        quickbooks: process.env.QBO_CLIENT_ID ? 'configured' : 'not configured',
        housecall: process.env.HOUSECALL_PRO_API_KEY ? 'configured' : 'not configured'
      },
      functions: {
        webhook: 'active',
        'auth-quickbooks': 'active',
        health: 'active'
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: JSON.stringify(healthData)
    };
  } catch (error) {
    console.error('Health check error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};