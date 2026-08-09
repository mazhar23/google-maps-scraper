import Stripe from 'stripe';
import { getDb, savePayment, updatePaymentStatus } from './db.js';
import { onPaymentReceived } from './crm.js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

/**
 * Programmatically create a Stripe Payment Link for a proposal.
 *
 * @param {string} leadId - The lead ID
 * @param {number} proposalId - The proposal ID
 * @param {Array} services - Array of recommended services with price_min/max
 * @returns {Promise<string>} The payment link URL
 */
export async function createPaymentLink(leadId, proposalId, services) {
  if (!stripe) {
    console.warn('[payments] STRIPE_SECRET_KEY not configured. Cannot create payment link.');
    return '';
  }

  try {
    // 1. Create a Product and Price for each service (or use a combined total)
    // For simplicity, we'll create a single custom price for the total amount
    // of the minimum prices. In a full implementation, you might create line items.
    
    const totalPrice = services.reduce((sum, s) => sum + (s.price_min || 0), 0);
    if (totalPrice <= 0) return '';

    const product = await stripe.products.create({
      name: 'Business Growth Package',
      description: 'Custom digital services package as per proposal.',
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: totalPrice * 100, // Stripe uses cents
      currency: 'usd',
    });

    // 2. Create the Payment Link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        lead_id: leadId,
        proposal_id: String(proposalId),
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: process.env.STRIPE_SUCCESS_URL || 'https://example.com/success',
        },
      },
    });

    // 3. Save to database
    savePayment({
      leadId,
      proposalId,
      stripeLinkId: paymentLink.id,
      stripeLinkUrl: paymentLink.url,
      amount: totalPrice,
      currency: 'usd',
    });

    console.log(`[payments] Created Stripe payment link for lead ${leadId}: ${paymentLink.url}`);
    return paymentLink.url;

  } catch (error) {
    console.error('[payments] Error creating Stripe payment link:', error.message);
    return '';
  }
}

/**
 * Handle Stripe Webhook events.
 * Call this from an Express endpoint: POST /webhook/stripe
 *
 * @param {Buffer} rawBody - The raw request body
 * @param {string} signature - The Stripe-Signature header
 */
export async function handleStripeWebhook(rawBody, signature) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe is not fully configured for webhooks.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new Error(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      
      // Payment links usually have the metadata on the session or payment link
      let leadId = session.metadata?.lead_id;
      const paymentLinkId = session.payment_link;

      if (!leadId && paymentLinkId) {
        // Fetch the payment record from our DB to get leadId
        const db = getDb();
        const payment = db.prepare('SELECT lead_id FROM payments WHERE stripe_payment_link_id = ?').get(paymentLinkId);
        if (payment) leadId = payment.lead_id;
      }

      if (leadId && paymentLinkId) {
        updatePaymentStatus(paymentLinkId, 'paid', session.id);
        onPaymentReceived(leadId);
        console.log(`[payments] Payment received for lead ${leadId} via checkout session ${session.id}`);
      }
      break;
    }
    // ... handle other event types if needed
    default:
      console.log(`[payments] Unhandled event type ${event.type}`);
  }

  return { received: true };
}
