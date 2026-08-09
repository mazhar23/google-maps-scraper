import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'leads.db');

let _db = null;

/**
 * Get or create the SQLite database instance.
 * Uses WAL mode for concurrent read safety and crash resilience.
 */
export function getDb() {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('foreign_keys = ON');

  migrate(_db);
  return _db;
}

/**
 * Auto-migration: creates all tables if they don't exist.
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL DEFAULT '',
      category TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      zip_code TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      website TEXT DEFAULT '',
      rating REAL,
      review_count INTEGER,
      source_url TEXT DEFAULT '',

      -- Contact enrichment
      emails TEXT DEFAULT '[]',
      additional_phones TEXT DEFAULT '[]',
      owner_name TEXT DEFAULT '',
      owner_title TEXT DEFAULT '',
      owner_email TEXT DEFAULT '',
      owner_phone TEXT DEFAULT '',
      owner_linkedin TEXT DEFAULT '',
      social TEXT DEFAULT '{}',
      business_hours TEXT DEFAULT '',

      -- Website audit
      has_website INTEGER DEFAULT 0,
      website_status TEXT DEFAULT 'unknown',
      website_score INTEGER DEFAULT 0,
      website_grade TEXT DEFAULT 'F',
      outdated_signals TEXT DEFAULT '[]',
      tech_stack TEXT DEFAULT '[]',
      https INTEGER DEFAULT 0,
      has_robots INTEGER DEFAULT 0,
      has_sitemap INTEGER DEFAULT 0,
      mobile_friendly INTEGER DEFAULT 0,

      -- Lead scoring
      lead_score INTEGER DEFAULT 0,
      lead_grade TEXT DEFAULT '',
      lead_priority TEXT DEFAULT 'low',
      recommended_services TEXT DEFAULT '[]',
      score_reasoning TEXT DEFAULT '',

      -- CRM status
      status TEXT DEFAULT 'new' CHECK(status IN ('new','contacted','replied','proposal_sent','negotiating','closed_won','closed_lost')),
      status_notes TEXT DEFAULT '',
      status_history TEXT DEFAULT '[]',

      -- Metadata
      search_query TEXT DEFAULT '',
      enrichment_status TEXT DEFAULT '',
      scraped_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
    CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);

    CREATE TABLE IF NOT EXISTS pipeline_jobs (
      job_id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL DEFAULT 'full',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','paused')),
      current_stage TEXT DEFAULT '',
      progress_data TEXT DEFAULT '{}',
      total_items INTEGER DEFAULT 0,
      processed_items INTEGER DEFAULT 0,
      error_message TEXT DEFAULT '',
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      message_id TEXT DEFAULT '',
      to_address TEXT NOT NULL,
      subject TEXT DEFAULT '',
      template_used TEXT DEFAULT '',
      status TEXT DEFAULT 'sent' CHECK(status IN ('sent','delivered','opened','clicked','bounced','failed')),
      sent_at TEXT DEFAULT (datetime('now')),
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
    );

    CREATE INDEX IF NOT EXISTS idx_email_log_lead ON email_log(lead_id);
    CREATE INDEX IF NOT EXISTS idx_email_log_message ON email_log(message_id);

    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      email_log_id INTEGER,
      from_address TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      body_text TEXT DEFAULT '',
      sentiment TEXT DEFAULT 'neutral' CHECK(sentiment IN ('positive','negative','neutral','unsubscribe')),
      detected_via TEXT DEFAULT 'imap' CHECK(detected_via IN ('imap','webhook','manual')),
      received_at TEXT DEFAULT (datetime('now')),
      processed INTEGER DEFAULT 0,
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id),
      FOREIGN KEY (email_log_id) REFERENCES email_log(id)
    );

    CREATE INDEX IF NOT EXISTS idx_replies_lead ON replies(lead_id);

    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL UNIQUE,
      proposal_html TEXT DEFAULT '',
      proposal_slug TEXT UNIQUE,
      services TEXT DEFAULT '[]',
      total_price REAL DEFAULT 0,
      payment_link TEXT DEFAULT '',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','viewed','accepted','rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_lead ON proposals(lead_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_slug ON proposals(proposal_slug);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      proposal_id INTEGER,
      stripe_payment_link_id TEXT DEFAULT '',
      stripe_payment_link_url TEXT DEFAULT '',
      stripe_session_id TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'usd',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded','expired')),
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id),
      FOREIGN KEY (proposal_id) REFERENCES proposals(id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments(lead_id);
    CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_link_id);
  `);
}

// ─── Lead CRUD ────────────────────────────────────────────────────────

/**
 * Insert or update a lead. Merges data with existing record.
 */
export function upsertLead(lead) {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(lead.lead_id);

  if (existing) {
    const stmt = db.prepare(`
      UPDATE leads SET
        business_name = COALESCE(NULLIF(?, ''), business_name),
        category = COALESCE(NULLIF(?, ''), category),
        address = COALESCE(NULLIF(?, ''), address),
        city = COALESCE(NULLIF(?, ''), city),
        state = COALESCE(NULLIF(?, ''), state),
        zip_code = COALESCE(NULLIF(?, ''), zip_code),
        phone = COALESCE(NULLIF(?, ''), phone),
        website = COALESCE(NULLIF(?, ''), website),
        rating = COALESCE(?, rating),
        review_count = COALESCE(?, review_count),
        source_url = COALESCE(NULLIF(?, ''), source_url),
        emails = COALESCE(NULLIF(?, '[]'), emails),
        additional_phones = COALESCE(NULLIF(?, '[]'), additional_phones),
        owner_name = COALESCE(NULLIF(?, ''), owner_name),
        owner_title = COALESCE(NULLIF(?, ''), owner_title),
        owner_email = COALESCE(NULLIF(?, ''), owner_email),
        owner_phone = COALESCE(NULLIF(?, ''), owner_phone),
        owner_linkedin = COALESCE(NULLIF(?, ''), owner_linkedin),
        social = COALESCE(NULLIF(?, '{}'), social),
        business_hours = COALESCE(NULLIF(?, ''), business_hours),
        has_website = ?,
        website_status = COALESCE(NULLIF(?, ''), website_status),
        website_score = COALESCE(?, website_score),
        website_grade = COALESCE(NULLIF(?, ''), website_grade),
        outdated_signals = COALESCE(NULLIF(?, '[]'), outdated_signals),
        tech_stack = COALESCE(NULLIF(?, '[]'), tech_stack),
        https = ?,
        has_robots = ?,
        has_sitemap = ?,
        mobile_friendly = ?,
        search_query = COALESCE(NULLIF(?, ''), search_query),
        enrichment_status = COALESCE(NULLIF(?, ''), enrichment_status),
        scraped_at = COALESCE(NULLIF(?, ''), scraped_at),
        updated_at = ?,
        raw_data = COALESCE(NULLIF(?, '{}'), raw_data)
      WHERE lead_id = ?
    `);

    const contacts = lead.contacts || {};
    const audit = lead.website_audit || {};
    const social = contacts.social || {};

    stmt.run(
      lead.business_name || '',
      lead.category || '',
      lead.address || '',
      lead.city || '',
      lead.state || '',
      lead.zip_code || '',
      lead.phone || '',
      lead.website || '',
      lead.rating ?? null,
      lead.review_count ?? null,
      lead.source_url || '',
      JSON.stringify(contacts.emails || []),
      JSON.stringify(contacts.additional_phones || []),
      contacts.owner_name || '',
      contacts.owner_title || '',
      contacts.owner_email || '',
      contacts.owner_phone || '',
      contacts.owner_linkedin || '',
      JSON.stringify(social),
      contacts.business_hours || '',
      audit.has_website ? 1 : 0,
      audit.website_status || '',
      audit.website_score ?? 0,
      audit.website_grade || '',
      JSON.stringify(audit.outdated_signals || []),
      JSON.stringify(audit.tech_stack || []),
      audit.https ? 1 : 0,
      audit.has_robots ? 1 : 0,
      audit.has_sitemap ? 1 : 0,
      audit.mobile_friendly ? 1 : 0,
      lead.search_query || '',
      lead.enrichment_status || '',
      lead.scraped_at || '',
      now,
      JSON.stringify(lead.raw_data || {}),
      lead.lead_id
    );
    return lead.lead_id;
  }

  // Insert new
  const contacts = lead.contacts || {};
  const audit = lead.website_audit || {};
  const social = contacts.social || {};

  const stmt = db.prepare(`
    INSERT INTO leads (
      lead_id, business_name, category, address, city, state, zip_code,
      phone, website, rating, review_count, source_url,
      emails, additional_phones, owner_name, owner_title, owner_email,
      owner_phone, owner_linkedin, social, business_hours,
      has_website, website_status, website_score, website_grade,
      outdated_signals, tech_stack, https, has_robots, has_sitemap,
      mobile_friendly, status, search_query, enrichment_status,
      scraped_at, updated_at, raw_data
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, 'new', ?, ?,
      ?, ?, ?
    )
  `);

  stmt.run(
    lead.lead_id,
    lead.business_name || '',
    lead.category || '',
    lead.address || '',
    lead.city || '',
    lead.state || '',
    lead.zip_code || '',
    lead.phone || '',
    lead.website || '',
    lead.rating ?? null,
    lead.review_count ?? null,
    lead.source_url || '',
    JSON.stringify(contacts.emails || []),
    JSON.stringify(contacts.additional_phones || []),
    contacts.owner_name || '',
    contacts.owner_title || '',
    contacts.owner_email || '',
    contacts.owner_phone || '',
    contacts.owner_linkedin || '',
    JSON.stringify(social),
    contacts.business_hours || '',
    audit.has_website ? 1 : 0,
    audit.website_status || 'unknown',
    audit.website_score ?? 0,
    audit.website_grade || 'F',
    JSON.stringify(audit.outdated_signals || []),
    JSON.stringify(audit.tech_stack || []),
    audit.https ? 1 : 0,
    audit.has_robots ? 1 : 0,
    audit.has_sitemap ? 1 : 0,
    audit.mobile_friendly ? 1 : 0,
    lead.search_query || '',
    lead.enrichment_status || '',
    lead.scraped_at || '',
    now,
    JSON.stringify(lead.raw_data || {})
  );

  return lead.lead_id;
}

/**
 * Get a lead by ID. Returns parsed JSON fields.
 */
export function getLeadById(leadId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId);
  return row ? parseLeadRow(row) : null;
}

/**
 * Get leads by CRM status.
 */
export function getLeadsByStatus(status, limit = 100) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY lead_score DESC LIMIT ?').all(status, limit);
  return rows.map(parseLeadRow);
}

/**
 * Get top-scored leads.
 */
export function getTopLeads(n = 20, statusFilter = null) {
  const db = getDb();
  let sql = 'SELECT * FROM leads';
  const params = [];
  if (statusFilter) {
    sql += ' WHERE status = ?';
    params.push(statusFilter);
  }
  sql += ' ORDER BY lead_score DESC LIMIT ?';
  params.push(n);
  return db.prepare(sql).all(...params).map(parseLeadRow);
}

/**
 * Update lead status.
 */
export function updateLeadStatus(leadId, newStatus, notes = '') {
  const db = getDb();
  const now = new Date().toISOString();

  const lead = db.prepare('SELECT status, status_history FROM leads WHERE lead_id = ?').get(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const history = JSON.parse(lead.status_history || '[]');
  history.push({ from: lead.status, to: newStatus, at: now, notes });

  db.prepare(`
    UPDATE leads SET status = ?, status_notes = ?, status_history = ?, updated_at = ?
    WHERE lead_id = ?
  `).run(newStatus, notes, JSON.stringify(history), now, leadId);
}

/**
 * Update lead score and related fields.
 */
export function updateLeadScore(leadId, scoreData) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE leads SET
      lead_score = ?, lead_grade = ?, lead_priority = ?,
      recommended_services = ?, score_reasoning = ?, updated_at = ?
    WHERE lead_id = ?
  `).run(
    scoreData.score,
    scoreData.grade,
    scoreData.priority,
    JSON.stringify(scoreData.recommended_services || []),
    scoreData.reasoning || '',
    now,
    leadId
  );
}

/**
 * Get all leads (with optional limit and offset for pagination).
 */
export function getAllLeads(limit = 500, offset = 0) {
  const db = getDb();
  return db.prepare('SELECT * FROM leads ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset)
    .map(parseLeadRow);
}

/**
 * Get leads that were updated exactly N days ago with a specific status.
 */
export function getLeadsForFollowUp(daysAgo, status = 'contacted') {
  const db = getDb();
  const dateStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = db.prepare('SELECT * FROM leads WHERE status = ? AND updated_at LIKE ?').all(status, `${dateStr}%`);
  return rows.map(parseLeadRow);
}

/**
 * Count leads by status (for CRM funnel).
 */
export function getLeadFunnelCounts() {
  const db = getDb();
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM leads GROUP BY status').all();
  const funnel = { new: 0, contacted: 0, replied: 0, proposal_sent: 0, negotiating: 0, closed_won: 0, closed_lost: 0 };
  for (const row of rows) {
    funnel[row.status] = row.count;
  }
  funnel.total = Object.values(funnel).reduce((a, b) => a + b, 0);
  return funnel;
}

/**
 * Check if a lead already exists by business name + address key.
 */
export function leadExistsByKey(businessName, address) {
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM leads WHERE business_name = ? AND address = ?').get(businessName, address);
}

// ─── Pipeline Jobs ────────────────────────────────────────────────────

export function createJob(jobId, jobType, config = {}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO pipeline_jobs (job_id, job_type, status, config, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, datetime('now'), datetime('now'))
  `).run(jobId, jobType, JSON.stringify(config));
  return jobId;
}

export function updateJobProgress(jobId, stage, processed, total, data = {}) {
  const db = getDb();
  db.prepare(`
    UPDATE pipeline_jobs SET
      current_stage = ?, processed_items = ?, total_items = ?,
      progress_data = ?, status = 'running', updated_at = datetime('now')
    WHERE job_id = ?
  `).run(stage, processed, total, JSON.stringify(data), jobId);
}

export function completeJob(jobId) {
  const db = getDb();
  db.prepare(`
    UPDATE pipeline_jobs SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
    WHERE job_id = ?
  `).run(jobId);
}

export function failJob(jobId, errorMessage) {
  const db = getDb();
  db.prepare(`
    UPDATE pipeline_jobs SET status = 'failed', error_message = ?, updated_at = datetime('now')
    WHERE job_id = ?
  `).run(errorMessage, jobId);
}

export function getLastJob(jobType = 'full') {
  const db = getDb();
  return db.prepare('SELECT * FROM pipeline_jobs WHERE job_type = ? ORDER BY created_at DESC LIMIT 1').get(jobType);
}

export function getJobById(jobId) {
  const db = getDb();
  return db.prepare('SELECT * FROM pipeline_jobs WHERE job_id = ?').get(jobId);
}

// ─── Email Log ────────────────────────────────────────────────────────

export function logEmail({ leadId, messageId, to, subject, template, metadata = {} }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO email_log (lead_id, message_id, to_address, subject, template_used, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leadId, messageId || '', to, subject || '', template || '', JSON.stringify(metadata));
  return result.lastInsertRowid;
}

export function getEmailsForLead(leadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM email_log WHERE lead_id = ? ORDER BY sent_at DESC').all(leadId);
}

export function getEmailByMessageId(messageId) {
  const db = getDb();
  return db.prepare('SELECT * FROM email_log WHERE message_id = ?').get(messageId);
}

export function getTodayEmailCount() {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM email_log
    WHERE date(sent_at) = date('now') AND status = 'sent'
  `).get();
  return row?.count || 0;
}

// ─── Replies ──────────────────────────────────────────────────────────

export function logReply({ leadId, emailLogId, from, subject, body, sentiment, detectedVia }) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO replies (lead_id, email_log_id, from_address, subject, body_text, sentiment, detected_via)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(leadId, emailLogId || null, from || '', subject || '', body || '', sentiment || 'neutral', detectedVia || 'imap');
}

export function getRepliesForLead(leadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM replies WHERE lead_id = ? ORDER BY received_at DESC').all(leadId);
}

export function getUnprocessedReplies() {
  const db = getDb();
  return db.prepare('SELECT * FROM replies WHERE processed = 0 ORDER BY received_at ASC').all();
}

export function markReplyProcessed(replyId) {
  const db = getDb();
  db.prepare('UPDATE replies SET processed = 1 WHERE id = ?').run(replyId);
}

// ─── Proposals ────────────────────────────────────────────────────────

export function saveProposal({ leadId, html, slug, services, totalPrice, paymentLink }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM proposals WHERE lead_id = ?').get(leadId);
  if (existing) {
    db.prepare(`
      UPDATE proposals SET
        proposal_html = ?, proposal_slug = ?, services = ?,
        total_price = ?, payment_link = ?, updated_at = datetime('now')
      WHERE lead_id = ?
    `).run(html, slug, JSON.stringify(services || []), totalPrice || 0, paymentLink || '', leadId);
    return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO proposals (lead_id, proposal_html, proposal_slug, services, total_price, payment_link)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leadId, html, slug, JSON.stringify(services || []), totalPrice || 0, paymentLink || '');
  return result.lastInsertRowid;
}

export function getProposalForLead(leadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM proposals WHERE lead_id = ?').get(leadId);
}

export function updateProposalStatus(leadId, status) {
  const db = getDb();
  db.prepare('UPDATE proposals SET status = ?, updated_at = datetime(\'now\') WHERE lead_id = ?').run(status, leadId);
}

// ─── Payments ─────────────────────────────────────────────────────────

export function savePayment({ leadId, proposalId, stripeLinkId, stripeLinkUrl, amount, currency }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO payments (lead_id, proposal_id, stripe_payment_link_id, stripe_payment_link_url, amount, currency)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leadId, proposalId || null, stripeLinkId || '', stripeLinkUrl || '', amount || 0, currency || 'usd');
  return result.lastInsertRowid;
}

export function updatePaymentStatus(stripeLinkId, status, sessionId = '') {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE payments SET status = ?, stripe_session_id = ?, paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END, metadata = ?
    WHERE stripe_payment_link_id = ?
  `).run(status, sessionId, status, now, JSON.stringify({ updated_at: now }), stripeLinkId);
}

export function getPaymentForLead(leadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM payments WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1').get(leadId);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function parseLeadRow(row) {
  if (!row) return null;
  return {
    ...row,
    emails: safeParse(row.emails, []),
    additional_phones: safeParse(row.additional_phones, []),
    social: safeParse(row.social, {}),
    outdated_signals: safeParse(row.outdated_signals, []),
    tech_stack: safeParse(row.tech_stack, []),
    recommended_services: safeParse(row.recommended_services, []),
    status_history: safeParse(row.status_history, []),
    raw_data: safeParse(row.raw_data, {}),
    has_website: !!row.has_website,
    https: !!row.https,
    has_robots: !!row.has_robots,
    has_sitemap: !!row.has_sitemap,
    mobile_friendly: !!row.mobile_friendly,
  };
}

function safeParse(json, fallback) {
  if (typeof json !== 'string') return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

/**
 * Close the database connection. Call on process exit.
 */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
