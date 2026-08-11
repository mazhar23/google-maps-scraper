import Stripe from 'stripe';
import { getDb, updatePaymentStatus } from './db.js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

let stripe = null;
if (stripeSecretKey) {
  stripe = new Stripe(stripeSecretKey);
}

/**
 * Vercel serverless function for Stripe webhooks.
 * Handles: checkout.session.completed, payment_link.updated
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing Stripe-Signature header' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    await handleStripeEvent(event);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Error handling event:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Process a Stripe event and update the database.
 */
async function handleStripeEvent(event) {
  const eventType = event.type;

  switch (eventType) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const paymentLinkId = session.payment_link || '';
      const metadata = session.metadata || {};
      const leadId = metadata.lead_id || '';

      if (!leadId && paymentLinkId) {
        const db = getDb();
        const payment = db.prepare('SELECT lead_id FROM payments WHERE stripe_payment_link_id = ?').get(paymentLinkId);
        if (payment) {
          metadata.lead_id = payment.lead_id;
        }
      }

      if (paymentLinkId) {
        updatePaymentStatus(paymentLinkId, 'paid', session.id);
        console.log(`[webhook] Payment completed for session ${session.id}`);
      }

      if (leadId) {
        console.log(`[webhook] Lead ${leadId} marked as paid`);
      }
      break;
    }

    case 'payment_link.updated': {
      const paymentLink = event.data.object;
      const paymentLinkId = paymentLink.id;

      if (paymentLink.active === false) {
        const db = getDb();
        const payment = db.prepare('SELECT lead_id FROM payments WHERE stripe_payment_link_id = ?').get(paymentLinkId);
        if (payment) {
          updatePaymentStatus(paymentLinkId, 'expired');
          console.log(`[webhook] Payment link expired for lead ${payment.lead_id}`);
        }
      }
      break;
    }

    default:
      console.log(`[webhook] Unhandled event type: ${eventType}`);
  }
}
