# Lead-to-Revenue Tracker

A **serverless Node.js automation** deployed on **Netlify** that connects **HouseCall Pro** → **Go High Level** → **Airtable** → **QuickBooks Online** to track leads from creation to revenue generation.

## 🎯 What It Does

1. **🏠 HouseCall Pro Integration (via Go High Level)**
   - Receives webhook payloads from Go High Level containing HCP lead data
   - Captures customer name, email, phone, **correct lead source** (Box Trucks, Google Ads, etc.), and creation date
   - Automatically creates new lead records in Airtable with proper date formatting

2. **💰 QuickBooks Online Integration**
   - Listens for `payment.received` webhook events
   - Captures payment amount, customer name, and invoice details
   - Uses fuzzy matching to link payments to existing leads in Airtable
   - Updates payment status and amount

3. **📊 Monthly Reporting**
   - Aggregates revenue totals by lead source
   - Pulls ad spend and promotional expenses from QuickBooks
   - Generates comprehensive monthly summaries with ROI calculations

## 🚀 Deployment Options

### Option 1: Netlify Serverless (Recommended)

#### Prerequisites
- GitHub account
- Netlify account
- Accounts with HouseCall Pro, Airtable, and QuickBooks Online

#### Quick Deploy to Netlify

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/lead-to-revenue-tracker.git
   git push -u origin main
   ```

2. **Deploy to Netlify**
   - Go to [Netlify](https://netlify.com) and login
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository
   - Build settings are automatically detected from `netlify.toml`
   - Click "Deploy site"

3. **Configure Environment Variables**
   
   In Netlify dashboard → Site settings → Environment variables, add:
   ```env
   # Airtable Configuration
   AIRTABLE_API_KEY=patykEJ97yTfLaOLi.2b37309baf4fae39cf2426bef276b9fc67fe695e745db0fcccef936a1fb46e9d
   AIRTABLE_BASE_ID=appxYZF1D0Hq44EKw
   AIRTABLE_LEADS_TABLE_NAME=HCP Leads
   AIRTABLE_MONTHLY_SUMMARY_TABLE_NAME=Monthly Summary

   # QuickBooks Online Configuration
   QBO_CLIENT_ID=ABZrV595pwlAy340OkQmQBs6AcK8QHdUQ4Re2rSC0rrUvKfEVq
   QBO_CLIENT_SECRET=qFm6ZZSi2uiRQ7jxR5AFbWZDimEZR5MQR8uHqzoO
   QBO_SANDBOX=true
   QBO_REDIRECT_URI=https://your-site.netlify.app/.netlify/functions/auth-quickbooks/callback
   QBO_WEBHOOK_VERIFIER_TOKEN=2b09544f-9549-45e0-a5bc-472c69a7012d

   # HouseCall Pro Configuration (optional - using GHL integration)
   HOUSECALL_PRO_API_KEY=your_housecall_pro_api_key_here
   HOUSECALL_PRO_WEBHOOK_SECRET=your_housecall_pro_webhook_secret_here

   # Application Settings
   FUZZY_MATCH_THRESHOLD=0.8
   NODE_ENV=production
   ```

4. **Update Webhook URLs**
   
   After deployment, update your Go High Level workflow webhook URL to:
   ```
   https://your-site.netlify.app/.netlify/functions/webhook/hcp-webhook
   ```

   Update QuickBooks Developer Console redirect URI to:
   ```
   https://your-site.netlify.app/.netlify/functions/auth-quickbooks/callback
   ```

#### Netlify Function Endpoints

Once deployed, your endpoints will be:

- **Health Check**: `https://your-site.netlify.app/.netlify/functions/health`
- **HCP Webhook**: `https://your-site.netlify.app/.netlify/functions/webhook/hcp-webhook`  
- **QBO Webhook**: `https://your-site.netlify.app/.netlify/functions/webhook/qbo-webhook`
- **QuickBooks Auth**: `https://your-site.netlify.app/.netlify/functions/auth-quickbooks/authorize`

### Option 2: Local Development

#### Installation

1. **Clone and setup**
   ```bash
   git clone <your-repo-url>
   cd lead-to-revenue-tracker
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your API credentials (same as above)

#### Development Scripts

```bash
# Option A: Original monolithic server (port 3000)
npm start                 # Production mode
npm run dev              # Development with auto-reload

# Option B: Local serverless development
npm run local-dev        # Test serverless functions locally
npm run netlify:dev      # Full Netlify CLI development environment
```

#### Local Development URLs

When running locally, your endpoints are:
- **Health Check**: `http://localhost:3000/health`
- **HCP Webhook**: `http://localhost:3000/webhooks/housecall` (legacy) or `http://localhost:3000/.netlify/functions/webhook/hcp-webhook`
- **QBO Webhook**: `http://localhost:3000/webhooks/quickbooks`
- **QuickBooks Auth**: `http://localhost:3000/auth/quickbooks`

## 🔧 Architecture

### Serverless Functions (`/netlify/functions/`)
- **`webhook.js`** - Main webhook handler for HCP and QBO events
- **`auth-quickbooks.js`** - QuickBooks OAuth flow handler  
- **`health.js`** - Service health monitoring

### Core Libraries (`/src/lib/`)
- **`airtable.js`** - Airtable API integration with lead creation and fuzzy matching
- **`quickbooks.js`** - QuickBooks OAuth and API integration
- **`housecall.js`** - HouseCall Pro webhook signature verification
- **`utils.js`** - Utility functions for data processing

## 🎮 How It Works

### 1. Lead Creation Flow
```
HouseCall Pro → Go High Level → Webhook → Airtable
```

When a customer is created in HouseCall Pro:
1. HCP sends data to Go High Level workflow
2. GHL transforms and sends webhook to your Netlify function
3. Function processes webhook and extracts:
   - Customer name, email, phone
   - **Correct lead source** (Box Trucks, Google Ads, etc.)
   - Address and notes
4. Creates new record in Airtable "HCP Leads" table

### 2. Payment Processing Flow
```
QuickBooks Online → Webhook → Fuzzy Match → Airtable Update
```

When a payment is received in QuickBooks:
1. QBO sends webhook to your Netlify function  
2. Function extracts payment data and customer name
3. Uses fuzzy matching to find corresponding lead in Airtable
4. Updates lead record with payment amount and status

### 3. Monthly Reporting
```
Airtable + QuickBooks → Aggregated Reports
```

Generate monthly summaries via API endpoints or scheduled functions.

## 🛠️ Configuration

### Airtable Setup
Create tables with these exact field names:

**HCP Leads Table:**
- Customer Name (Single line text)
- Email (Email)
- Phone (Phone number)  
- Lead Source (Single line text)
- Date Created (Date)
- Payment Status (Single select: Pending, Paid)
- Payment Amount (Currency)
- Address (Long text)
- Notes (Long text)
- Tags (Long text)

### Go High Level Setup
Configure your GHL workflow to:
1. Map HCP lead source to "Housecall Pro Lead Source" field
2. Include customer contact details (name, email, phone, address)
3. Send webhook POST request to your Netlify function URL

### QuickBooks Online Setup
1. Create app in QuickBooks Developer Console
2. Configure OAuth redirect URI to your Netlify function
3. Set up webhook subscription for Payment events

## 🔍 Monitoring & Debugging

### Health Checks
Monitor service status:
- **Netlify**: `https://your-site.netlify.app/.netlify/functions/health`
- **Local**: `http://localhost:3000/health`

### Logs
- **Netlify**: View function logs in Netlify dashboard
- **Local**: Console output shows detailed webhook processing

### Common Issues
1. **Lead source shows "Go High Level"**: Check GHL workflow mapping
2. **Webhook not firing**: Verify URLs and ngrok/Netlify deployment
3. **Date format errors**: Ensure proper ISO date handling in webhook payload

## 📈 Success Metrics

The system successfully:
- ✅ Processes GHL webhook payloads with correct lead source extraction
- ✅ Creates Airtable records with proper date formatting  
- ✅ Handles QuickBooks OAuth authentication flow
- ✅ Performs fuzzy matching for payment-to-lead correlation
- ✅ Supports both local development and serverless deployment

## 🚀 Production Deployment Checklist

- [ ] Push code to GitHub repository
- [ ] Deploy to Netlify and configure environment variables
- [ ] Update GHL webhook URL to Netlify function
- [ ] Update QuickBooks OAuth redirect URI
- [ ] Test webhook with real HCP lead creation
- [ ] Verify QuickBooks OAuth flow in production
- [ ] Monitor function logs for errors
- [ ] Set up Netlify form notifications for errors (optional)

## 📝 Environment Variables Reference

```env
# Required for Airtable integration
AIRTABLE_API_KEY=your_personal_access_token
AIRTABLE_BASE_ID=your_base_id  
AIRTABLE_LEADS_TABLE_NAME=HCP Leads

# Required for QuickBooks integration
QBO_CLIENT_ID=your_app_client_id
QBO_CLIENT_SECRET=your_app_secret
QBO_REDIRECT_URI=https://your-site.netlify.app/.netlify/functions/auth-quickbooks/callback

# Optional - for direct HCP integration
HOUSECALL_PRO_API_KEY=your_api_key
HOUSECALL_PRO_WEBHOOK_SECRET=your_webhook_secret

# Application settings
FUZZY_MATCH_THRESHOLD=0.8
NODE_ENV=production
```

---

🎉 **Your Lead-to-Revenue Tracker is now ready for serverless deployment!**