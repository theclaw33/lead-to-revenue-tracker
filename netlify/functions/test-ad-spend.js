exports.handler = async (event, context) => {
  console.log('Test ad spend function called');
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Test function is working!',
      timestamp: new Date().toISOString(),
      queryParams: event.queryStringParameters,
      headers: event.headers
    })
  };
};