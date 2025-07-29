const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const HouseCallProAPI = require('./housecall');
const AirtableAPI = require('./airtable');
const QuickBooksAPI = require('./quickbooks');
const Utils = require('./utils');

class LeadToRevenueTracker {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    // Initialize API clients
    this.hcp = new HouseCallProAPI();
    this.airtable = new AirtableAPI();
    this.qbo = new QuickBooksAPI();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    
    // Logging
    this.app.use(morgan('combined'));
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Raw body for webhook signature verification
    this.app.use('/webhooks', express.raw({ type: 'application/json' }));
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        services: {
          housecall: 'configured',
          airtable: 'configured',
          quickbooks: 'configured'
        }
      });
    });

    // QuickBooks OAuth routes
    this.app.get('/auth/quickbooks', (req, res) => {
      const authUrl = this.qbo.getAuthorizationUrl();
      res.redirect(authUrl);
    });

    this.app.get('/callback/quickbooks', async (req, res) => {
      try {
        const { code, realmId } = req.query;
        
        if (!code || !realmId) {
          return res.status(400).json({ error: 'Missing authorization code or realm ID' });
        }

        const tokens = await this.qbo.exchangeCodeForTokens(code, realmId);
        
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

    // Webhook endpoints
    this.app.post('/webhooks/housecall', this.handleHouseCallWebhook.bind(this));
    this.app.post('/webhooks/quickbooks', this.handleQuickBooksWebhook.bind(this));

    // API endpoints
    this.app.get('/api/leads', this.getLeads.bind(this));
    this.app.get('/api/summary/:year/:month', this.getMonthlySummary.bind(this));
    this.app.post('/api/summary/generate', this.generateMonthlySummary.bind(this));
    this.app.get('/api/revenue-by-source', this.getRevenueBySource.bind(this));

    // Error handling middleware
    this.app.use((err, req, res, next) => {
      console.error('Express error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  /**
   * Handle HouseCall Pro webhook events
   */
  async handleHouseCallWebhook(req, res) {
    try {
      const signature = req.headers['x-housecall-signature'];
      const payload = req.body;

      // Convert Buffer to string for signature verification
      const payloadString = Buffer.isBuffer(payload) ? payload.toString() : payload;

      // DEBUG: Log the raw payload from GHL
      console.log('=== RAW WEBHOOK PAYLOAD DEBUG ===');
      console.log('Headers:', JSON.stringify(req.headers, null, 2));
      console.log('Raw payload:', payloadString);
      console.log('Payload type:', typeof payload);
      console.log('=====================================');

      // Skip signature verification for GHL (since it won't have HCP signature)
      // if (process.env.HOUSECALL_PRO_WEBHOOK_SECRET && signature) {
      //   const isValid = this.hcp.verifyWebhookSignature(payloadString, signature);
      //   if (!isValid) {
      //     console.warn('Invalid HouseCall Pro webhook signature');
      //     return res.status(401).json({ error: 'Invalid signature' });
      //   }
      // }

      const webhookData = typeof payloadString === 'string' ? JSON.parse(payloadString) : payloadString;
      console.log('Parsed webhook data:', JSON.stringify(webhookData, null, 2));
      console.log('Event type:', webhookData.event_type);

      // Handle customer.created event (HCP format)
      if (webhookData.event_type === 'customer.created') {
        console.log('Processing HCP customer.created webhook');
        await this.processNewCustomer(webhookData);
      }
      // Handle GHL format (no event_type, but has contact_id and contact_type)
      else if (webhookData.contact_id && webhookData.contact_type === 'lead') {
        console.log('Processing GHL lead webhook');
        await this.processGHLLead(webhookData);
      }
      // Handle GHL format (contact_id exists, regardless of contact_type)
      else if (webhookData.contact_id) {
        console.log('Processing GHL webhook (contact_id detected)');
        await this.processGHLLead(webhookData);
      }
      else {
        console.log('Unrecognized webhook format - neither HCP nor GHL format detected');
        console.log('Available fields:', Object.keys(webhookData));
      }

      res.json({ message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('HouseCall Pro webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle QuickBooks webhook events
   */
  async handleQuickBooksWebhook(req, res) {
    try {
      const signature = req.headers['intuit-signature'];
      const payload = req.body;

      // Verify webhook signature
      if (process.env.QBO_WEBHOOK_VERIFIER_TOKEN) {
        const isValid = this.qbo.verifyWebhookSignature(payload, signature);
        if (!isValid) {
          console.warn('Invalid QuickBooks webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const webhookData = JSON.parse(payload);
      console.log('QuickBooks webhook received');

      // Handle payment events
      const paymentData = await this.qbo.handlePaymentReceived(webhookData);
      
      for (const payment of paymentData) {
        await this.processPaymentReceived(payment);
      }

      res.json({ message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('QuickBooks webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Process new customer from HouseCall Pro
   */
  async processNewCustomer(webhookData) {
    try {
      console.log('Processing new customer from HouseCall Pro');
      
      // Extract customer data from webhook
      const customerData = await this.hcp.handleCustomerCreated(webhookData);
      
      // Create lead record in Airtable
      const leadRecord = await this.airtable.createLead(customerData);
      
      console.log(`✅ New lead created in Airtable: ${customerData.name} (ID: ${leadRecord.id})`);
      
      return leadRecord;
    } catch (error) {
      console.error('Error processing new customer:', error);
      throw error;
    }
  }

  /**
   * Process new lead from Go High Level
   */
  async processGHLLead(webhookData) {
    try {
      console.log('Processing new lead from Go High Level');
      
      // Extract lead source from various possible locations
      let leadSource = 'Go High Level'; // default fallback
      
      // Check multiple possible locations for lead source
      const possibleSources = [
        webhookData['Housecall Pro Lead Source'], // GHL mapped field
        webhookData['Lead Source'], // Direct field
        webhookData['HCP Lead Source'], // Custom field  
        webhookData['lead_source'], // Snake case version
        webhookData.leadSource, // Direct property
        webhookData.source, // Alternative property
        webhookData.customData?.leadSource, // In custom data
        webhookData.customData?.source, // In custom data alternative
        webhookData.customData?.lead_source, // In custom data snake case
        webhookData.contact?.source, // In contact object
        webhookData.triggerData?.source, // In trigger data
        webhookData.contact?.attributionSource?.source, // Attribution source
        webhookData.contact?.attributionSource?.medium, // Attribution medium
        webhookData.attributionSource?.source, // Direct attribution
        webhookData.attributionSource?.medium // Direct attribution medium
      ];
      
      // Find the first non-empty, non-"Manual" source
      for (const source of possibleSources) {
        if (source && source !== 'Manual' && source !== 'CRM Workflows') {
          leadSource = source;
          break;
        }
      }
      
      // Enhanced debugging for lead source
      console.log('Lead source extraction debug:');
      console.log('- Available fields containing "Lead" or "Source":', Object.keys(webhookData).filter(key => 
        key.toLowerCase().includes('lead') || key.toLowerCase().includes('source')
      ));
      console.log('- All HCP-related fields:', Object.keys(webhookData).filter(key => 
        key.includes('HCP') || key.includes('hcp')
      ));
      console.log('- Custom data keys:', Object.keys(webhookData.customData || {}));
      console.log('- Trigger data keys:', Object.keys(webhookData.triggerData || {}));
      console.log('- Key field values:');
      console.log('  * Housecall Pro Lead Source:', webhookData['Housecall Pro Lead Source']);
      console.log('  * customData.lead_source:', webhookData.customData?.lead_source);
      console.log('  * HCP Tags:', webhookData['HCP Tags']);
      console.log('- Selected lead source:', leadSource);
      
      // Build complete address including apartment number
      let fullAddress = webhookData.full_address;
      if (!fullAddress) {
        const addressParts = [
          webhookData.address1,
          webhookData.address2, // apartment number
          webhookData.city,
          webhookData.state,
          webhookData.postal_code
        ].filter(Boolean);
        
        fullAddress = addressParts.join(', ');
      }
      
      // Extract tags from multiple possible locations
      const tagSources = [
        webhookData.tags,
        webhookData['HCP Tags'],
        webhookData.hcp_tags,
        webhookData.customData?.tags,
        webhookData.contact?.tags
      ].filter(Boolean).filter(tag => tag !== '');
      
      const allTags = tagSources.length > 0 ? tagSources : [];
      
      console.log('Address debug:');
      console.log('- address1:', webhookData.address1);
      console.log('- address2:', webhookData.address2);
      console.log('- full_address:', webhookData.full_address);
      console.log('- Final address:', fullAddress);
      
      console.log('Tags debug:');
      console.log('- tags field:', webhookData.tags);
      console.log('- HCP Tags field:', webhookData['HCP Tags']);
      console.log('- Final tags:', allTags);
      
      // Transform GHL data to our expected format
      const customerData = {
        id: webhookData.contact_id,
        name: webhookData.full_name || `${webhookData.first_name || ''} ${webhookData.last_name || ''}`.trim(),
        firstName: webhookData.first_name,
        lastName: webhookData.last_name,
        email: webhookData.email,
        phone: webhookData.phone,
        address: fullAddress,
        leadSource: leadSource,
        dateCreated: webhookData.date_created,
        tags: allTags,
        notes: webhookData['HCP Notes'] || ''
      };
      
      console.log(`Transformed GHL lead: ${customerData.name} (${customerData.email})`);
      
      // Create lead record in Airtable using the same method
      const leadRecord = await this.airtable.createLead(customerData);
      
      console.log(`✅ New GHL lead created in Airtable: ${customerData.name} (ID: ${leadRecord.id})`);
      
      return leadRecord;
    } catch (error) {
      console.error('Error processing GHL lead:', error);
      throw error;
    }
  }

  /**
   * Process payment received from QuickBooks
   */
  async processPaymentReceived(paymentData) {
    try {
      console.log(`Processing payment: ${paymentData.customerName} - ${Utils.formatCurrency(paymentData.amount)}`);
      
      // Find matching lead in Airtable using fuzzy matching
      const matchingLead = await this.airtable.findLeadByName(
        paymentData.customerName,
        parseFloat(process.env.FUZZY_MATCH_THRESHOLD) || 0.8
      );
      
      if (matchingLead) {
        // Update lead with payment information
        const updatedLead = await this.airtable.updateLeadPayment(
          matchingLead.id,
          paymentData
        );
        
        console.log(`✅ Payment updated for lead: ${paymentData.customerName} (ID: ${matchingLead.id})`);
        return updatedLead;
      } else {
        console.warn(`⚠️  No matching lead found for customer: ${paymentData.customerName}`);
        
        // Log for manual review
        console.log('Payment data for manual review:', {
          customerName: paymentData.customerName,
          amount: paymentData.amount,
          paymentDate: paymentData.paymentDate,
          invoiceNumber: paymentData.invoiceNumber
        });
        
        return null;
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Generate monthly summary report
   */
  async generateMonthlySummary(req, res) {
    try {
      const { month, year } = req.body;
      
      if (!month || !year) {
        return res.status(400).json({ error: 'Month and year are required' });
      }
      
      console.log(`Generating monthly summary for ${month}/${year}`);
      
      // Get leads with payments for the month
      const leads = await this.airtable.getLeadsByMonth(parseInt(month), parseInt(year));
      
      // Get expense data from QuickBooks
      const expenses = await this.qbo.getMonthlyExpenses(parseInt(month), parseInt(year));
      
      // Aggregate revenue by lead source
      const revenueBySource = this.airtable.aggregateRevenueBySource(leads);
      
      // Calculate totals
      const totalRevenue = leads.reduce((sum, lead) => {
        return sum + (parseFloat(lead.fields['Payment Amount']) || 0);
      }, 0);
      
      const summaryData = {
        month: parseInt(month),
        year: parseInt(year),
        totalRevenue,
        totalAdSpend: expenses.adSpend,
        totalPromoSpend: expenses.promoSpend,
        customerCount: leads.length,
        averageRevenuePerCustomer: leads.length > 0 ? totalRevenue / leads.length : 0,
        revenueBySource
      };
      
      // Store summary in Airtable
      const summaryRecord = await this.airtable.createMonthlySummary(summaryData);
      
      console.log(`✅ Monthly summary generated for ${month}/${year}`);
      
      res.json({
        message: 'Monthly summary generated successfully',
        data: summaryData,
        recordId: summaryRecord.id
      });
    } catch (error) {
      console.error('Error generating monthly summary:', error);
      res.status(500).json({ error: 'Failed to generate monthly summary' });
    }
  }

  /**
   * Get leads with optional filtering
   */
  async getLeads(req, res) {
    try {
      const { startDate, endDate, leadSource, paymentStatus } = req.query;
      
      // This would need custom filtering logic in the AirtableAPI class
      const leads = await this.airtable.getLeadsWithPayments(startDate, endDate);
      
      // Apply additional filters
      let filteredLeads = leads;
      
      if (leadSource) {
        filteredLeads = filteredLeads.filter(lead => 
          lead.fields['Lead Source'] === leadSource
        );
      }
      
      if (paymentStatus) {
        filteredLeads = filteredLeads.filter(lead => 
          lead.fields['Payment Status'] === paymentStatus
        );
      }
      
      res.json({
        leads: filteredLeads,
        total: filteredLeads.length
      });
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ error: 'Failed to fetch leads' });
    }
  }

  /**
   * Get monthly summary by year and month
   */
  async getMonthlySummary(req, res) {
    try {
      const { year, month } = req.params;
      
      // This would require a method to fetch existing summary from Airtable
      // For now, return a placeholder response
      res.json({
        message: `Monthly summary for ${month}/${year}`,
        // Add actual summary retrieval logic here
      });
    } catch (error) {
      console.error('Error fetching monthly summary:', error);
      res.status(500).json({ error: 'Failed to fetch monthly summary' });
    }
  }

  /**
   * Get revenue aggregated by lead source
   */
  async getRevenueBySource(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      const leads = await this.airtable.getLeadsWithPayments(startDate, endDate);
      const revenueBySource = this.airtable.aggregateRevenueBySource(leads);
      
      res.json({
        revenueBySource,
        totalRevenue: Object.values(revenueBySource).reduce((sum, source) => sum + source.totalRevenue, 0),
        period: { startDate, endDate }
      });
    } catch (error) {
      console.error('Error fetching revenue by source:', error);
      res.status(500).json({ error: 'Failed to fetch revenue by source' });
    }
  }

  /**
   * Start the Express server
   */
  start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 Lead-to-Revenue Tracker started on port ${this.port}`);
      console.log(`📊 Health check: http://localhost:${this.port}/health`);
      console.log(`🔗 QuickBooks auth: http://localhost:${this.port}/auth/quickbooks`);
      console.log(`📥 HouseCall Pro webhook: http://localhost:${this.port}/webhooks/housecall`);
      console.log(`📥 QuickBooks webhook: http://localhost:${this.port}/webhooks/quickbooks`);
    });
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  const tracker = new LeadToRevenueTracker();
  tracker.start();
}

module.exports = LeadToRevenueTracker;