const QuickBooks = require('node-quickbooks');
const OAuthClient = require('intuit-oauth');
const axios = require('axios');
const AirtableAPI = require('./airtable');
require('dotenv').config();

class QuickBooksAPI {
  constructor() {
    this.clientId = process.env.QBO_CLIENT_ID;
    this.clientSecret = process.env.QBO_CLIENT_SECRET;
    this.sandbox = process.env.QBO_SANDBOX === 'true';
    this.redirectUri = process.env.QBO_REDIRECT_URI;
    this.webhookVerifierToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
    this.airtable = new AirtableAPI();
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('QBO_CLIENT_ID and QBO_CLIENT_SECRET are required');
    }
    
    // Initialize OAuth client
    this.oAuthClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      sandbox: this.sandbox,
      redirectUri: this.redirectUri
    });
    
    this.qbo = null;
    this.companyId = null;
    this.accessToken = null;
    this.refreshToken = null;
  }

  /**
   * Get OAuth authorization URL
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl() {
    // Build OAuth URL manually - try multiple scope formats
    const baseUrl = 'https://appcenter.intuit.com/app/connect/oauth2';
    
    // Try the correct QuickBooks scope values
    const authUri = `${baseUrl}?client_id=${encodeURIComponent(this.clientId)}&scope=${encodeURIComponent('com.intuit.quickbooks.accounting')}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&state=testState`;
    
    console.log('Visit this URL to authorize the application (MAIN):');
    console.log(authUri);
    
    // Try the space-separated scope format that QuickBooks expects
    const correctScope = `${baseUrl}?client_id=${encodeURIComponent(this.clientId)}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&state=testState`;
    console.log('\nTRY THIS ONE (unencoded scope):');
    console.log(correctScope);
    
    // Try with multiple scopes space-separated
    const multiScope = `${baseUrl}?client_id=${encodeURIComponent(this.clientId)}&scope=com.intuit.quickbooks.accounting%20com.intuit.quickbooks.payment&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&state=testState`;
    console.log('\nAlternative (with payment scope):');
    console.log(multiScope);
    
    return authUri;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} authCode - Authorization code from callback
   * @param {string} realmId - Company ID from callback
   */
  async exchangeCodeForTokens(authCode, realmId) {
    try {
      // Manual token exchange since intuit-oauth library has issues
      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
      
      const requestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.redirectUri
      });
      
      const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(tokenUrl, requestBody.toString(), {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
      });
      
      const authResponse = {
        token: {
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
          token_type: response.data.token_type,
          expires_in: response.data.expires_in
        }
      };
      
      this.accessToken = authResponse.token.access_token;
      this.refreshToken = authResponse.token.refresh_token;
      this.companyId = realmId;
      
      // Save tokens to Airtable
      await this.airtable.saveOAuthTokens({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        companyId: this.companyId,
        expiresIn: authResponse.token.expires_in || 3600
      });
      
      // Skip QuickBooks client initialization for now - we'll initialize it when needed
      this.qbo = null;
      
      console.log('QuickBooks authentication successful');
      console.log(`Company ID: ${this.companyId}`);
      console.log(`Access Token: ${this.accessToken ? 'Set' : 'Not set'}`);
      
      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        companyId: this.companyId
      };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const authResponse = await this.oAuthClient.refreshUsingToken(this.refreshToken);
      
      this.accessToken = authResponse.token.access_token;
      this.refreshToken = authResponse.token.refresh_token;
      
      // Reinitialize QuickBooks client with new token
      this.qbo = new QuickBooks(
        this.clientId,
        this.clientSecret,
        this.accessToken,
        '',
        this.companyId,
        this.sandbox
      );
      
      console.log('Access token refreshed successfully');
      
      return this.accessToken;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }

  /**
   * Initialize with existing tokens
   * @param {Object} tokens - Object containing accessToken, refreshToken, and companyId
   */
  initializeWithTokens(tokens) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.companyId = tokens.companyId;
    
    this.qbo = new QuickBooks(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      '',
      this.companyId,
      this.sandbox
    );
    
    console.log('QuickBooks client initialized with existing tokens');
  }

  /**
   * Verify webhook payload
   * @param {string} payload - Raw request body
   * @param {string} signature - Signature from request headers
   * @returns {boolean} Whether signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookVerifierToken)
      .update(payload)
      .digest('base64');
    
    return signature === expectedSignature;
  }

  /**
   * Handle payment received webhook
   * @param {Object} webhookPayload - Webhook event data
   * @returns {Object} Processed payment data
   */
  async handlePaymentReceived(webhookPayload) {
    try {
      console.log('Processing payment.received webhook from QuickBooks');
      
      const eventNotifications = webhookPayload.eventNotifications;
      const paymentData = [];
      
      for (const notification of eventNotifications) {
        for (const dataChangeEvent of notification.dataChangeEvent.entities) {
          if (dataChangeEvent.name === 'Payment') {
            const paymentId = dataChangeEvent.id;
            const payment = await this.getPayment(paymentId);
            
            if (payment) {
              paymentData.push(await this.extractPaymentData(payment));
            }
          }
        }
      }
      
      return paymentData;
    } catch (error) {
      console.error('Error handling payment webhook:', error);
      throw error;
    }
  }

  /**
   * Get payment details by ID
   * @param {string} paymentId - QuickBooks payment ID
   * @returns {Object} Payment data
   */
  async getPayment(paymentId) {
    return new Promise((resolve, reject) => {
      if (!this.qbo) {
        reject(new Error('QuickBooks client not initialized'));
        return;
      }
      
      this.qbo.getPayment(paymentId, (err, payment) => {
        if (err) {
          console.error('Error fetching payment from QuickBooks:', err);
          reject(err);
        } else {
          resolve(payment);
        }
      });
    });
  }

  /**
   * Extract payment data for Airtable
   * @param {Object} payment - QuickBooks payment object
   * @returns {Object} Normalized payment data
   */
  async extractPaymentData(payment) {
    try {
      const customer = await this.getCustomer(payment.CustomerRef.value);
      const invoice = payment.Line && payment.Line[0] && payment.Line[0].LinkedTxn 
        ? await this.getInvoice(payment.Line[0].LinkedTxn[0].TxnId)
        : null;
      
      return {
        id: payment.Id,
        customerId: payment.CustomerRef.value,
        customerName: customer ? customer.Name : 'Unknown Customer',
        amount: parseFloat(payment.TotalAmt),
        paymentDate: payment.TxnDate,
        invoiceNumber: invoice ? invoice.DocNumber : null,
        referenceNumber: payment.PaymentRefNum,
        paymentMethod: payment.PaymentMethodRef?.name || 'Unknown'
      };
    } catch (error) {
      console.error('Error extracting payment data:', error);
      // Return basic data even if customer/invoice lookup fails
      return {
        id: payment.Id,
        customerId: payment.CustomerRef?.value,
        customerName: payment.CustomerRef?.name || 'Unknown Customer',
        amount: parseFloat(payment.TotalAmt),
        paymentDate: payment.TxnDate,
        invoiceNumber: null,
        referenceNumber: payment.PaymentRefNum,
        paymentMethod: payment.PaymentMethodRef?.name || 'Unknown'
      };
    }
  }

  /**
   * Get customer details by ID
   * @param {string} customerId - QuickBooks customer ID
   * @returns {Object} Customer data
   */
  async getCustomer(customerId) {
    return new Promise((resolve, reject) => {
      if (!this.qbo) {
        reject(new Error('QuickBooks client not initialized'));
        return;
      }
      
      this.qbo.getCustomer(customerId, (err, customer) => {
        if (err) {
          console.error('Error fetching customer from QuickBooks:', err);
          resolve(null); // Don't reject, just return null
        } else {
          resolve(customer);
        }
      });
    });
  }

  /**
   * Get invoice details by ID
   * @param {string} invoiceId - QuickBooks invoice ID
   * @returns {Object} Invoice data
   */
  async getInvoice(invoiceId) {
    return new Promise((resolve, reject) => {
      if (!this.qbo) {
        reject(new Error('QuickBooks client not initialized'));
        return;
      }
      
      this.qbo.getInvoice(invoiceId, (err, invoice) => {
        if (err) {
          console.error('Error fetching invoice from QuickBooks:', err);
          resolve(null); // Don't reject, just return null
        } else {
          resolve(invoice);
        }
      });
    });
  }

  /**
   * Initialize QuickBooks client with stored tokens
   * @returns {boolean} Whether initialization was successful
   */
  async initializeFromStoredTokens() {
    try {
      const tokenData = await this.airtable.getOAuthTokens('QuickBooks');
      
      if (!tokenData) {
        console.log('No stored QuickBooks tokens found');
        return false;
      }
      
      // Check if token is expired
      const expiresAt = new Date(tokenData.expiresAt);
      const now = new Date();
      
      if (expiresAt <= now) {
        console.log('Access token expired, refreshing...');
        return await this.refreshStoredToken(tokenData);
      }
      
      // Initialize with stored tokens
      this.accessToken = tokenData.accessToken;
      this.refreshToken = tokenData.refreshToken;
      this.companyId = tokenData.companyId;
      
      this.qbo = new QuickBooks(
        this.clientId,
        this.clientSecret,
        this.accessToken,
        false, // no token secret for OAuth2
        this.companyId,
        this.sandbox
      );
      
      console.log('QuickBooks client initialized from stored tokens');
      return true;
    } catch (error) {
      console.error('Error initializing from stored tokens:', error);
      return false;
    }
  }

  /**
   * Refresh expired token
   * @param {Object} tokenData - Current token data
   * @returns {boolean} Whether refresh was successful
   */
  async refreshStoredToken(tokenData) {
    try {
      this.oAuthClient.refreshToken = tokenData.refreshToken;
      
      const authResponse = await this.oAuthClient.refresh();
      const token = authResponse.getToken();
      
      // Save new tokens
      await this.airtable.saveOAuthTokens({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        companyId: tokenData.companyId,
        expiresIn: token.expires_in
      });
      
      // Initialize with new tokens
      this.accessToken = token.access_token;
      this.refreshToken = token.refresh_token;
      this.companyId = tokenData.companyId;
      
      this.qbo = new QuickBooks(
        this.clientId,
        this.clientSecret,
        this.accessToken,
        false,
        this.companyId,
        this.sandbox
      );
      
      console.log('QuickBooks tokens refreshed successfully');
      return true;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  /**
   * Get expenses for ad spend and promo spend calculation
   * @param {Object} params - Query parameters
   * @returns {Array} Array of expense transactions
   */
  async getExpensesByCategory(params) {
    const { startDate, endDate, categories = ['Advertising', 'Marketing'] } = params;
    
    return new Promise((resolve, reject) => {
      if (!this.qbo) {
        reject(new Error('QuickBooks client not initialized'));
        return;
      }
      
      // Query for Purchase transactions (expenses) in the date range
      const query = {
        start_date: startDate,
        end_date: endDate,
        limit: 1000
      };
      
      this.qbo.findPurchases(query, (err, purchases) => {
        if (err) {
          console.error('Error fetching expenses from QuickBooks:', err);
          reject(err);
          return;
        }
        
        const allPurchases = purchases.QueryResponse?.Purchase || [];
        
        // Filter purchases by account categories
        const filteredPurchases = allPurchases.filter(purchase => {
          const accountName = purchase.AccountRef?.name || '';
          const lineAccountNames = purchase.Line?.map(line => line.AccountRef?.name || '') || [];
          
          // Check if main account or any line item account matches our categories
          const allAccountNames = [accountName, ...lineAccountNames];
          
          return allAccountNames.some(name => 
            categories.some(category => 
              name.toLowerCase().includes(category.toLowerCase())
            )
          );
        });
        
        console.log(`Found ${filteredPurchases.length} expenses matching categories:`, categories);
        resolve(filteredPurchases);
      });
    });
  }

  /**
   * Get monthly expense totals for ad spend and promo spend
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @returns {Object} Monthly expense totals
   */
  async getMonthlyExpenses(month, year) {
    try {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      const expenses = await this.getExpensesByCategory(startDate, endDate);
      
      return {
        month,
        year,
        adSpend: expenses.advertising,
        promoSpend: expenses.promotional,
        totalSpend: expenses.advertising + expenses.promotional
      };
    } catch (error) {
      console.error('Error getting monthly expenses:', error);
      // Return zeros if unable to fetch expenses
      return {
        month,
        year,
        adSpend: 0,
        promoSpend: 0,
        totalSpend: 0
      };
    }
  }

  /**
   * Search customers by name
   * @param {string} customerName - Customer name to search for
   * @returns {Array} Array of matching customers
   */
  async searchCustomers(customerName) {
    return new Promise((resolve, reject) => {
      if (!this.qbo) {
        reject(new Error('QuickBooks client not initialized'));
        return;
      }
      
      const query = `SELECT * FROM Customer WHERE Name LIKE '%${customerName}%'`;
      
      this.qbo.findCustomers(query, (err, customers) => {
        if (err) {
          console.error('Error searching customers in QuickBooks:', err);
          reject(err);
        } else {
          resolve(customers || []);
        }
      });
    });
  }
}

module.exports = QuickBooksAPI;