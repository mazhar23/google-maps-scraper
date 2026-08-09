import { ImapFlow } from 'imapflow';
import { getDb, logReply, getEmailByMessageId, getLeadById } from './db.js';
import { onReplyDetected } from './crm.js';

// ─── Configuration ────────────────────────────────────────────────────

const IMAP_CONFIG = {
  host: process.env.IMAP_HOST || 'imap.gmail.com',
  port: parseInt(process.env.IMAP_PORT || '993', 10),
  secure: true,
  auth: {
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
  },
  logger: false,
};

const POLL_INTERVAL_MS = parseInt(process.env.REPLY_POLL_INTERVAL || '300000', 10); // 5 min default

// ─── Sentiment Detection ──────────────────────────────────────────────

const POSITIVE_PATTERNS = [
  /\binterested\b/i, /\bsounds good\b/i, /\blet'?s talk\b/i,
  /\byes\b/i, /\btell me more\b/i, /\bwhat'?s (your|the) price\b/i,
  /\bhow much\b/i, /\bschedule\b/i, /\bbook a call\b/i,
  /\bcall me\b/i, /\bmeeting\b/i, /\bgreat\b/i, /\bperfect\b/i,
  /\blove to\b/i, /\bwould like\b/i, /\bset up\b/i,
  /\bwhen can we\b/i, /\bsend (me|us) (a|the) proposal\b/i,
];

const NEGATIVE_PATTERNS = [
  /\bnot interested\b/i, /\bno thanks?\b/i, /\bstop emailing\b/i,
  /\bremove me\b/i, /\bdo not contact\b/i, /\bleave me alone\b/i,
  /\bnot looking\b/i, /\balready have\b/i, /\bspam\b/i,
];

const UNSUBSCRIBE_PATTERNS = [
  /\bunsubscribe\b/i, /\bopt.?out\b/i, /\bremove\b.*\blist\b/i,
  /\bstop\b.*\bemails?\b/i,
];

/**
 * Detect sentiment from reply text.
 * @returns {'positive'|'negative'|'neutral'|'unsubscribe'}
 */
export function detectSentiment(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();

  for (const pat of UNSUBSCRIBE_PATTERNS) {
    if (pat.test(lower)) return 'unsubscribe';
  }
  for (const pat of NEGATIVE_PATTERNS) {
    if (pat.test(lower)) return 'negative';
  }
  for (const pat of POSITIVE_PATTERNS) {
    if (pat.test(lower)) return 'positive';
  }
  return 'neutral';
}

// ─── IMAP Reply Detection ─────────────────────────────────────────────

/**
 * Connect to IMAP inbox and check for new replies matching sent emails.
 * @returns {object[]} Array of detected replies
 */
export async function checkImapReplies() {
  if (!IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
    console.warn('[reply-detector] IMAP credentials not configured. Skipping inbox check.');
    return [];
  }

  const client = new ImapFlow(IMAP_CONFIG);
  const detectedReplies = [];

  try {
    await client.connect();

    // Open INBOX
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Search for unseen messages from the last 7 days
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for await (const message of client.fetch(
        { seen: false, since },
        {
          envelope: true,
          bodyParts: ['text'],
          headers: ['in-reply-to', 'references', 'from', 'subject'],
        }
      )) {
        const reply = await processImapMessage(message);
        if (reply) {
          detectedReplies.push(reply);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[reply-detector] IMAP error:', err.message);
    try { await client.logout(); } catch { /* ignore */ }
  }

  return detectedReplies;
}

/**
 * Process a single IMAP message — match it to a sent email and log the reply.
 */
async function processImapMessage(message) {
  const envelope = message.envelope || {};
  const inReplyTo = envelope.inReplyTo || '';
  const references = (envelope.references || []).join(' ');
  const fromAddr = envelope.from?.[0]?.address || '';
  const subject = envelope.subject || '';

  // Try to extract the plain text body
  let bodyText = '';
  if (message.bodyParts) {
    for (const [, part] of message.bodyParts) {
      bodyText += part.toString('utf8');
    }
  }

  // Match by In-Reply-To or References header against our sent message IDs
  let matchedEmail = null;
  if (inReplyTo) {
    matchedEmail = getEmailByMessageId(inReplyTo.replace(/[<>]/g, ''));
  }
  if (!matchedEmail && references) {
    const refIds = references.split(/\s+/).map(r => r.replace(/[<>]/g, ''));
    for (const refId of refIds) {
      matchedEmail = getEmailByMessageId(refId);
      if (matchedEmail) break;
    }
  }

  // Fallback: match by sender email against our leads
  if (!matchedEmail && fromAddr) {
    const db = getDb();
    const lead = db.prepare(`
      SELECT l.lead_id FROM leads l
      JOIN email_log e ON e.lead_id = l.lead_id
      WHERE e.to_address = ?
      ORDER BY e.sent_at DESC LIMIT 1
    `).get(fromAddr);

    if (lead) {
      matchedEmail = { lead_id: lead.lead_id, id: null };
    }
  }

  if (!matchedEmail) return null;

  const sentiment = detectSentiment(bodyText || subject);
  const leadId = matchedEmail.lead_id;

  // Log the reply
  logReply({
    leadId,
    emailLogId: matchedEmail.id || null,
    from: fromAddr,
    subject,
    body: bodyText.slice(0, 5000), // cap storage
    sentiment,
    detectedVia: 'imap',
  });

  // Auto-advance CRM status
  onReplyDetected(leadId, sentiment);

  console.log(`[reply-detector] Reply from ${fromAddr} → lead ${leadId} (${sentiment})`);

  return {
    lead_id: leadId,
    from: fromAddr,
    subject,
    sentiment,
    detected_via: 'imap',
  };
}

// ─── Brevo Webhook Handler ────────────────────────────────────────────

/**
 * Process a Brevo webhook event.
 * Call this from an Express/HTTP endpoint: POST /webhook/brevo
 *
 * @param {object} event - Brevo webhook payload
 * @returns {{ processed: boolean, lead_id?: string, event_type?: string }}
 */
export function processBrevoWebhook(event) {
  if (!event || !event.event) {
    return { processed: false, error: 'Invalid webhook payload' };
  }

  const eventType = event.event; // delivered, opened, clicked, hard_bounce, soft_bounce, reply, etc.
  const messageId = event['message-id'] || event.messageId || '';
  const email = event.email || '';

  // Find the matching sent email
  const sentEmail = messageId ? getEmailByMessageId(messageId.replace(/[<>]/g, '')) : null;

  if (!sentEmail) {
    return { processed: false, error: 'No matching sent email found' };
  }

  const leadId = sentEmail.lead_id;

  // Handle different event types
  switch (eventType) {
    case 'reply': {
      const bodyText = event.content || event.text || event.subject || '';
      const sentiment = detectSentiment(bodyText);

      logReply({
        leadId,
        emailLogId: sentEmail.id,
        from: email,
        subject: event.subject || '',
        body: bodyText.slice(0, 5000),
        sentiment,
        detectedVia: 'webhook',
      });

      onReplyDetected(leadId, sentiment);

      console.log(`[brevo-webhook] Reply from ${email} → lead ${leadId} (${sentiment})`);
      return { processed: true, lead_id: leadId, event_type: 'reply', sentiment };
    }

    case 'delivered':
    case 'opened':
    case 'clicked': {
      // Update email log status
      const db = getDb();
      db.prepare('UPDATE email_log SET status = ? WHERE id = ?').run(eventType, sentEmail.id);
      return { processed: true, lead_id: leadId, event_type: eventType };
    }

    case 'hard_bounce':
    case 'soft_bounce':
    case 'blocked': {
      const db = getDb();
      db.prepare('UPDATE email_log SET status = ? WHERE id = ?').run('bounced', sentEmail.id);
      return { processed: true, lead_id: leadId, event_type: eventType };
    }

    default:
      return { processed: false, event_type: eventType, note: 'Unhandled event type' };
  }
}

// ─── Polling Loop ─────────────────────────────────────────────────────

let _pollInterval = null;

/**
 * Start polling IMAP inbox for replies at configured interval.
 */
export function startReplyPolling() {
  if (_pollInterval) {
    console.log('[reply-detector] Polling already running');
    return;
  }

  console.log(`[reply-detector] Starting IMAP polling every ${POLL_INTERVAL_MS / 1000}s`);

  // Run immediately on start
  checkImapReplies().catch(err => console.error('[reply-detector] Poll error:', err.message));

  _pollInterval = setInterval(async () => {
    try {
      const replies = await checkImapReplies();
      if (replies.length > 0) {
        console.log(`[reply-detector] Found ${replies.length} new replies`);
      }
    } catch (err) {
      console.error('[reply-detector] Poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the polling loop.
 */
export function stopReplyPolling() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
    console.log('[reply-detector] Polling stopped');
  }
}
