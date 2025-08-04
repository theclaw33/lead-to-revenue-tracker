require('dotenv').config();

/**
 * Scheduled function to update ad spend on the 3rd of each month
 * This function should be triggered via Netlify Scheduled Functions or external cron
 */
exports.handler = async (event, context) => {
  console.log('Update ad spend function triggered');
  
  // Quick test to see if function is reachable
  if (event.queryStringParameters?.test) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Function is working!', timestamp: new Date().toISOString() })
    };
  }
  
  try {
    // Lazy load dependencies to avoid initialization errors
    const AirtableAPI = require('../../src/lib/airtable');
    const QuickBooksAPI = require('../../src/lib/quickbooks');
    
    console.log('Initializing APIs...');
    const airtable = new AirtableAPI();
    const qbo = new QuickBooksAPI();
    
    console.log('Starting monthly ad spend update...');
    
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
    
    console.log(`Fetching ad spend for ${month}/${year}`);
    
    // Fetch ad spend from QuickBooks
    const adSpendData = await fetchAdSpendFromQuickBooks(month, year, qbo);
    
    // Update Monthly Summary with ad spend
    const updatedSummary = await updateMonthlySummaryAdSpend(period, adSpendData, airtable);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Ad spend updated successfully',
        period: period,
        adSpend: adSpendData.totalAdSpend,
        summary: updatedSummary
      })
    };
  } catch (error) {
    console.error('Error updating ad spend:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update ad spend' })
    };
  }
};

/**
 * Fetch ad spend from QuickBooks for a specific month
 */
async function fetchAdSpendFromQuickBooks(month, year, qbo) {
  try {
    // Get start and end dates for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Fetch expenses from QuickBooks
    // This assumes you have specific expense categories for ad spend
    const expenses = await qbo.getExpensesByCategory({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      categories: [
        'Marketing',
        'Advertising',
        'Google Ads',
        'Facebook Ads',
        'Social Media Advertising',
        'Online Advertising'
      ]
    });
    
    // Calculate total ad spend
    let totalAdSpend = 0;
    const adSpendByCategory = {};
    
    expenses.forEach(expense => {
      const amount = parseFloat(expense.TotalAmt) || 0;
      totalAdSpend += amount;
      
      const category = expense.AccountRef?.name || 'Uncategorized';
      if (!adSpendByCategory[category]) {
        adSpendByCategory[category] = 0;
      }
      adSpendByCategory[category] += amount;
    });
    
    console.log(`Total ad spend for ${month}/${year}: $${totalAdSpend.toFixed(2)}`);
    console.log('Ad spend by category:', adSpendByCategory);
    
    return {
      totalAdSpend,
      adSpendByCategory,
      expenseCount: expenses.length
    };
  } catch (error) {
    console.error('Error fetching ad spend from QuickBooks:', error);
    throw error;
  }
}

/**
 * Update Monthly Summary with ad spend data
 */
async function updateMonthlySummaryAdSpend(period, adSpendData, airtable) {
  try {
    // Find existing monthly summary record
    const existingRecords = await airtable.summaryTable.select({
      filterByFormula: `{Period} = '${period}'`,
      maxRecords: 1
    }).firstPage();
    
    if (existingRecords.length === 0) {
      console.log(`No monthly summary found for ${period}, creating new record`);
      
      // Extract month and year from period
      const [year, month] = period.split('-').map(Number);
      
      // Create new record with ad spend
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
      
      const record = await airtable.summaryTable.create(recordData);
      return {
        id: record.getId(),
        fields: record.fields
      };
    }
    
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
    
    const record = await airtable.summaryTable.update(existingRecord.getId(), updateData);
    console.log(`Monthly summary updated with ad spend for ${period}`);
    
    return {
      id: record.getId(),
      fields: record.fields
    };
  } catch (error) {
    console.error('Error updating monthly summary with ad spend:', error);
    throw error;
  }
}