const Airtable = require('airtable');
require('dotenv').config();

/**
 * Map QuickBooks account names to lead sources
 */
function mapAccountToLeadSource(accountName) {
  const mapping = {
    'Google Ads': 'Google Ads',
    'Facebook Ads': 'Facebook Ads', 
    'Box Truck': 'Box Truck',
    'Angi': 'Angi',
    'Yard Sign': 'Yard Sign',
    'Billboard': 'Billboard',
    'Marketing': 'General Marketing',
    'Advertising': 'General Advertising',
    'Online Advertising': 'Online Ads',
    'Social Media Advertising': 'Social Media'
  };
  
  // Try exact match first
  if (mapping[accountName]) {
    return mapping[accountName];
  }
  
  // Try partial matches
  const lowerAccount = accountName.toLowerCase();
  for (const [key, value] of Object.entries(mapping)) {
    if (lowerAccount.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerAccount)) {
      return value;
    }
  }
  
  // Default to account name if no mapping found
  return accountName;
}

/**
 * Initialize QuickBooks with stored tokens from Airtable
 */
async function initializeQuickBooks() {
  try {
    // Get tokens from Airtable
    Airtable.configure({
      endpointUrl: 'https://api.airtable.com',
      apiKey: process.env.AIRTABLE_API_KEY
    });
    
    const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
    const tokensTable = base('OAuth Tokens');
    
    const records = await tokensTable.select({
      filterByFormula: `{Service} = "QuickBooks"`,
      maxRecords: 1
    }).firstPage();
    
    if (records.length === 0) {
      console.log('No QuickBooks tokens found in Airtable');
      return null;
    }
    
    const tokenRecord = records[0];
    const tokenData = {
      accessToken: tokenRecord.fields['Access Token'],
      refreshToken: tokenRecord.fields['Refresh Token'],
      companyId: tokenRecord.fields['Company ID'],
      expiresAt: tokenRecord.fields['Expires At']
    };
    
    console.log('Tokens found, expires at:', tokenData.expiresAt);
    
    // Check if token is expired and refresh if needed
    const expiresAt = new Date(tokenData.expiresAt);
    const now = new Date();
    
    if (expiresAt <= now) {
      console.log('Token expired, attempting refresh...');
      const refreshed = await refreshQuickBooksToken(tokenData, tokensTable, tokenRecord.getId());
      if (!refreshed) {
        return null;
      }
      // Update tokenData with new values
      tokenData.accessToken = refreshed.accessToken;
    }
    
    return tokenData;
  } catch (error) {
    console.error('Error initializing QuickBooks:', error);
    return null;
  }
}

/**
 * Refresh QuickBooks token
 */
async function refreshQuickBooksToken(tokenData, tokensTable, recordId) {
  try {
    const axios = require('axios');
    
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    
    const requestBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenData.refreshToken
    });
    
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await axios.post(tokenUrl, requestBody.toString(), {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      }
    });
    
    const newTokens = response.data;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (newTokens.expires_in || 3600));
    
    // Update tokens in Airtable
    await tokensTable.update(recordId, {
      'Access Token': newTokens.access_token,
      'Refresh Token': newTokens.refresh_token,
      'Expires At': expiresAt.toISOString(),
      'Updated At': new Date().toISOString()
    });
    
    console.log('Tokens refreshed successfully');
    return {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      companyId: tokenData.companyId
    };
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Fetch expenses from QuickBooks
 */
async function fetchQuickBooksExpenses(tokenData, startDate, endDate, categories) {
  try {
    const axios = require('axios');
    
    const baseUrl = process.env.QBO_SANDBOX === 'true' 
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';
    
    // Query for Purchase transactions
    const query = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`;
    const url = `${baseUrl}/v3/company/${tokenData.companyId}/query?query=${encodeURIComponent(query)}`;
    
    console.log('Fetching expenses with query:', query);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    const purchases = response.data.QueryResponse?.Purchase || [];
    console.log(`Found ${purchases.length} purchases in QuickBooks`);
    
    // Filter by categories if specified
    let filteredPurchases;
    if (categories.length === 0) {
      // Return all purchases if no categories specified (for debugging)
      filteredPurchases = purchases;
    } else {
      filteredPurchases = purchases.filter(purchase => {
        const accountName = purchase.AccountRef?.name || '';
        const lineAccountNames = purchase.Line?.map(line => line.AccountRef?.name || '') || [];
        const allAccountNames = [accountName, ...lineAccountNames];
        
        return allAccountNames.some(name => 
          categories.some(category => 
            name.toLowerCase().includes(category.toLowerCase())
          )
        );
      });
    }
    
    console.log(`${filteredPurchases.length} purchases match expense categories`);
    return filteredPurchases;
  } catch (error) {
    console.error('Error fetching QuickBooks expenses:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  console.log('Update ad spend v3 function triggered');
  
  // Quick test endpoint
  if (event.queryStringParameters?.test) {
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Function v3 is working!', 
        timestamp: new Date().toISOString()
      })
    };
  }
  
  // Test mode with sample data
  if (event.queryStringParameters?.testdata) {
    try {
      // Configure Airtable
      Airtable.configure({
        endpointUrl: 'https://api.airtable.com',
        apiKey: process.env.AIRTABLE_API_KEY
      });
      
      const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
      const summaryTable = base(process.env.AIRTABLE_MONTHLY_SUMMARY_TABLE_NAME || 'Monthly Summary');
      
      // Create sample ad spend data for testing
      const sampleAdSpend = {
        'Box Truck': 1500,
        'Angi': 800,
        'Yard Sign': 300,
        'Billboard': 2000,
        'Google Ads': 1200
      };
      
      const now = new Date();
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const month = previousMonth.getMonth() + 1;
      const year = previousMonth.getFullYear();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[month - 1];
      
      const updatedRecords = [];
      
      // Create records for each lead source
      for (const [leadSource, adSpend] of Object.entries(sampleAdSpend)) {
        const newRecord = await summaryTable.create({
          'Month': monthName,
          'Year': String(year),
          'Lead Source': leadSource,
          'Total Revenue': 0,
          'Ad Spend': String(adSpend)
        });
        
        updatedRecords.push({
          leadSource,
          adSpend,
          action: 'created',
          recordId: newRecord.getId()
        });
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Test data created successfully',
          period: `${year}-${String(month).padStart(2, '0')}`,
          totalAdSpend: Object.values(sampleAdSpend).reduce((a, b) => a + b, 0),
          recordsProcessed: updatedRecords.length,
          details: updatedRecords
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }
  
  // Debug endpoint to see all expenses
  if (event.queryStringParameters?.debug) {
    try {
      const qbTokens = await initializeQuickBooks();
      if (!qbTokens) {
        return {
          statusCode: 200,
          body: JSON.stringify({ error: 'QuickBooks not connected' })
        };
      }
      
      // Get broader date range to see what expenses exist
      const startDate = '2025-01-01';
      const endDate = '2025-12-31';
      
      const allExpenses = await fetchQuickBooksExpenses(qbTokens, startDate, endDate, []);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'All expenses in 2025',
          totalExpenses: allExpenses.length,
          expenses: allExpenses.map(exp => ({
            date: exp.TxnDate,
            amount: exp.TotalAmt,
            account: exp.AccountRef?.name,
            vendor: exp.EntityRef?.name,
            lines: exp.Line?.map(line => ({
              amount: line.Amount,
              account: line.AccountRef?.name
            }))
          }))
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }
  
  try {
    // Check environment variables
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      throw new Error('Missing Airtable configuration');
    }
    
    // Get current date for previous month calculation
    const now = new Date();
    const currentDay = now.getDate();
    
    // Only run on the 3rd of the month (unless forced)
    if (currentDay !== 3 && !event.queryStringParameters?.force) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Ad spend update only runs on the 3rd of each month',
          nextRun: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-03`
        })
      };
    }
    
    // Calculate previous month
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = previousMonth.getMonth() + 1;
    const year = previousMonth.getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];
    
    console.log(`Processing ad spend for ${month}/${year} (${monthName})`);
    
    // Initialize QuickBooks
    const qbTokens = await initializeQuickBooks();
    let adSpendData = {
      totalAdSpend: 0,
      adSpendByCategory: {},
      message: 'QuickBooks not connected - using placeholder data'
    };
    
    if (qbTokens) {
      console.log('QuickBooks connected, fetching expense data...');
      try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
        
        const expenses = await fetchQuickBooksExpenses(qbTokens, startDate, endDate, [
          'Advertising/Promotional', 'Marketing', 'Advertising', 
          'Google Ads', 'Facebook Ads', 'Box Truck', 'Angi', 
          'Yard Sign', 'Billboard', 'Online Advertising', 
          'Social Media Advertising', 'Promotional'
        ]);
        
        // Process expenses by category
        const adSpendByCategory = {};
        let totalAdSpend = 0;
        
        expenses.forEach(expense => {
          const amount = parseFloat(expense.TotalAmt) || 0;
          const accountName = expense.AccountRef?.name || 'Uncategorized';
          const leadSource = mapAccountToLeadSource(accountName);
          
          if (!adSpendByCategory[leadSource]) {
            adSpendByCategory[leadSource] = 0;
          }
          adSpendByCategory[leadSource] += amount;
          totalAdSpend += amount;
        });
        
        adSpendData = {
          totalAdSpend,
          adSpendByCategory,
          message: `Found ${expenses.length} expenses totaling $${totalAdSpend.toFixed(2)}`
        };
        
        console.log('Ad spend by category:', adSpendByCategory);
      } catch (error) {
        console.error('Error fetching QuickBooks data:', error);
        adSpendData.message = `QuickBooks error: ${error.message}`;
      }
    }
    
    // Configure Airtable
    Airtable.configure({
      endpointUrl: 'https://api.airtable.com',
      apiKey: process.env.AIRTABLE_API_KEY
    });
    
    const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
    const summaryTable = base(process.env.AIRTABLE_MONTHLY_SUMMARY_TABLE_NAME || 'Monthly Summary');
    
    // Get existing records for this month
    const existingRecords = await summaryTable.select({
      filterByFormula: `AND({Month} = "${monthName}", {Year} = "${year}")`,
      maxRecords: 100
    }).firstPage();
    
    console.log(`Found ${existingRecords.length} existing records for ${monthName} ${year}`);
    
    // Create map of existing records by lead source
    const existingByLeadSource = {};
    existingRecords.forEach(record => {
      const leadSource = record.fields['Lead Source'];
      if (leadSource) {
        existingByLeadSource[leadSource] = record;
      }
    });
    
    const updatedRecords = [];
    
    // Update ad spend for each lead source that has expenses
    for (const [leadSource, adSpend] of Object.entries(adSpendData.adSpendByCategory)) {
      if (adSpend > 0) {
        const existingRecord = existingByLeadSource[leadSource];
        
        if (existingRecord) {
          // Update existing record
          const updatedRecord = await summaryTable.update(existingRecord.getId(), {
            'Ad Spend': String(adSpend)
          });
          updatedRecords.push({
            leadSource,
            adSpend,
            action: 'updated',
            recordId: updatedRecord.getId()
          });
        } else {
          // Create new record
          const newRecord = await summaryTable.create({
            'Month': monthName,
            'Year': String(year),
            'Lead Source': leadSource,
            'Total Revenue': 0,
            'Ad Spend': String(adSpend)
          });
          updatedRecords.push({
            leadSource,
            adSpend,
            action: 'created',
            recordId: newRecord.getId()
          });
        }
      }
    }
    
    // Set ad spend to 0 for existing lead sources with no expenses
    for (const [leadSource, record] of Object.entries(existingByLeadSource)) {
      if (!adSpendData.adSpendByCategory[leadSource]) {
        const updatedRecord = await summaryTable.update(record.getId(), {
          'Ad Spend': '0'
        });
        updatedRecords.push({
          leadSource,
          adSpend: 0,
          action: 'zeroed',
          recordId: updatedRecord.getId()
        });
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Ad spend update completed',
        period: `${year}-${String(month).padStart(2, '0')}`,
        totalAdSpend: adSpendData.totalAdSpend,
        qboMessage: adSpendData.message,
        recordsProcessed: updatedRecords.length,
        details: updatedRecords
      })
    };
  } catch (error) {
    console.error('Error updating ad spend:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to update ad spend',
        message: error.message
      })
    };
  }
};