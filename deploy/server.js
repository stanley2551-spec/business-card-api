const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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',
});

// Owner email
const OWNER_EMAIL = 'stanley2551@gmail.com';

// In-memory storage (use Firestore in production)
const subscriptions = new Map();
const freeAccessCodes = new Set();
const usedCodes = new Set();

// Middleware
app.use(cors({
  origin: ['https://qwt5vbwy2mvtw.ok.kimi.link', 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ============ AUTH MIDDLEWARE ============
function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  const userEmail = req.headers['x-user-email'];
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.userId = userId;
  req.userEmail = userEmail;
  next();
}

// ============ SUBSCRIPTION CHECK ============
function checkSubscription(req, res, next) {
  const userId = req.userId;
  const userEmail = req.userEmail;
  
  // Owner always has access
  if (userEmail === OWNER_EMAIL) {
    req.hasAccess = true;
    req.isOwner = true;
    return next();
  }
  
  // Check if user has free access code
  const userSub = subscriptions.get(userId);
  if (userSub?.freeAccess) {
    req.hasAccess = true;
    return next();
  }
  
  // Check if user has active subscription
  if (userSub?.status === 'active' && userSub?.currentPeriodEnd > Date.now()) {
    req.hasAccess = true;
    return next();
  }
  
  req.hasAccess = false;
  next();
}

// ============ PUBLIC ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get subscription status
app.get('/api/subscription/status', requireAuth, (req, res) => {
  const userId = req.userId;
  const userEmail = req.userEmail;
  
  // Owner always has access
  if (userEmail === OWNER_EMAIL) {
    return res.json({
      hasAccess: true,
      isOwner: true,
      status: 'owner',
      message: 'Owner access'
    });
  }
  
  const sub = subscriptions.get(userId);
  
  if (sub?.freeAccess) {
    return res.json({
      hasAccess: true,
      status: 'free',
      message: 'Free access via code'
    });
  }
  
  if (sub?.status === 'active' && sub?.currentPeriodEnd > Date.now()) {
    return res.json({
      hasAccess: true,
      status: 'subscribed',
      currentPeriodEnd: sub.currentPeriodEnd,
      message: 'Active subscription'
    });
  }
  
  res.json({
    hasAccess: false,
    status: 'none',
    message: 'Subscription required'
  });
});

// Create checkout session
app.post('/api/subscription/checkout', requireAuth, async (req, res) => {
  try {
    const { userId, userEmail } = req;
    
    // Price ID for €6.99/month subscription
    // You need to create this in Stripe Dashboard
    const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_placeholder';
    
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://qwt5vbwy2mvtw.ok.kimi.link'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://qwt5vbwy2mvtw.ok.kimi.link'}/subscription/cancel`,
      metadata: {
        userId: userId,
      },
    });
    
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Verify checkout session
app.get('/api/subscription/verify', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status === 'paid') {
      const userId = session.metadata.userId;
      
      // Store subscription
      subscriptions.set(userId, {
        status: 'active',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        createdAt: Date.now(),
      });
      
      res.json({ success: true, status: 'active' });
    } else {
      res.json({ success: false, status: session.payment_status });
    }
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
});

// Apply free access code
app.post('/api/subscription/apply-code', requireAuth, (req, res) => {
  const { code } = req.body;
  const userId = req.userId;
  
  if (!code) {
    return res.status(400).json({ error: 'Code required' });
  }
  
  // Check if code is valid
  if (!freeAccessCodes.has(code)) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  
  // Check if code was already used
  if (usedCodes.has(code)) {
    return res.status(400).json({ error: 'Code already used' });
  }
  
  // Mark code as used
  usedCodes.add(code);
  
  // Grant free access
  subscriptions.set(userId, {
    status: 'free',
    freeAccess: true,
    code: code,
    grantedAt: Date.now(),
  });
  
  res.json({ success: true, message: 'Free access granted' });
});

// ============ OWNER ADMIN ROUTES ============

// Middleware to check if user is owner
function requireOwner(req, res, next) {
  if (req.userEmail !== OWNER_EMAIL) {
    return res.status(403).json({ error: 'Forbidden - Owner only' });
  }
  next();
}

// Generate free access codes (owner only)
app.post('/api/admin/generate-codes', requireAuth, requireOwner, (req, res) => {
  const { count = 1 } = req.body;
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    const code = 'FREE-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    freeAccessCodes.add(code);
    codes.push(code);
  }
  
  res.json({ codes, totalCodes: freeAccessCodes.size });
});

// List all free access codes (owner only)
app.get('/api/admin/codes', requireAuth, requireOwner, (req, res) => {
  const codesList = Array.from(freeAccessCodes).map(code => ({
    code,
    used: usedCodes.has(code),
  }));
  
  res.json({
    codes: codesList,
    total: freeAccessCodes.size,
    used: usedCodes.size,
    available: freeAccessCodes.size - usedCodes.size,
  });
});

// Revoke a code (owner only)
app.post('/api/admin/revoke-code', requireAuth, requireOwner, (req, res) => {
  const { code } = req.body;
  
  freeAccessCodes.delete(code);
  usedCodes.delete(code);
  
  res.json({ success: true });
});

// Get all subscriptions (owner only)
app.get('/api/admin/subscriptions', requireAuth, requireOwner, (req, res) => {
  const subs = Array.from(subscriptions.entries()).map(([userId, sub]) => ({
    userId,
    ...sub,
  }));
  
  res.json({ subscriptions: subs, count: subs.length });
});

// Grant free access to specific user (owner only)
app.post('/api/admin/grant-free', requireAuth, requireOwner, (req, res) => {
  const { userId } = req.body;
  
  subscriptions.set(userId, {
    status: 'free',
    freeAccess: true,
    grantedBy: OWNER_EMAIL,
    grantedAt: Date.now(),
  });
  
  res.json({ success: true, message: `Free access granted to ${userId}` });
});

// Revoke access from user (owner only)
app.post('/api/admin/revoke-access', requireAuth, requireOwner, (req, res) => {
  const { userId } = req.body;
  
  subscriptions.delete(userId);
  
  res.json({ success: true, message: `Access revoked from ${userId}` });
});

// ============ AI SCANNING PROXY ============

// AI business card scanning (requires subscription)
app.post('/api/ai/scan', requireAuth, checkSubscription, async (req, res) => {
  try {
    if (!req.hasAccess) {
      return res.status(403).json({
        error: 'Subscription required',
        message: 'Please subscribe to use AI scanning',
        checkoutUrl: '/subscription'
      });
    }
    
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Image required' });
    }
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert business card parser. Analyze the image and extract contact information accurately.

Return ONLY a JSON object with these fields:
{
  "firstName": "person's first name",
  "lastName": "person's last name",
  "company": "company or organization name",
  "jobTitle": "job title or position",
  "email": "email address",
  "phone": "phone number (prefer mobile/cell if multiple)",
  "website": "website URL",
  "address": "street address",
  "city": "city name",
  "state": "state/province/region",
  "zipCode": "postal/ZIP code",
  "country": "country name",
  "confidence": "high|medium|low"
}

Rules:
- If a field is not visible or unclear, return empty string ""
- For names: First name is the given name, last name is the family name
- For addresses: Extract street number and name to 'address', city to 'city', etc.
- For phone: Include country code if present (+1, +44, etc.)
- For email: Return exactly as shown
- Confidence: 'high' if all key fields clear, 'medium' if some unclear, 'low' if mostly unclear`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: image,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid AI response format');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    res.json({
      success: true,
      data: parsed,
      usedAI: true,
    });
  } catch (error) {
    console.error('AI scan error:', error);
    res.status(500).json({ error: 'Failed to scan business card' });
  }
});

// AI text parsing (requires subscription)
app.post('/api/ai/parse-text', requireAuth, checkSubscription, async (req, res) => {
  try {
    if (!req.hasAccess) {
      return res.status(403).json({
        error: 'Subscription required',
        message: 'Please subscribe to use AI parsing',
      });
    }
    
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert business card parser. Given OCR text from a business card, extract structured contact information.

The OCR text may have errors, be out of order, or have formatting issues. Use your intelligence to figure out what each piece of text represents.

Return ONLY a JSON object with these fields:
{
  "firstName": "person's first name",
  "lastName": "person's last name", 
  "company": "company or organization name",
  "jobTitle": "job title or position",
  "email": "email address",
  "phone": "phone number",
  "website": "website URL",
  "address": "street address",
  "city": "city name",
  "state": "state/province/region",
  "zipCode": "postal/ZIP code",
  "country": "country name",
  "confidence": "high|medium|low"
}

Guidelines:
- Names: Look for patterns like "John Smith" or "J. Smith" - first word is usually first name
- Company: Often has Inc, LLC, Ltd, Corp, or is the largest text
- Email: Contains @ symbol
- Phone: Contains numbers, often with +, (), -, or spaces
- Website: Contains .com, .net, .org, www., or http
- Address: Starts with number, contains St, Ave, Rd, etc.
- City/State/Zip: Often grouped together
- If uncertain, use your best judgment`,
        },
        {
          role: 'user',
          content: `Parse this OCR text from a business card:\n\n${text}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid AI response format');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    res.json({
      success: true,
      data: parsed,
      usedAI: true,
    });
  } catch (error) {
    console.error('AI parse error:', error);
    res.status(500).json({ error: 'Failed to parse text' });
  }
});

// ============ STRIPE WEBHOOK ============

// Stripe webhook for subscription events
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    if (endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle events
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const userId = session.metadata?.userId;
      
      if (userId) {
        subscriptions.set(userId, {
          status: 'active',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
        });
      }
      break;
      
    case 'invoice.payment_failed':
      const invoice = event.data.object;
      // Handle failed payment
      console.log('Payment failed:', invoice);
      break;
      
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      // Handle subscription cancellation
      console.log('Subscription cancelled:', subscription);
      break;
  }
  
  res.json({ received: true });
});

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Owner: ${OWNER_EMAIL}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
});

module.exports = app;
