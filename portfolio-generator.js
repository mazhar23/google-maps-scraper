import fs from 'fs/promises';
import path from 'path';
import { getLeadById } from './db.js';

/**
 * Generate a before/after portfolio report from a lead's audit data.
 * This creates a self-contained HTML page showing:
 * - Current state issues with severity
 * - Projected improvements with expected impact
 * - Industry benchmarks
 * - Score gauge (before → after)
 *
 * @param {string} leadId
 * @returns {{ html: string, filePath: string }}
 */
export async function generatePortfolio(leadId) {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const html = buildPortfolioHtml(lead);

  const outputDir = path.join(process.cwd(), 'output', 'portfolios');
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `portfolio-${sanitize(lead.business_name)}-${Date.now()}.html`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, html, 'utf8');

  console.log(`[portfolio] Generated for "${lead.business_name}" → ${filePath}`);
  return { html, filePath };
}

/**
 * Build the full portfolio HTML.
 */
function buildPortfolioHtml(lead) {
  const biz = esc(lead.business_name || 'Business');
  const category = esc(lead.category || 'Local Business');
  const location = [lead.city, lead.state].filter(Boolean).join(', ');
  const currentGrade = lead.website_grade || 'F';
  const currentScore = lead.website_score ?? 0;
  const projectedScore = Math.min(100, currentScore + 35 + Math.floor(Math.random() * 10));
  const projectedGrade = scoreToGrade(projectedScore);
  const outdated = Array.isArray(lead.outdated_signals) ? lead.outdated_signals : [];
  const issues = outdated.filter(s => s !== 'No obvious outdated signals found');
  const techStack = Array.isArray(lead.tech_stack) ? lead.tech_stack : [];

  // Industry benchmarks
  const benchmarks = getIndustryBenchmarks(category);

  // Build before items
  const beforeItems = issues.map(issue => {
    const sev = severity(issue);
    return `<div class="item ${sev}"><span class="dot ${sev}"></span><span>${esc(issue)}</span></div>`;
  }).join('\n');

  // Build after items (projected fixes)
  const afterItems = issues.map(issue => {
    const fix = getFixDescription(issue);
    return `<div class="item fixed"><span class="dot fixed"></span><span>${esc(fix)}</span></div>`;
  }).join('\n');

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Website Audit Report — ${biz}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f172a;--card:#1e293b;--text:#f1f5f9;--muted:#94a3b8;--dim:#64748b;--primary:#4f46e5;--primary-light:#818cf8;--red:#ef4444;--yellow:#f59e0b;--green:#22c55e;--blue:#3b82f6;--gradient:linear-gradient(135deg,#4f46e5,#7c3aed,#a855f7)}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.container{max-width:900px;margin:0 auto;padding:0 24px}

.header{text-align:center;padding:60px 0 40px}
.header .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(79,70,229,0.12);border:1px solid rgba(79,70,229,0.2);border-radius:100px;padding:5px 16px;font-size:.7rem;font-weight:600;color:var(--primary-light);margin-bottom:16px}
.header h1{font-size:clamp(1.6rem,4vw,2.5rem);font-weight:900;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.header p{color:var(--muted);font-size:.9rem;max-width:500px;margin:0 auto}
.header .date{font-size:.75rem;color:var(--dim);margin-top:8px}

section{padding:40px 0}
.label{font-size:.65rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--primary-light);margin-bottom:8px;text-align:center}
.title{font-size:clamp(1.2rem,3vw,1.8rem);font-weight:800;margin-bottom:8px;text-align:center}
.desc{text-align:center;max-width:500px;margin:0 auto 32px;color:var(--muted);font-size:.85rem}

/* Comparison */
.comparison{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:start}
.comparison-col{background:var(--card);border-radius:16px;padding:28px;border:1px solid rgba(255,255,255,0.06)}
.comparison-col.before{border-top:3px solid var(--red)}
.comparison-col.after{border-top:3px solid var(--green)}
.comparison-col h3{font-size:.9rem;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.comparison-col h3 .emoji{font-size:1.2rem}
.arrow{display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--dim);padding-top:40px}
.item{display:flex;align-items:flex-start;gap:10px;padding:8px 0;font-size:.8rem;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px}
.dot.critical{background:var(--red)}
.dot.warning{background:var(--yellow)}
.dot.info{background:var(--blue)}
.dot.fixed{background:var(--green)}
.item.fixed{color:var(--green)}

/* Gauges */
.gauges{display:flex;justify-content:center;gap:60px;margin:32px 0}
.gauge-box{text-align:center}
.gauge-box .gauge-label{font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
.gauge{position:relative;width:120px;height:120px;display:inline-block}
.gauge svg{transform:rotate(-90deg)}
.gauge-bg{fill:none;stroke:rgba(255,255,255,0.06);stroke-width:10}
.gauge-fill{fill:none;stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset 1.5s ease}
.gauge-val{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2rem;font-weight:900}
.gauge-grade{font-size:.85rem;font-weight:700;margin-top:6px}

/* Benchmarks */
.benchmarks{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:24px}
.bench-card{background:var(--card);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center}
.bench-card .stat{font-size:1.4rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.bench-card .bench-label{font-size:.7rem;color:var(--dim);margin-top:4px}

/* Tech */
.tech-pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px}
.tech-pill{background:rgba(79,70,229,0.1);border:1px solid rgba(79,70,229,0.2);border-radius:100px;padding:4px 14px;font-size:.7rem;font-weight:600;color:var(--primary-light)}

footer{padding:32px 0;border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-size:.7rem;color:var(--dim)}

@media(max-width:700px){
.comparison{grid-template-columns:1fr;gap:16px}
.arrow{transform:rotate(90deg);padding:0}
.gauges{flex-direction:column;align-items:center;gap:32px}
}
</style>
</head>
<body>

<div class="header">
<div class="container">
<div class="badge">📊 Website Audit Report</div>
<h1>${biz} — Online Presence Analysis</h1>
<p>A comprehensive review of your current website and digital presence, with actionable recommendations${location ? ` for businesses in ${esc(location)}` : ''}.</p>
<div class="date">${date}</div>
</div>
</div>

<section>
<div class="container">
<div class="label">Score Comparison</div>
<div class="title">Before & After</div>
<div class="desc">See how your online presence score could improve with our recommended changes.</div>
<div class="gauges">
<div class="gauge-box">
<div class="gauge-label">Current Score</div>
<div class="gauge">
<svg width="120" height="120" viewBox="0 0 120 120">
<circle class="gauge-bg" cx="60" cy="60" r="50"/>
<circle class="gauge-fill" cx="60" cy="60" r="50"
  stroke="${gradeColor(currentGrade)}"
  stroke-dasharray="${2 * Math.PI * 50}"
  stroke-dashoffset="${2 * Math.PI * 50 * (1 - currentScore / 100)}"/>
</svg>
<div class="gauge-val" style="color:${gradeColor(currentGrade)}">${currentScore}</div>
</div>
<div class="gauge-grade" style="color:${gradeColor(currentGrade)}">Grade: ${currentGrade}</div>
</div>
<div class="gauge-box">
<div class="gauge-label">Projected Score</div>
<div class="gauge">
<svg width="120" height="120" viewBox="0 0 120 120">
<circle class="gauge-bg" cx="60" cy="60" r="50"/>
<circle class="gauge-fill" cx="60" cy="60" r="50"
  stroke="${gradeColor(projectedGrade)}"
  stroke-dasharray="${2 * Math.PI * 50}"
  stroke-dashoffset="${2 * Math.PI * 50 * (1 - projectedScore / 100)}"/>
</svg>
<div class="gauge-val" style="color:${gradeColor(projectedGrade)}">${projectedScore}</div>
</div>
<div class="gauge-grade" style="color:${gradeColor(projectedGrade)}">Grade: ${projectedGrade}</div>
</div>
</div>
</div>
</section>

<section>
<div class="container">
<div class="label">Detailed Analysis</div>
<div class="title">Issues Found vs. Recommended Fixes</div>
<div class="comparison">
<div class="comparison-col before">
<h3><span class="emoji">🔍</span> Current Issues</h3>
${beforeItems || '<div class="item info"><span class="dot info"></span><span>No major issues detected</span></div>'}
</div>
<div class="arrow">→</div>
<div class="comparison-col after">
<h3><span class="emoji">✨</span> After Our Work</h3>
${afterItems || '<div class="item fixed"><span class="dot fixed"></span><span>Already looking good!</span></div>'}
</div>
</div>
</div>
</section>

<section>
<div class="container">
<div class="label">Industry Context</div>
<div class="title">How ${esc(category)} Businesses Compare</div>
<div class="benchmarks">
${benchmarks.map(b => `
<div class="bench-card">
<div class="stat">${b.stat}</div>
<div class="bench-label">${esc(b.label)}</div>
</div>`).join('\n')}
</div>
${techStack.length > 0 ? `
<div style="text-align:center;margin-top:32px">
<div class="label">Detected Technology</div>
<div class="tech-pills">
${techStack.map(t => `<span class="tech-pill">${esc(t)}</span>`).join('\n')}
</div>
</div>` : ''}
</div>
</section>

<footer>
<div class="container">
<p><strong>GrowDigital</strong> — Helping local businesses grow online.</p>
<p>© ${new Date().getFullYear()} GrowDigital. All rights reserved.</p>
</div>
</footer>

</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getFixDescription(issue) {
  const fixes = {
    'No HTTPS':                   'SSL certificate installed — secure HTTPS connection',
    'Missing or tiny title':      'SEO-optimized title tag with target keywords',
    'Missing meta description':   'Compelling meta description driving click-throughs',
    'No viewport meta':           'Mobile-responsive viewport configuration',
    'Very old copyright':         'Updated branding with current year',
    'Stale copyright year':       'Auto-updating copyright year',
    'Very old HTML patterns':     'Modern HTML5 semantic structure',
    'Deprecated presentational HTML': 'Clean CSS-based styling, no deprecated tags',
    'Possible table-based layout':'Modern CSS Grid/Flexbox layout',
    'Stale footer year':          'Dynamic footer with current year',
    'Placeholder/unfinished content': 'Professional, complete content throughout',
  };

  for (const [pattern, fix] of Object.entries(fixes)) {
    if (issue.includes(pattern) || issue.toLowerCase().includes(pattern.toLowerCase())) {
      return fix;
    }
  }

  if (/inline styles/i.test(issue)) return 'External CSS stylesheet — clean, maintainable code';
  if (/bootstrap/i.test(issue)) return 'Modern CSS framework with latest features';
  if (/jquery/i.test(issue)) return 'Vanilla JS or modern framework — faster, lighter';

  return 'Fixed and optimized';
}

function getIndustryBenchmarks(category) {
  return [
    { stat: '85%', label: `of top ${category} sites use HTTPS` },
    { stat: '78%', label: 'of customers check a business website before visiting' },
    { stat: '3.5s', label: 'max load time before visitors leave' },
    { stat: '61%', label: 'of searches are from mobile devices' },
    { stat: '4.2★', label: 'average Google rating for top local businesses' },
    { stat: '72%', label: 'of consumers trust online reviews as much as referrals' },
  ];
}

function severity(issue) {
  const s = issue.toLowerCase();
  if (/no https|missing|deprecated|very old|down/i.test(s)) return 'critical';
  if (/stale|high inline|table/i.test(s)) return 'warning';
  return 'info';
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function gradeColor(grade) {
  return { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', F: '#ef4444' }[grade] || '#ef4444';
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitize(name) {
  return (name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}
