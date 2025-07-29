const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const HouseCallProAPI = require('../../src/lib/housecall');
const AirtableAPI = require('../../src/lib/airtable');
const QuickBooksAPI = require('../../src/lib/quickbooks');
const Utils = require('../../src/lib/utils');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize API clients
const hcp = new HouseCallProAPI();
const airtable = new AirtableAPI();
const qbo = new QuickBooksAPI();

/**
 * Process new lead from Go High Level
 */
async function processGHLLead(webhookData) {
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
    const leadRecord = await airtable.createLead(customerData);
    
    console.log(`✅ New GHL lead created in Airtable: ${customerData.name} (ID: ${leadRecord.id})`);
    
    return leadRecord;
  } catch (error) {
    console.error('Error processing GHL lead:', error);
    throw error;
  }
}

/**
 * Process new customer from HouseCall Pro (direct format)
 */
async function processNewCustomer(webhookData) {
  try {
    console.log('Processing new customer from HouseCall Pro');
    
    // Extract customer data from webhook
    const customerData = await hcp.handleCustomerCreated(webhookData);
    
    // Create lead record in Airtable
    const leadRecord = await airtable.createLead(customerData);
    
    console.log(`✅ New lead created in Airtable: ${customerData.name} (ID: ${leadRecord.id})`);
    
    return leadRecord;
  } catch (error) {
    console.error('Error processing new customer:', error);
    throw error;
  }
}

/**
 * Process payment received from QuickBooks
 */
async function processPaymentReceived(paymentData) {
  try {
    console.log(`Processing payment: ${paymentData.customerName} - ${Utils.formatCurrency(paymentData.amount)}`);
    
    // Find matching lead in Airtable using fuzzy matching
    const matchingLead = await airtable.findLeadByName(
      paymentData.customerName,
      parseFloat(process.env.FUZZY_MATCH_THRESHOLD) || 0.8
    );
    
    if (matchingLead) {
      // Update lead with payment information
      const updatedLead = await airtable.updateLeadPayment(
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

// HouseCall Pro webhook handler (via GHL)
app.post('/hcp-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-housecall-signature'];
    const payload = req.body;

    // Convert Buffer to string for signature verification
    const payloadString = Buffer.isBuffer(payload) ? payload.toString() : JSON.stringify(payload);

    // DEBUG: Log the raw payload from GHL
    console.log('=== RAW WEBHOOK PAYLOAD DEBUG ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw payload:', payload);
    console.log('Payload type:', typeof payload);
    console.log('=====================================');

    const webhookData = typeof payload === 'object' ? payload : JSON.parse(payloadString);
    console.log('Parsed webhook data:', JSON.stringify(webhookData, null, 2));
    console.log('Event type:', webhookData.event_type);

    // Handle customer.created event (HCP format)
    if (webhookData.event_type === 'customer.created') {
      console.log('Processing HCP customer.created webhook');
      await processNewCustomer(webhookData);
    }
    // Handle GHL format (no event_type, but has contact_id and contact_type)
    else if (webhookData.contact_id && webhookData.contact_type === 'lead') {
      console.log('Processing GHL lead webhook');
      await processGHLLead(webhookData);
    }
    // Handle GHL format (contact_id exists, regardless of contact_type)
    else if (webhookData.contact_id) {
      console.log('Processing GHL webhook (contact_id detected)');
      await processGHLLead(webhookData);
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
});

// QuickBooks webhook handler
app.post('/qbo-webhook', async (req, res) => {
  try {
    const signature = req.headers['intuit-signature'];
    const payload = req.body;

    // Verify webhook signature
    if (process.env.QBO_WEBHOOK_VERIFIER_TOKEN) {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const isValid = qbo.verifyWebhookSignature(payloadString, signature);
      if (!isValid) {
        console.warn('Invalid QuickBooks webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const webhookData = typeof payload === 'object' ? payload : JSON.parse(payload);
    console.log('QuickBooks webhook received');

    // Handle payment events
    const paymentData = await qbo.handlePaymentReceived(webhookData);
    
    for (const payment of paymentData) {
      await processPaymentReceived(payment);
    }

    res.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('QuickBooks webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
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

// Export handler for Netlify
exports.handler = serverless(app);