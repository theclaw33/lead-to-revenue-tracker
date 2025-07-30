const Airtable = require('airtable');
require('dotenv').config();

class AirtableAPI {
  constructor() {
    this.apiKey = process.env.AIRTABLE_API_KEY;
    this.baseId = process.env.AIRTABLE_BASE_ID;
    this.leadsTableName = process.env.AIRTABLE_LEADS_TABLE_NAME || 'Leads';
    this.monthlySummaryTableName = process.env.AIRTABLE_MONTHLY_SUMMARY_TABLE_NAME || 'Monthly Summary';
    
    if (!this.apiKey || !this.baseId) {
      throw new Error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required');
    }
    
    // Configure Airtable
    Airtable.configure({
      endpointUrl: 'https://api.airtable.com',
      apiKey: this.apiKey
    });
    
    this.base = Airtable.base(this.baseId);
    this.leadsTable = this.base(this.leadsTableName);
    this.summaryTable = this.base(this.monthlySummaryTableName);
  }

  /**
   * Create a new lead record in Airtable
   * @param {Object} customerData - Customer data from HouseCall Pro
   * @returns {Object} Created record data
   */
  async createLead(customerData) {
    try {
      console.log(`Creating new lead in Airtable: ${customerData.name}`);
      
      // Format date for Airtable (YYYY-MM-DD format)
      let formattedDate = customerData.dateCreated;
      if (customerData.dateCreated) {
        const date = new Date(customerData.dateCreated);
        formattedDate = date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
      }
      
      const recordData = {
        'Customer Name': customerData.name,
        'Email': customerData.email,
        'Phone': customerData.phone,
        'Lead Source': customerData.leadSource,
        'Date Created': formattedDate,
        'HCP Customer ID': customerData.id,
        'Payment Status': 'Pending',
        'Payment Amount': 0,
        'Address': customerData.address || '',
        'Notes': customerData.notes || '',
        'Tags': customerData.tags ? customerData.tags.join(', ') : ''
      };
      
      const record = await this.leadsTable.create(recordData);
      
      console.log(`Lead created successfully with Airtable ID: ${record.getId()}`);
      return {
        id: record.getId(),
        fields: record.fields
      };
    } catch (error) {
      console.error('Error creating lead in Airtable:', error);
      throw error;
    }
  }

  /**
   * Upsert a lead record in Airtable (create or update based on Customer Name)
   * @param {Object} customerData - Customer data from HouseCall Pro/GHL
   * @returns {Object} Created or updated record data
   */
  async upsertLead(customerData) {
    try {
      console.log(`Upserting lead in Airtable: ${customerData.name}`);
      
      // First, try to find existing record by customer name
      const existingRecords = await this.leadsTable.select({
        filterByFormula: `{Customer Name} = "${customerData.name}"`,
        maxRecords: 1
      }).firstPage();
      
      // Format date for Airtable (YYYY-MM-DD format)
      let formattedDate = customerData.dateCreated;
      if (customerData.dateCreated) {
        const date = new Date(customerData.dateCreated);
        formattedDate = date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
      }
      
      const recordData = {
        'Customer Name': customerData.name,
        'Email': customerData.email,
        'Phone': customerData.phone,
        'Lead Source': customerData.leadSource,
        'Date Created': formattedDate,
        'HCP Customer ID': customerData.id,
        'Address': customerData.address || '',
        'Notes': customerData.notes || '',
        'Tags': customerData.tags ? customerData.tags.join(', ') : ''
      };
      
      let record;
      if (existingRecords.length > 0) {
        // Update existing record
        const existingRecord = existingRecords[0];
        console.log(`Found existing record for ${customerData.name}, updating...`);
        
        // Remove fields that shouldn't be overwritten if they already exist
        const updateData = { ...recordData };
        
        // Don't overwrite payment fields if they already have values
        if (existingRecord.fields['Payment Status'] !== 'Pending' || existingRecord.fields['Payment Amount'] > 0) {
          delete updateData['Payment Status'];
          delete updateData['Payment Amount'];
        }
        
        // Don't overwrite Date Created if it already exists
        if (existingRecord.fields['Date Created']) {
          delete updateData['Date Created'];
        }
        
        record = await this.leadsTable.update(existingRecord.getId(), updateData);
        console.log(`Lead updated successfully with Airtable ID: ${record.getId()}`);
      } else {
        // Create new record
        console.log(`No existing record found for ${customerData.name}, creating new...`);
        
        // Add default payment fields for new records
        recordData['Payment Status'] = 'Pending';
        recordData['Payment Amount'] = 0;
        
        record = await this.leadsTable.create(recordData);
        console.log(`Lead created successfully with Airtable ID: ${record.getId()}`);
      }
      
      return {
        id: record.getId(),
        fields: record.fields,
        wasUpdated: existingRecords.length > 0
      };
    } catch (error) {
      console.error('Error upserting lead in Airtable:', error);
      throw error;
    }
  }

  /**
   * Find a lead by customer name (supports fuzzy matching)
   * @param {string} customerName - Customer name to search for
   * @param {number} threshold - Fuzzy match threshold (0-1)
   * @returns {Object|null} Found record or null
   */
  async findLeadByName(customerName, threshold = 0.8) {
    try {
      console.log(`Searching for lead: ${customerName}`);
      
      const records = await this.leadsTable.select({
        filterByFormula: `SEARCH("${customerName.toLowerCase()}", LOWER({Customer Name})) > 0`,
        maxRecords: 10
      }).firstPage();
      
      if (records.length === 0) {
        // Try fuzzy matching if exact search returns no results
        return await this.fuzzySearchLeads(customerName, threshold);
      }
      
      // Return the first exact match
      const record = records[0];
      return {
        id: record.getId(),
        fields: record.fields
      };
    } catch (error) {
      console.error('Error finding lead by name in Airtable:', error);
      throw error;
    }
  }

  /**
   * Fuzzy search for leads when exact match fails
   * @param {string} customerName - Customer name to search for
   * @param {number} threshold - Fuzzy match threshold
   * @returns {Object|null} Best matching record or null
   */
  async fuzzySearchLeads(customerName, threshold = 0.8) {
    try {
      const Fuse = require('fuse.js');
      
      // Get all leads for fuzzy matching
      const allRecords = await this.leadsTable.select({
        fields: ['Customer Name'],
        maxRecords: 1000
      }).all();
      
      const leads = allRecords.map(record => ({
        id: record.getId(),
        name: record.fields['Customer Name'],
        record: record
      }));
      
      const fuse = new Fuse(leads, {
        keys: ['name'],
        threshold: 1 - threshold, // Fuse uses inverse threshold
        includeScore: true
      });
      
      const results = fuse.search(customerName);
      
      if (results.length > 0 && results[0].score <= (1 - threshold)) {
        const bestMatch = results[0].item;
        console.log(`Fuzzy match found: ${bestMatch.name} (score: ${results[0].score})`);
        
        return {
          id: bestMatch.id,
          fields: bestMatch.record.fields
        };
      }
      
      console.log(`No fuzzy match found for: ${customerName}`);
      return null;
    } catch (error) {
      console.error('Error in fuzzy search:', error);
      return null;
    }
  }

  /**
   * Update a lead record with payment information
   * @param {string} recordId - Airtable record ID
   * @param {Object} paymentData - Payment information from QuickBooks
   * @returns {Object} Updated record data
   */
  async updateLeadPayment(recordId, paymentData) {
    try {
      console.log(`Updating lead payment for record: ${recordId}`);
      
      const updateData = {
        'Payment Amount': paymentData.amount,
        'Payment Status': 'Paid ✅',
        'Invoice Number': paymentData.invoiceNumber,
        'Payment Date': paymentData.paymentDate || new Date().toISOString(),
        'QBO Customer ID': paymentData.customerId
      };
      
      const record = await this.leadsTable.update(recordId, updateData);
      
      console.log(`Payment updated for lead: ${record.fields['Customer Name']}`);
      return {
        id: record.getId(),
        fields: record.fields
      };
    } catch (error) {
      console.error('Error updating lead payment in Airtable:', error);
      throw error;
    }
  }

  /**
   * Get all leads with payments for revenue aggregation
   * @param {string} startDate - Start date for filtering (ISO string)
   * @param {string} endDate - End date for filtering (ISO string)
   * @returns {Array} Array of lead records with payments
   */
  async getLeadsWithPayments(startDate, endDate) {
    try {
      console.log(`Fetching leads with payments between ${startDate} and ${endDate}`);
      
      let filterFormula = `{Payment Status} = 'Paid ✅'`;
      
      if (startDate && endDate) {
        filterFormula += ` AND IS_AFTER({Payment Date}, '${startDate}') AND IS_BEFORE({Payment Date}, '${endDate}')`;
      }
      
      const records = await this.leadsTable.select({
        filterByFormula: filterFormula,
        fields: ['Customer Name', 'Lead Source', 'Payment Amount', 'Payment Date', 'Payment Status']
      }).all();
      
      return records.map(record => ({
        id: record.getId(),
        fields: record.fields
      }));
    } catch (error) {
      console.error('Error fetching leads with payments:', error);
      throw error;
    }
  }

  /**
   * Aggregate revenue by lead source
   * @param {Array} leads - Array of lead records
   * @returns {Object} Revenue aggregated by lead source
   */
  aggregateRevenueBySource(leads) {
    const aggregation = {};
    
    leads.forEach(lead => {
      const source = lead.fields['Lead Source'] || 'Unknown';
      const amount = parseFloat(lead.fields['Payment Amount']) || 0;
      
      if (!aggregation[source]) {
        aggregation[source] = {
          totalRevenue: 0,
          customerCount: 0,
          averageRevenue: 0
        };
      }
      
      aggregation[source].totalRevenue += amount;
      aggregation[source].customerCount += 1;
      aggregation[source].averageRevenue = aggregation[source].totalRevenue / aggregation[source].customerCount;
    });
    
    return aggregation;
  }

  /**
   * Create or update monthly summary record
   * @param {Object} summaryData - Monthly summary data
   * @returns {Object} Created/updated record
   */
  async createMonthlySummary(summaryData) {
    try {
      console.log(`Creating monthly summary for ${summaryData.month}/${summaryData.year}`);
      
      const recordData = {
        'Month': summaryData.month,
        'Year': summaryData.year,
        'Period': `${summaryData.year}-${String(summaryData.month).padStart(2, '0')}`,
        'Total Revenue': summaryData.totalRevenue,
        'Total Ad Spend': summaryData.totalAdSpend,
        'Total Promo Spend': summaryData.totalPromoSpend,
        'Net Revenue': summaryData.totalRevenue - summaryData.totalAdSpend - summaryData.totalPromoSpend,
        'Customer Count': summaryData.customerCount,
        'Average Revenue Per Customer': summaryData.averageRevenuePerCustomer,
        'Revenue by Source': JSON.stringify(summaryData.revenueBySource),
        'ROI': summaryData.totalAdSpend > 0 ? ((summaryData.totalRevenue - summaryData.totalAdSpend) / summaryData.totalAdSpend * 100).toFixed(2) + '%' : 'N/A',
        'Created At': new Date().toISOString()
      };
      
      // Check if record already exists for this month/year
      const existingRecords = await this.summaryTable.select({
        filterByFormula: `{Period} = '${recordData.Period}'`,
        maxRecords: 1
      }).firstPage();
      
      let record;
      if (existingRecords.length > 0) {
        // Update existing record
        record = await this.summaryTable.update(existingRecords[0].getId(), recordData);
        console.log('Monthly summary updated');
      } else {
        // Create new record
        record = await this.summaryTable.create(recordData);
        console.log('Monthly summary created');
      }
      
      return {
        id: record.getId(),
        fields: record.fields
      };
    } catch (error) {
      console.error('Error creating monthly summary:', error);
      throw error;
    }
  }

  /**
   * Get all leads for a specific month
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @returns {Array} Array of lead records
   */
  async getLeadsByMonth(month, year) {
    try {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      return await this.getLeadsWithPayments(startDate, endDate);
    } catch (error) {
      console.error('Error fetching leads by month:', error);
      throw error;
    }
  }
}

module.exports = AirtableAPI;