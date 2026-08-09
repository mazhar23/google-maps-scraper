import { getDb, updateLeadStatus, getLeadById, getLeadFunnelCounts } from './db.js';

/**
 * Valid CRM status transitions.
 * Each key is a status, and its value is an array of statuses it can transition to.
 */
const VALID_TRANSITIONS = {
  new:           ['contacted', 'closed_lost'],
  contacted:     ['replied', 'closed_lost'],
  replied:       ['proposal_sent', 'negotiating', 'closed_lost'],
  proposal_sent: ['negotiating', 'replied', 'closed_won', 'closed_lost'],
  negotiating:   ['proposal_sent', 'closed_won', 'closed_lost'],
  closed_won:    [],    // terminal state
  closed_lost:   ['new'], // can reopen
};

/**
 * Advance a lead's CRM status. Validates the transition.
 * @param {string} leadId
 * @param {string} newStatus
 * @param {string} notes - optional notes about the transition
 * @returns {{ success: boolean, from: string, to: string, error?: string }}
 */
export function advanceLead(leadId, newStatus, notes = '') {
  const lead = getLeadById(leadId);
  if (!lead) {
    return { success: false, from: null, to: newStatus, error: `Lead ${leadId} not found` };
  }

  const currentStatus = lead.status;

  // Allow same-status updates (idempotent)
  if (currentStatus === newStatus) {
    return { success: true, from: currentStatus, to: newStatus, note: 'Already in this status' };
  }

  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      from: currentStatus,
      to: newStatus,
      error: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
    };
  }

  updateLeadStatus(leadId, newStatus, notes);
  return { success: true, from: currentStatus, to: newStatus };
}

/**
 * Auto-advance when email is sent. new → contacted
 */
export function onEmailSent(leadId) {
  const lead = getLeadById(leadId);
  if (!lead) return;
  if (lead.status === 'new') {
    advanceLead(leadId, 'contacted', 'Auto: outreach email sent');
  }
}

/**
 * Auto-advance when reply is detected. contacted → replied
 */
export function onReplyDetected(leadId, sentiment = 'neutral') {
  const lead = getLeadById(leadId);
  if (!lead) return;

  if (sentiment === 'unsubscribe' || sentiment === 'negative') {
    advanceLead(leadId, 'closed_lost', `Auto: ${sentiment} reply detected`);
    return;
  }

  if (lead.status === 'contacted' || lead.status === 'proposal_sent') {
    advanceLead(leadId, 'replied', `Auto: reply detected (${sentiment})`);
  }
}

/**
 * Auto-advance when proposal is sent. replied → proposal_sent
 */
export function onProposalSent(leadId) {
  const lead = getLeadById(leadId);
  if (!lead) return;
  if (lead.status === 'replied' || lead.status === 'negotiating') {
    advanceLead(leadId, 'proposal_sent', 'Auto: proposal sent');
  }
}

/**
 * Auto-advance when payment is received. → closed_won
 */
export function onPaymentReceived(leadId) {
  const lead = getLeadById(leadId);
  if (!lead) return;
  if (lead.status !== 'closed_won') {
    advanceLead(leadId, 'closed_won', 'Auto: payment received');
  }
}

/**
 * Get leads that need follow-up — stuck in "contacted" for over N hours without reply.
 */
export function getLeadsForFollowup(hoursStale = 48) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hoursStale * 60 * 60 * 1000).toISOString();

  const leads = db.prepare(`
    SELECT l.* FROM leads l
    WHERE l.status = 'contacted'
      AND l.updated_at < ?
      AND l.lead_id NOT IN (
        SELECT lead_id FROM replies WHERE lead_id = l.lead_id
      )
    ORDER BY l.lead_score DESC
  `).all(cutoff);

  return leads;
}

/**
 * Get full status change history for a lead.
 */
export function getLeadHistory(leadId) {
  const lead = getLeadById(leadId);
  if (!lead) return [];
  return lead.status_history || [];
}

/**
 * Print a formatted CRM funnel to console.
 */
export function printFunnel() {
  const counts = getLeadFunnelCounts();
  const bar = (n, max) => {
    const width = max > 0 ? Math.round((n / max) * 30) : 0;
    return '█'.repeat(width) + '░'.repeat(30 - width);
  };
  const max = Math.max(...Object.values(counts).filter(v => typeof v === 'number'));

  console.log('\n┌──────────────────────────────────────────────────┐');
  console.log('│              📊 LEAD FUNNEL                      │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  New           ${bar(counts.new, max)}  ${String(counts.new).padStart(4)} │`);
  console.log(`│  Contacted     ${bar(counts.contacted, max)}  ${String(counts.contacted).padStart(4)} │`);
  console.log(`│  Replied       ${bar(counts.replied, max)}  ${String(counts.replied).padStart(4)} │`);
  console.log(`│  Proposal Sent ${bar(counts.proposal_sent, max)}  ${String(counts.proposal_sent).padStart(4)} │`);
  console.log(`│  Negotiating   ${bar(counts.negotiating, max)}  ${String(counts.negotiating).padStart(4)} │`);
  console.log(`│  ✅ Won        ${bar(counts.closed_won, max)}  ${String(counts.closed_won).padStart(4)} │`);
  console.log(`│  ❌ Lost       ${bar(counts.closed_lost, max)}  ${String(counts.closed_lost).padStart(4)} │`);
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  Total: ${counts.total}                                      │`);
  console.log('└──────────────────────────────────────────────────┘\n');

  return counts;
}
