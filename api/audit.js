import { auditWebsite } from '../website-auditor.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { website: rawWebsite } = body || {};

  if (!rawWebsite || typeof rawWebsite !== 'string' || rawWebsite.trim().length === 0) {
    return res.status(400).json({ error: 'Website URL is required' });
  }

  let url = rawWebsite.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  try {
    const audit = await auditWebsite(url);

    const score = audit.website_score ?? 0;
    let grade = 'F';
    let color = '#ef4444';
    if (score >= 90) { grade = 'A'; color = '#22c55e'; }
    else if (score >= 80) { grade = 'B'; color = '#84cc16'; }
    else if (score >= 65) { grade = 'C'; color = '#f59e0b'; }
    else if (score >= 50) { grade = 'D'; color = '#f97316'; }

    const signals = (audit.outdated_signals || [])
      .filter(s => s && s !== 'No obvious outdated signals found')
      .slice(0, 5);

    let service = { name: 'Custom Website Build', price: '$2,500 – $5,000', desc: 'A fully custom website designed for your business.' };
    if (audit.has_website && (grade === 'D' || grade === 'F')) {
      service = { name: 'Website Redesign', price: '$1,500 – $3,500', desc: `Your site scored ${grade} (${score}/100). We'll rebuild it with modern design, HTTPS, and mobile optimization.` };
    } else if (audit.has_website) {
      service = { name: 'SEO & Speed Optimization', price: '$800 – $1,500', desc: 'Fix technical SEO issues, improve load speed, and boost your search rankings.' };
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json({
      website: audit.website,
      score,
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
    console.error('[api/audit] Error:', err.message);
    return res.status(500).json({ error: 'Audit failed. Please try again.', website: url });
  }
}
