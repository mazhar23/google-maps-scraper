import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getLeadById, saveProposal, getProposalForLead } from './db.js';
import { scoreLead } from './lead-scorer.js';

/**
 * Generate a personalized HTML proposal for a lead.
 *
 * @param {string} leadId - The lead's database ID
 * @param {object} options - Optional overrides
 * @param {string} options.paymentLink - Pre-generated Stripe payment link URL
 * @returns {{ html: string, slug: string, proposalId: number, filePath: string }}
 */
export async function generateProposal(leadId, options = {}) {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Score the lead if not already scored
  const scoreData = lead.lead_score > 0
    ? { score: lead.lead_score, grade: lead.lead_grade, priority: lead.lead_priority, recommended_services: lead.recommended_services, reasoning: lead.score_reasoning }
    : scoreLead(lead);

  const slug = generateSlug(lead.business_name);
  const services = scoreData.recommended_services || [];
  const totalPrice = services.reduce((sum, s) => sum + (s.price_min || 0), 0);
  const paymentLink = options.paymentLink || process.env.CUSTOM_PAYMENT_LINK || '';

  // Build the proposal HTML
  const html = buildProposalHtml({
    lead,
    scoreData,
    services,
    totalPrice,
    paymentLink,
    slug,
  });

  // Save to database
  const proposalId = saveProposal({
    leadId,
    html,
    slug,
    services,
    totalPrice,
    paymentLink,
  });

  // Save to filesystem
  const outputDir = path.join(process.cwd(), 'output', 'proposals');
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${slug}.html`);
  await fs.writeFile(filePath, html, 'utf8');

  console.log(`[proposal] Generated proposal for "${lead.business_name}" → ${filePath}`);

  return { html, slug, proposalId, filePath, totalPrice, services };
}

/**
 * Build the full proposal HTML from lead data.
 */
function buildProposalHtml({ lead, scoreData, services, totalPrice, paymentLink, slug }) {
  const businessName = escHtml(lead.business_name || 'Your Business');
  const ownerName = escHtml(lead.owner_name || 'Business Owner');
  const category = escHtml(lead.category || 'Local Business');
  const city = escHtml(lead.city || '');
  const state = escHtml(lead.state || '');
  const location = [city, state].filter(Boolean).join(', ');
  const websiteGrade = lead.website_grade || 'N/A';
  const websiteScore = lead.website_score ?? 0;
  const outdatedSignals = Array.isArray(lead.outdated_signals) ? lead.outdated_signals : [];
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build issue cards
  const issueCards = outdatedSignals
    .filter(s => s !== 'No obvious outdated signals found')
    .map(signal => {
      const severity = getSeverity(signal);
      return `
        <div class="issue-card ${severity}">
          <div class="issue-icon">${severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵'}</div>
          <div class="issue-text">
            <strong>${severity.toUpperCase()}</strong>
            <p>${escHtml(signal)}</p>
            <a href="${process.env.CAL_LINK || 'https://cal.com/artum8labs'}" target="_blank" style="display:inline-block; margin-top: 10px; font-size: 0.8rem; color: var(--primary-light); font-weight: 600;">Discuss this issue →</a>
          </div>
        </div>`;
    }).join('\n');

  // Build service cards
  const serviceCards = services.map((svc, i) => `
    <div class="service-card ${i === 0 ? 'featured' : ''}">
      <div class="service-header">
        <h3>${escHtml(svc.name)}</h3>
        <div class="service-price">$${svc.price_min}${svc.price_max > svc.price_min ? ` — $${svc.price_max}` : ''}</div>
      </div>
      <p class="service-reason">${escHtml(svc.reason || '')}</p>
    </div>`).join('\n');

  // Build the payment CTA
  const calLink = process.env.CAL_LINK || 'https://cal.com/artum8labs';
  const ctaButton = paymentLink
    ? `<a href="${escHtml(paymentLink)}" class="btn btn-primary" target="_blank">Accept & Pay → Start Your Project</a>`
    : `<a href="${escHtml(calLink)}" class="btn btn-primary" target="_blank">Schedule Kickoff Call →</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Custom Proposal for ${businessName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
--primary:#4f46e5;--primary-dark:#3730a3;--primary-light:#818cf8;
--accent:#f59e0b;--accent-dark:#d97706;
--bg-dark:#0f172a;--bg-card:#1e293b;--bg-card-hover:#334155;
--text:#f1f5f9;--text-muted:#94a3b8;--text-dim:#64748b;
--gradient:linear-gradient(135deg,#4f46e5,#7c3aed,#a855f7);
--gradient-accent:linear-gradient(135deg,#f59e0b,#ef4444);
--red:#ef4444;--yellow:#f59e0b;--green:#22c55e;--blue:#3b82f6;
--radius:16px;--radius-sm:10px;
}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg-dark);color:var(--text);line-height:1.6;min-height:100vh}
a{color:var(--primary-light);text-decoration:none}
.container{max-width:900px;margin:0 auto;padding:0 24px}

nav{position:sticky;top:0;z-index:100;backdrop-filter:blur(16px);background:rgba(15,23,42,0.85);border-bottom:1px solid rgba(255,255,255,0.06)}
nav .container{display:flex;align-items:center;justify-content:space-between;height:64px}
nav .logo{font-size:1.25rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}

.hero{position:relative;overflow:hidden;padding:80px 0 60px}
.hero::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 30% 20%,rgba(79,70,229,0.15) 0%,transparent 50%),radial-gradient(ellipse at 70% 80%,rgba(168,85,247,0.1) 0%,transparent 50%);animation:heroFloat 20s ease-in-out infinite}
@keyframes heroFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-3%,2%)}}
.hero .container{position:relative;z-index:1;text-align:center}
.hero h1{font-size:clamp(1.8rem,4vw,3rem);font-weight:900;line-height:1.1;margin-bottom:16px;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero p{max-width:600px;margin:0 auto 24px;font-size:1rem;color:var(--text-muted)}
.hero .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(79,70,229,0.12);border:1px solid rgba(79,70,229,0.2);border-radius:100px;padding:6px 18px;font-size:.75rem;font-weight:600;color:var(--primary-light);margin-bottom:20px}
.hero .badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.hero .date{font-size:.8rem;color:var(--text-dim);margin-top:8px}

section{padding:48px 0}
.section-label{text-align:center;font-size:.7rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--primary-light);margin-bottom:10px}
.section-title{text-align:center;font-size:clamp(1.3rem,3vw,2rem);font-weight:800;margin-bottom:10px}
.section-desc{text-align:center;max-width:560px;margin:0 auto 36px;color:var(--text-muted);font-size:.9rem}

/* Score Gauge */
.score-section{text-align:center;padding:40px 0}
.gauge-container{display:inline-flex;flex-direction:column;align-items:center;gap:12px}
.gauge{position:relative;width:160px;height:160px}
.gauge svg{transform:rotate(-90deg)}
.gauge-bg{fill:none;stroke:rgba(255,255,255,0.06);stroke-width:12}
.gauge-fill{fill:none;stroke-width:12;stroke-linecap:round;transition:stroke-dashoffset 1.5s ease}
.gauge-text{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
.gauge-text .score{font-size:2.5rem;font-weight:900;line-height:1}
.gauge-text .label{font-size:.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em}
.gauge-grade{font-size:1rem;font-weight:700;margin-top:4px}

/* Issues */
.issues{display:flex;flex-direction:column;gap:12px;margin-top:24px}
.issue-card{display:flex;gap:14px;align-items:flex-start;background:var(--bg-card);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-sm);padding:16px 20px;transition:border-color .3s}
.issue-card:hover{border-color:rgba(255,255,255,0.12)}
.issue-card.critical{border-left:3px solid var(--red)}
.issue-card.warning{border-left:3px solid var(--yellow)}
.issue-card.info{border-left:3px solid var(--blue)}
.issue-icon{font-size:1.2rem;flex-shrink:0;margin-top:2px}
.issue-text strong{font-size:.7rem;letter-spacing:.08em;color:var(--text-dim)}
.issue-text p{font-size:.85rem;color:var(--text-muted);margin-top:2px}

/* Services */
.services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-top:24px}
.service-card{background:var(--bg-card);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius);padding:28px;transition:transform .3s,border-color .3s}
.service-card:hover{transform:translateY(-3px);border-color:rgba(79,70,229,0.3)}
.service-card.featured{border-color:rgba(245,158,11,0.4);background:linear-gradient(180deg,rgba(245,158,11,0.06) 0%,var(--bg-card) 40%)}
.service-card.featured::before{content:'RECOMMENDED';display:block;font-size:.6rem;font-weight:700;letter-spacing:.12em;color:var(--accent);margin-bottom:12px}
.service-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
.service-header h3{font-size:1rem;font-weight:700}
.service-price{font-size:1.1rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.service-reason{font-size:.8rem;color:var(--text-dim);line-height:1.5}

/* CTA */
.cta-section{text-align:center;padding:60px 0}
.cta-section h2{font-size:1.5rem;font-weight:800;margin-bottom:12px}
.cta-section p{color:var(--text-muted);margin-bottom:28px;max-width:480px;margin-left:auto;margin-right:auto}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;border-radius:100px;font-size:.9rem;font-weight:600;transition:all .2s;cursor:pointer;border:none;text-decoration:none}
.btn-primary{background:var(--gradient);color:#fff;box-shadow:0 4px 20px rgba(79,70,229,0.3)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(79,70,229,0.4)}
.total-price{font-size:2rem;font-weight:900;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:20px 0 8px}
.total-note{font-size:.75rem;color:var(--text-dim);margin-bottom:24px}

footer{padding:36px 0;border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-size:.75rem;color:var(--text-dim)}
footer p{margin:3px 0}

@media(max-width:640px){
.services-grid{grid-template-columns:1fr}
.service-header{flex-direction:column}
}
</style>
</head>
<body>

<nav>
<div class="container">
<div class="logo">GrowDigital</div>
<span style="font-size:.8rem;color:var(--text-dim)">Custom Proposal</span>
</div>
</nav>

<section class="hero">
<div class="container">
<div class="badge">Prepared Exclusively For ${businessName}</div>
<h1>Your Business Deserves A Stronger Online Presence</h1>
<p>Hi ${ownerName}, we've analyzed <strong>${businessName}</strong>${location ? ` in ${location}` : ''} and found specific opportunities to help you attract more customers online.</p>
<div class="date">Prepared on ${currentDate}</div>
</div>
</section>

<section class="score-section">
<div class="container">
<div class="section-label">Current Website Assessment</div>
<div class="section-title">Your Online Presence Score</div>
<div class="gauge-container">
<div class="gauge">
<svg width="160" height="160" viewBox="0 0 160 160">
<circle class="gauge-bg" cx="80" cy="80" r="68"/>
<circle class="gauge-fill" cx="80" cy="80" r="68"
  stroke="${getGradeColor(websiteGrade)}"
  stroke-dasharray="${2 * Math.PI * 68}"
  stroke-dashoffset="${2 * Math.PI * 68 * (1 - websiteScore / 100)}"/>
</svg>
<div class="gauge-text">
<div class="score" style="color:${getGradeColor(websiteGrade)}">${websiteScore}</div>
<div class="label">out of 100</div>
</div>
</div>
<div class="gauge-grade" style="color:${getGradeColor(websiteGrade)}">Grade: ${websiteGrade}</div>
</div>
</div>
</section>

${issueCards ? `
<section>
<div class="container">
<div class="section-label">Issues Found</div>
<div class="section-title">What's Holding You Back</div>
<div class="section-desc">Our audit found these specific issues that could be costing you customers right now.</div>
<div class="issues">
${issueCards}
</div>
</div>
</section>
` : ''}

<section>
<div class="container">
<div class="section-label">Our Recommendation</div>
<div class="section-title">Services Tailored For ${businessName}</div>
<div class="section-desc">Based on our analysis, here's exactly what we recommend to transform your online presence.</div>
<div class="services-grid">
${serviceCards}
</div>
</div>
</section>

<section class="cta-section">
<div class="container">
<h2>Ready To Grow Your Business?</h2>
<p>Every price is negotiable — let's find the right package that fits your budget and goals.</p>
<div class="total-price">Starting from $${totalPrice}</div>
<div class="total-note">Prices negotiable • No long-term contracts</div>
${ctaButton}
</div>
</section>

<footer>
<div class="container">
<p><strong>GrowDigital</strong> — Helping local businesses grow online.</p>
<p>© ${new Date().getFullYear()} GrowDigital. All rights reserved. Proposal ID: ${slug}</p>
</div>
</footer>

</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function generateSlug(name) {
  const base = (name || 'proposal')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const id = uuidv4().slice(0, 8);
  return `${base}-${id}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSeverity(signal) {
  const s = signal.toLowerCase();
  if (/no https|missing|deprecated|very old|down/i.test(s)) return 'critical';
  if (/stale|high inline|table.based|placeholder/i.test(s)) return 'warning';
  return 'info';
}

function getGradeColor(grade) {
  const colors = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', F: '#ef4444' };
  return colors[grade] || colors.F;
}

/**
 * Get an existing proposal for a lead (from DB).
 */
export function getProposal(leadId) {
  return getProposalForLead(leadId);
}
