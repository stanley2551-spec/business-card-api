# Business Card Scanner Backend API

Backend API for the Business Card Scanner app with subscription management and AI proxy.

## Features

- **AI Proxy**: Securely calls OpenAI API without exposing API key to frontend
- **Subscription Management**: Stripe integration for €6.99/month subscriptions
- **Free Access Codes**: Owner can generate codes for free access
- **Admin Panel**: Manage subscriptions and codes

## Environment Variables

Create a `.env` file:

```env
# OpenAI API Key
OPENAI_API_KEY=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

# Stripe (optional - for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Port
PORT=3001
```

## Deployment Options

### Option 1: Render (Recommended - Free)

1. Go to [render.com](https://render.com)
2. Create a new Web Service
3. Connect your GitHub repo or upload files
4. Set environment variables in Render dashboard
5. Deploy!

### Option 2: Railway

1. Go to [railway.app](https://railway.app)
2. Create a new project
3. Deploy from GitHub or upload
4. Add environment variables
5. Deploy!

### Option 3: Heroku

```bash
heroku create your-app-name
git push heroku main
heroku config:set OPENAI_API_KEY=your-key
```

### Option 4: Self-Hosted (VPS)

```bash
# Install Node.js 18+
npm install
npm start
```

## API Endpoints

### Public
- `GET /api/health` - Health check
- `GET /api/subscription/status` - Check subscription status
- `POST /api/subscription/checkout` - Create Stripe checkout
- `GET /api/subscription/verify` - Verify checkout session
- `POST /api/subscription/apply-code` - Apply free access code

### AI (Requires Subscription)
- `POST /api/ai/scan` - Scan business card with AI
- `POST /api/ai/parse-text` - Parse OCR text with AI

### Admin (Owner Only)
- `POST /api/admin/generate-codes` - Generate free access codes
- `GET /api/admin/codes` - List all codes
- `POST /api/admin/revoke-code` - Revoke a code
- `GET /api/admin/subscriptions` - List all subscriptions
- `POST /api/admin/grant-free` - Grant free access to user
- `POST /api/admin/revoke-access` - Revoke user access

## Admin Panel

Access the admin panel at `/admin.html` after logging in with owner credentials.

Owner email: `stanley2551@gmail.com`

## Stripe Setup (For Payments)

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Create a product with price €6.99/month
3. Copy the Price ID to `STRIPE_PRICE_ID`
4. Add webhook endpoint: `https://your-api.com/api/webhook/stripe`
5. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

## Free Tier

Without Stripe configured, the app works with:
- Free access codes (owner-generated)
- Manual free access grants (owner-only)

## Frontend Integration

Update the frontend's `src/lib/openai.ts` with your backend URL:

```typescript
const API_URL = 'https://your-backend-url.com';
```
