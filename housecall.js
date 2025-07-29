const axios = require('axios');
require('dotenv').config();

class HouseCallProAPI {
  constructor() {
    this.apiKey = process.env.HOUSECALL_PRO_API_KEY;
    this.baseURL = 'https://api.housecallpro.com/v1';
    this.webhookSecret = process.env.HOUSECALL_PRO_WEBHOOK_SECRET;
    
    if (!this.apiKey) {
      throw new Error('HOUSECALL_PRO_API_KEY is required');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Verify webhook signature for security
   * @param {string} payload - Raw request body
   * @param {string} signature - Signature from request headers
   * @returns {boolean} - Whether signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    // Implementation depends on HouseCall Pro's signature method
    // This is a placeholder - check HCP documentation for actual implementation
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  /**
   * Get customer details by ID
   * @param {string} customerId - HouseCall Pro customer ID
   * @returns {Object} Customer data
   */
  async getCustomer(customerId) {
    try {
      const response = await this.client.get(`/customers/${customerId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer from HouseCall Pro:', error);
      throw error;
    }
  }

  /**
   * Get all customers with pagination
   * @param {Object} options - Query options (page, per_page, etc.)
   * @returns {Object} Customers data with pagination info
   */
  async getCustomers(options = {}) {
    try {
      const params = {
        page: options.page || 1,
        per_page: options.per_page || 50,
        ...options
      };
      
      const response = await this.client.get('/customers', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching customers from HouseCall Pro:', error);
      throw error;
    }
  }

  /**
   * Extract customer data from webhook payload
   * @param {Object} webhookPayload - Webhook event payload
   * @returns {Object} Normalized customer data
   */
  extractCustomerFromWebhook(webhookPayload) {
    const customer = webhookPayload.data || webhookPayload.customer;
    
    if (!customer) {
      throw new Error('Invalid webhook payload: customer data not found');
    }

    return {
      id: customer.id,
      name: customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone || customer.mobile_number,
      address: customer.address,
      leadSource: customer.lead_source || customer.tags?.find(tag => tag.includes('source')) || 'Unknown',
      dateCreated: customer.created_at || new Date().toISOString(),
      tags: customer.tags || [],
      notes: customer.notes
    };
  }

  /**
   * Handle customer.created webhook event
   * @param {Object} webhookPayload - Webhook event data
   * @returns {Object} Processed customer data
   */
  async handleCustomerCreated(webhookPayload) {
    try {
      console.log('Processing customer.created webhook from HouseCall Pro');
      
      const customerData = this.extractCustomerFromWebhook(webhookPayload);
      
      // Log the event
      console.log(`New customer created: ${customerData.name} (${customerData.email})`);
      
      return customerData;
    } catch (error) {
      console.error('Error handling customer.created webhook:', error);
      throw error;
    }
  }

  /**
   * Get lead sources from HouseCall Pro
   * @returns {Array} Array of lead sources
   */
  async getLeadSources() {
    try {
      // This endpoint may vary - check HCP API documentation
      const response = await this.client.get('/lead_sources');
      return response.data;
    } catch (error) {
      console.error('Error fetching lead sources from HouseCall Pro:', error);
      // Return empty array if endpoint doesn't exist
      return [];
    }
  }

  /**
   * Search customers by name or email
   * @param {string} query - Search query
   * @returns {Array} Array of matching customers
   */
  async searchCustomers(query) {
    try {
      const response = await this.client.get('/customers', {
        params: {
          search: query,
          per_page: 10
        }
      });
      
      return response.data.customers || response.data;
    } catch (error) {
      console.error('Error searching customers in HouseCall Pro:', error);
      throw error;
    }
  }
}

module.exports = HouseCallProAPI;