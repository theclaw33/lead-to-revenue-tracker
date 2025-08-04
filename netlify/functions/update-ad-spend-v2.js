const Airtable = require('airtable');
require('dotenv').config();

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
    
    // Configure Airtable
    Airtable.configure({
      endpointUrl: 'https://api.airtable.com',
      apiKey: process.env.AIRTABLE_API_KEY
    });
    
    const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
    const summaryTable = base(process.env.AIRTABLE_MONTHLY_SUMMARY_TABLE_NAME || 'Monthly Summary');
    
    // For now, create a placeholder update since we don't have QBO auth
    // In production, this would fetch actual ad spend from QuickBooks
    const adSpendData = {
      totalAdSpend: 0,
      adSpendByCategory: {},
      message: 'QuickBooks integration pending - placeholder data'
    };
    
    // Find existing monthly summary record
    const existingRecords = await summaryTable.select({
      filterByFormula: `{Period} = '${period}'`,
      maxRecords: 1
    }).firstPage();
    
    let record;
    if (existingRecords.length === 0) {
      console.log(`No monthly summary found for ${period}, creating new record`);
      
      // Create new record with placeholder ad spend
      const recordData = {
        'Month': month,
        'Year': year,
        'Period': period,
        'Total Revenue': 0,
        'Total Ad Spend': adSpendData.totalAdSpend,
        'Total Promo Spend': 0,
        'Net Revenue': -adSpendData.totalAdSpend,
        'Customer Count': 0,
        'Average Revenue Per Customer': 0,
        'Revenue by Source': JSON.stringify({}),
        'Ad Spend by Category': JSON.stringify(adSpendData.adSpendByCategory),
        'ROI': 'N/A',
        'Created At': new Date().toISOString(),
        'Last Updated': new Date().toISOString(),
        'Ad Spend Updated': new Date().toISOString()
      };
      
      record = await summaryTable.create(recordData);
    } else {
      // Update existing record
      const existingRecord = existingRecords[0];
      const currentFields = existingRecord.fields;
      const totalRevenue = currentFields['Total Revenue'] || 0;
      const totalPromoSpend = currentFields['Total Promo Spend'] || 0;
      
      const updateData = {
        'Total Ad Spend': adSpendData.totalAdSpend,
        'Ad Spend by Category': JSON.stringify(adSpendData.adSpendByCategory),
        'Net Revenue': totalRevenue - adSpendData.totalAdSpend - totalPromoSpend,
        'ROI': adSpendData.totalAdSpend > 0 
          ? ((totalRevenue - adSpendData.totalAdSpend) / adSpendData.totalAdSpend * 100).toFixed(2) + '%' 
          : 'N/A',
        'Last Updated': new Date().toISOString(),
        'Ad Spend Updated': new Date().toISOString()
      };
      
      record = await summaryTable.update(existingRecord.getId(), updateData);
      console.log(`Monthly summary updated for ${period}`);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Ad spend update completed',
        period: period,
        adSpend: adSpendData.totalAdSpend,
        note: adSpendData.message,
        recordId: record.getId()
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