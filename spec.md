# Lead-to-Revenue Tracker - Netlify Serverless Deployment Specification

## Project Overview
Restructure the existing Node.js Lead-to-Revenue Tracker to be fully deployable to Netlify as serverless functions, maintaining all current functionality while adding cloud deployment capabilities.

## Current State
- ✅ Working HouseCall Pro → Go High Level → Airtable integration
- ✅ QuickBooks OAuth authentication
- ✅ Webhook processing with proper lead source mapping
- ✅ Airtable record creation with date formatting
- ✅ Fuzzy matching for payment updates

## Target Architecture

### Directory Structure
```
lead-to-revenue-tracker/
├── netlify/
│   └── functions/
│       ├── webhook.js          # Main serverless function
│       ├── auth-quickbooks.js  # QuickBooks OAuth handler
│       └── health.js           # Health check endpoint
├── src/
│   ├── lib/
│   │   ├── airtable.js        # Airtable API integration
│   │   ├── quickbooks.js      # QuickBooks API integration
│   │   ├── housecall.js       # HouseCall Pro integration
│   │   └── utils.js           # Utility functions
│   └── middleware/
│       └── cors.js            # CORS handling for serverless
├── package.json               # Dependencies and scripts
├── netlify.toml              # Netlify configuration
├── .env.example              # Environment template
├── .gitignore               # Git ignore rules
├── README.md                # Deployment instructions
└── local-dev.js             # Local development server
```

## Serverless Function Requirements

### 1. Main Webhook Function (`/netlify/functions/webhook.js`)
- **Path**: `/.netlify/functions/webhook`
- **Methods**: POST
- **Routes**:
  - `/webhook/hcp-webhook` - HouseCall Pro webhooks (via GHL)
  - `/webhook/qbo-webhook` - QuickBooks payment webhooks
- **Features**:
  - Express router via `serverless-http`
  - Request body parsing (JSON and raw)
  - Webhook signature verification
  - Error handling with proper HTTP status codes
  - Environment variable access

### 2. QuickBooks Auth Function (`/netlify/functions/auth-quickbooks.js`)
- **Path**: `/.netlify/functions/auth-quickbooks`
- **Methods**: GET
- **Routes**:
  - `/auth-quickbooks/authorize` - Initiate OAuth flow
  - `/auth-quickbooks/callback` - Handle OAuth callback
- **Features**:
  - OAuth URL generation
  - Token exchange handling
  - Secure token storage (environment or external service)

### 3. Health Check Function (`/netlify/functions/health.js`)
- **Path**: `/.netlify/functions/health`
- **Methods**: GET
- **Purpose**: Service status monitoring
- **Response**: JSON with service availability status

## Core Integration Modules

### Airtable Integration (`/src/lib/airtable.js`)
- Lead creation with GHL data transformation
- Fuzzy matching for customer lookups
- Payment status updates
- Monthly summary generation
- Date formatting for Airtable compatibility

### QuickBooks Integration (`/src/lib/quickbooks.js`)
- OAuth 2.0 authentication flow
- Payment webhook processing
- Customer and invoice data retrieval
- Monthly expense reporting
- Token refresh handling

### HouseCall Pro Integration (`/src/lib/housecall.js`)
- Webhook signature verification
- Customer data extraction
- Lead source mapping (via GHL)

### Utilities (`/src/lib/utils.js`)
- Fuzzy string matching for customer names
- Data validation and formatting
- Currency formatting
- Date/time utilities

## Configuration Files

### `netlify.toml`
```toml
[build]
  command = "npm install"
  functions = "netlify/functions"
  publish = "public"

[functions]
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[context.production.environment]
  NODE_ENV = "production"

[context.development.environment]
  NODE_ENV = "development"
```

### `package.json` Scripts
```json
{
  "scripts": {
    "dev": "node local-dev.js",
    "build": "npm install",
    "start": "netlify dev",
    "deploy": "netlify deploy --prod"
  }
}
```

## Environment Variables

### Production (Netlify Environment)
- `AIRTABLE_API_KEY` - Airtable personal access token
- `AIRTABLE_BASE_ID` - Base identifier
- `AIRTABLE_LEADS_TABLE_NAME` - Leads table name
- `QBO_CLIENT_ID` - QuickBooks app client ID
- `QBO_CLIENT_SECRET` - QuickBooks app secret
- `QBO_SANDBOX` - Boolean for sandbox mode
- `QBO_REDIRECT_URI` - OAuth callback URL (Netlify function URL)
- `HOUSECALL_PRO_WEBHOOK_SECRET` - Webhook verification secret
- `FUZZY_MATCH_THRESHOLD` - Matching sensitivity (0.8)
- `NODE_ENV` - Environment identifier

### Local Development
- All production variables plus:
- `NETLIFY_DEV` - Enable local Netlify CLI development

## Deployment Strategy

### Phase 1: Code Restructuring
1. Create new directory structure
2. Split monolithic `index.js` into serverless functions
3. Move API integrations to `/src/lib/`
4. Create Netlify configuration files
5. Set up local development environment

### Phase 2: Testing & Validation
1. Test all webhook endpoints locally with `netlify dev`
2. Validate QuickBooks OAuth flow
3. Test Airtable integration
4. Verify GHL webhook processing with actual payloads

### Phase 3: Deployment
1. Initialize Git repository
2. Connect to GitHub repository
3. Connect GitHub to Netlify
4. Configure environment variables in Netlify
5. Deploy and test production endpoints
6. Update GHL webhook URL to Netlify function URL

## Local Development Setup

### Development Server (`local-dev.js`)
- Express server for local testing
- Port 3000 (matches current setup)
- Route mounting for serverless functions
- Environment variable loading
- CORS handling

### Netlify CLI Development
```bash
npm install -g netlify-cli
netlify dev  # Runs functions locally with serverless simulation
```

## Migration Considerations

### Existing Webhook URLs
- Current: `http://localhost:3000/webhooks/housecall`
- New: `https://your-site.netlify.app/.netlify/functions/webhook/hcp-webhook`
- Update GHL workflow with new URL after deployment

### QuickBooks OAuth
- Update redirect URI in QuickBooks Developer Console
- New URI: `https://your-site.netlify.app/.netlify/functions/auth-quickbooks/callback`

### Data Persistence
- Serverless functions are stateless
- All data stored in Airtable (no local state)
- Consider external token storage for QuickBooks tokens

## Success Criteria

### Functional Requirements
- ✅ HCP → GHL → Airtable flow maintains current functionality
- ✅ Lead source mapping works correctly ("Box Trucks", etc.)
- ✅ QuickBooks OAuth and payment processing functional
- ✅ All webhook endpoints respond correctly
- ✅ Local development environment matches production

### Technical Requirements
- ✅ Functions deploy successfully to Netlify
- ✅ All environment variables properly configured
- ✅ CORS headers set for cross-origin requests
- ✅ Error handling provides meaningful responses
- ✅ Function cold start times < 3 seconds

### Operational Requirements
- ✅ GitHub integration for continuous deployment
- ✅ Environment variable management through Netlify UI
- ✅ Function logs accessible via Netlify dashboard
- ✅ Health check endpoint for monitoring

## Dependencies

### Core Dependencies
- `express` - Web framework
- `serverless-http` - Express to serverless adapter
- `airtable` - Airtable API client
- `node-quickbooks` - QuickBooks API integration
- `intuit-oauth` - QuickBooks OAuth client
- `axios` - HTTP client
- `fuse.js` - Fuzzy string matching
- `dotenv` - Environment variable loading

### Development Dependencies
- `netlify-cli` - Local development and deployment
- `nodemon` - Development server auto-restart

## Post-Deployment Tasks

1. Update GHL webhook URLs to point to Netlify functions
2. Test complete flow with real HCP lead creation
3. Verify QuickBooks OAuth flow in production
4. Set up monitoring and alerting
5. Update documentation with production URLs
6. Create backup/restore procedures for Airtable data

## Rollback Plan

If deployment issues occur:
1. Revert GHL webhook URLs to local development server
2. Use current `index.js` setup as fallback
3. Debug serverless issues in separate branch
4. Maintain local development capability throughout migration

This specification ensures a smooth transition from the current monolithic Express server to a fully serverless Netlify deployment while maintaining all existing functionality and improving scalability.