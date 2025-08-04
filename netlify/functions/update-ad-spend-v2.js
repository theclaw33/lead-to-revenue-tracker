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

exports.handler = async (event, context) => {
  console.log('Update ad spend v2 function triggered');
  
  // Quick test to see if function is reachable
  if (event.queryStringParameters?.test) {
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Function v2 is working!', 
        timestamp: new Date().toISOString(),
        env: {
          hasAirtableKey: !!process.env.AIRTABLE_API_KEY,
          hasAirtableBase: !!process.env.AIRTABLE_BASE_ID,
          hasQBOClient: !!process.env.QBO_CLIENT_ID
        }
      })
    };
  }
  
  // Debug tokens
  if (event.queryStringParameters?.tokens) {
    try {
      const AirtableAPI = require('../../src/lib/airtable');
      const airtable = new AirtableAPI();
      const tokens = await airtable.getOAuthTokens('QuickBooks');
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          tokensFound: !!tokens,
          tokenData: tokens ? {
            hasAccessToken: !!tokens.accessToken,
            hasRefreshToken: !!tokens.refreshToken,
            hasCompanyId: !!tokens.companyId,
            expiresAt: tokens.expiresAt,
            updatedAt: tokens.updatedAt
          } : 'No tokens found'
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
    
    // Get current date
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
    const period = `${year}-${String(month).padStart(2, '0')}`;
    
    console.log(`Processing ad spend for ${month}/${year}`);
    
    // Convert month number to month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];
    
    // Configure Airtable
    Airtable.configure({
      endpointUrl: 'https://api.airtable.com',
      apiKey: process.env.AIRTABLE_API_KEY
    });
    
    const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
    const summaryTable = base(process.env.AIRTABLE_MONTHLY_SUMMARY_TABLE_NAME || 'Monthly Summary');
    
    // Initialize QuickBooks and fetch real ad spend data
    const QuickBooksAPI = require('../../src/lib/quickbooks');
    const qbo = new QuickBooksAPI();
    
    // Try to connect to QuickBooks
    console.log('Attempting to initialize QuickBooks from stored tokens...');
    const qboConnected = await qbo.initializeFromStoredTokens();
    console.log('QuickBooks connection result:', qboConnected);
    
    let adSpendData = {
      totalAdSpend: 0,
      adSpendByCategory: {},
      message: 'QuickBooks not connected - using placeholder data'
    };
    
    if (qboConnected) {
      console.log('QuickBooks connected, fetching real ad spend data...');
      try {
        const expenses = await qbo.getExpensesByCategory({
          startDate: `${year}-${String(month).padStart(2, '0')}-01`,
          endDate: `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`,
          categories: [
            'Marketing',
            'Advertising', 
            'Google Ads',
            'Facebook Ads',
            'Box Truck',
            'Angi',
            'Yard Sign',
            'Billboard',
            'Online Advertising',
            'Social Media Advertising'
          ]
        });
        
        // Process expenses by category
        const adSpendByCategory = {};
        let totalAdSpend = 0;
        
        expenses.forEach(expense => {
          const amount = parseFloat(expense.TotalAmt) || 0;
          const accountName = expense.AccountRef?.name || 'Uncategorized';
          
          // Map QBO account names to lead sources
          let leadSource = mapAccountToLeadSource(accountName);
          
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
    
    // Get all existing lead sources that have revenue for this month
    const existingRecords = await summaryTable.select({
      filterByFormula: `AND({Month} = "${monthName}", {Year} = "${year}")`,
      maxRecords: 100
    }).firstPage();
    
    console.log(`Found ${existingRecords.length} existing records for ${monthName} ${year}`);
    
    // Create a map of existing records by lead source
    const existingByLeadSource = {};
    existingRecords.forEach(record => {
      const leadSource = record.fields['Lead Source'];
      if (leadSource) {
        existingByLeadSource[leadSource] = record;
      }
    });
    
    const updatedRecords = [];
    const results = [];
    
    // Update ad spend for each lead source that has expenses
    for (const [leadSource, adSpend] of Object.entries(adSpendData.adSpendByCategory)) {
      if (adSpend > 0) {
        const existingRecord = existingByLeadSource[leadSource];
        
        if (existingRecord) {
          // Update existing record
          const updateData = {
            'Ad Spend': String(adSpend)
          };
          
          const updatedRecord = await summaryTable.update(existingRecord.getId(), updateData);
          updatedRecords.push({
            leadSource,
            adSpend,
            action: 'updated',
            recordId: updatedRecord.getId()
          });
        } else {
          // Create new record for this lead source
          const recordData = {
            'Month': monthName,
            'Year': String(year),
            'Lead Source': leadSource,
            'Total Revenue': 0, // Will be updated when payments come in
            'Ad Spend': String(adSpend)
          };
          
          const newRecord = await summaryTable.create(recordData);
          updatedRecords.push({
            leadSource,
            adSpend,
            action: 'created',
            recordId: newRecord.getId()
          });
        }
      }
    }
    
    // Set ad spend to 0 for lead sources with no expenses this month
    for (const [leadSource, record] of Object.entries(existingByLeadSource)) {
      if (!adSpendData.adSpendByCategory[leadSource]) {
        const updateData = {
          'Ad Spend': '0'
        };
        
        const updatedRecord = await summaryTable.update(record.getId(), updateData);
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
        period: period,
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