import express from 'express';
import { auditWebsite } from './website-auditor.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');
const WIDGET_SCRIPT_PATH = path.join(__dirname, 'public', 'audit-widget.js');

let INDEX_HTML_CACHE = null;
let WIDGET_SCRIPT_CACHE = null;

/**
 * Resolve a clean URL from user input (handles missing protocol).
 */
function normalizeWebsite(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    new URL(url);
    return url.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Convert audit score to grade (A-F) with color.
 */
function scoreToGrade(score) {
  if (score >= 90) return { grade: 'A', color: '#22c55e' };
  if (score >= 80) return { grade: 'B', color: '#84cc16' };
  if (score >= 65) return { grade: 'C', color: '#f59e0b' };
  if (score >= 50) return { grade: 'D', color: '#f97316' };
  return { grade: 'F', color: '#ef4444' };
}

/**
 * Pick top 5 outdated signals, ensuring diversity.
 */
function pickTopSignals(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return ['No major issues detected'];
  return signals
    .filter(s => s !== 'No obvious outdated signals found')
    .slice(0, 5);
}

/**
 * Determine the primary service recommendation based on audit.
 */
function recommendService(audit) {
  const { website_score, website_grade, has_website, https, mobile_friendly, outdated_signals } = audit;
  const signals = JSON.parse(typeof outdated_signals === 'string' ? outdated_signals : JSON.stringify(outdated_signals || []));

  if (!has_website || !audit.website) {
    return {
      name: 'Custom Website Build',
      price: '$2,500 – $5,000',
      desc: 'A fully custom website designed for your business — mobile-first, SEO-optimized, and built to convert.',
    };
  }

  if (website_grade === 'F' || website_grade === 'D') {
    return {
      name: 'Website Redesign',
      price: '$1,500 – $3,500',
      desc: `Your site scored ${website_grade} (${website_score}/100). We'll rebuild it with modern design, HTTPS, and mobile optimization.`,
    };
  }

  const hasSEOIssues = signals.some(s => /title|meta|sitemap|robots|viewport|https/i.test(s));
  if (hasSEOIssues) {
    return {
      name: 'SEO & Speed Optimization',
      price: '$800 – $1,500',
      desc: 'Fix technical SEO issues, improve load speed, and boost your search rankings.',
    };
  }

  return {
    name: 'Website Health Check & Optimization',
    price: '$500',
    desc: 'Comprehensive audit and targeted fixes to keep your site performing at its best.',
  };
}

/**
 * API endpoint: POST /api/audit
 * Accepts { website: "example.com" } or { website: "https://example.com" }
 */
app.post('/api/audit', async (req, res) => {
  const { website: rawWebsite } = req.body;

  if (!rawWebsite || typeof rawWebsite !== 'string' || rawWebsite.trim().length === 0) {
    return res.status(400).json({ error: 'Website URL is required' });
  }

  const website = normalizeWebsite(rawWebsite);
  if (!website) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const audit = await auditWebsite(website);
    const { grade, color } = scoreToGrade(audit.website_score || 0);
    const signals = pickTopSignals(audit.outdated_signals);
    const service = recommendService(audit);

    res.json({
      website: audit.website,
      score: audit.website_score || 0,
      grade,
      grade_color: color,
      has_website: audit.has_website,
      website_status: audit.website_status,
      https: audit.https,
      has_robots: audit.has_robots,
      has_sitemap: audit.has_sitemap,
      mobile_friendly: audit.mobile_friendly,
      tech_stack: audit.tech_stack || [],
      outdated_signals: signals,
      recommended_service: service,
      prepared_at: new Date().toISOString(),
      cal_link: process.env.CAL_LINK || 'https://cal.com/artum8labs',
      company_name: process.env.COMPANY_NAME || 'Artum 8 Labs',
    });
  } catch (err) {
    console.error('[audit-widget] Audit error:', err.message);
    res.status(500).json({ error: 'Audit failed. Please try again.', website });
  }
});

/**
 * Serve the standalone landing page at /
 */
app.get('/', async (req, res) => {
  if (!INDEX_HTML_CACHE) {
    INDEX_HTML_CACHE = await fs.readFile(INDEX_HTML_PATH, 'utf8');
  }
  res.send(INDEX_HTML_CACHE);
});

/**
 * Serve the embeddable widget script at /widget.js
 */
app.get('/widget.js', async (req, res) => {
  res.setHeader('Content-Type', 'text/javascript');
  if (!WIDGET_SCRIPT_CACHE) {
    WIDGET_SCRIPT_CACHE = await fs.readFile(WIDGET_SCRIPT_PATH, 'utf8');
  }
  res.send(WIDGET_SCRIPT_CACHE);
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'artum8labs-audit-widget' });
});

app.listen(PORT, () => {
  console.log(`[audit-widget] Artum 8 Labs audit widget running on port ${PORT}`);
});

export { app };
