/**
 * Lead Scoring Engine
 *
 * Composite score (0–100) from multiple signals.
 * Higher score = better lead (more likely to convert).
 * Leads with worse websites and fewer online signals score higher
 * because they need our services more.
 */

// ─── Industry Value Map ───────────────────────────────────────────────
// High-value niches that typically have higher budgets for web services.
const INDUSTRY_VALUE = {
  // Tier 1: High value ($5k+ typical project value)
  dental:        20, dentist:       20, orthodont:     20,
  medical:       20, doctor:        20, physician:     20, clinic:     20,
  legal:         20, lawyer:        20, attorney:      20, law:        20,
  'real estate': 18, realtor:       18, realty:        18,
  plastic:       20, cosmetic:      20, dermatolog:    20, medspa:     18,
  veterinar:     17, vet:           17,

  // Tier 2: Good value ($2k-5k typical project value)
  accounti:      15, cpa:           15, tax:           15,
  insurance:     15, financial:     15, mortgage:      15,
  chiropract:    14, physiother:    14, therapy:       14,
  plumb:         14, hvac:          14, electric:      14,
  roofing:       14, construct:     14, contractor:    14,
  auto:          13, mechanic:      13, body_shop:     13,

  // Tier 3: Moderate value ($1k-2k)
  restaurant:    10, cafe:          10, catering:      10,
  salon:         10, barber:        10, spa:           10, beauty:     10,
  fitness:       10, gym:           10, yoga:          10, personal_train: 10,
  daycare:       10, childcare:     10, preschool:     10,
  pet:           10, grooming:      10,

  // Tier 4: Lower value but high volume
  retail:         8, shop:           8, store:          8,
  cleaning:       8, maid:           8, janitorial:     8,
  landscap:       8, lawn:           8, garden:         8,
};

// ─── Service Recommendations ──────────────────────────────────────────
const SERVICE_CATALOG = [
  { id: 'website_mockup',    name: 'Professional Website Mockup', price_min: 200, price_max: 300 },
  { id: 'monthly_seo',       name: 'Monthly SEO & Geo Boosting',  price_min: 120, price_max: 150 },
  { id: 'automation',        name: 'Business Process Automation',  price_min: 300, price_max: 800 },
  { id: 'ai_calls',          name: 'AI Representative For Calls',  price_min: 150, price_max: 400 },
  { id: 'social_media',      name: 'Social Media Management',      price_min: 100, price_max: 250 },
  { id: 'google_ads',        name: 'Google & Meta Ads',            price_min: 200, price_max: 500 },
  { id: 'review_management', name: 'Review Management',            price_min: 80,  price_max: 150 },
];

/**
 * Score a lead based on multiple signals.
 *
 * @param {object} lead - Lead object with audit, contact, and business data
 * @returns {{ score: number, grade: string, priority: string, recommended_services: object[], reasoning: string }}
 */
export function scoreLead(lead) {
  const signals = [];
  let rawScore = 0;

  // ─── 1. Website Grade Score (30% weight) ────────────────────────────
  // Worse website = better lead for us
  const websiteGrade = lead.website_grade || lead.website_audit?.website_grade || 'F';
  const websiteScore = lead.website_score ?? lead.website_audit?.website_score ?? 0;
  const hasWebsite = lead.has_website ?? lead.website_audit?.has_website ?? false;

  if (!hasWebsite || !lead.website) {
    rawScore += 30;
    signals.push('No website found — maximum opportunity');
  } else {
    const gradePoints = { F: 30, D: 22, C: 15, B: 8, A: 2 };
    const pts = gradePoints[websiteGrade] ?? 15;
    rawScore += pts;
    if (pts >= 22) signals.push(`Website grade ${websiteGrade} (score ${websiteScore}/100) — needs major work`);
    else if (pts >= 15) signals.push(`Website grade ${websiteGrade} — has room for improvement`);
    else signals.push(`Website grade ${websiteGrade} — decent site, harder sell`);
  }

  // ─── 2. Industry Value (20% weight) ────────────────────────────────
  const category = String(lead.category || '').toLowerCase();
  const businessName = String(lead.business_name || '').toLowerCase();
  const searchText = `${category} ${businessName}`;

  let industryScore = 5; // default
  let matchedIndustry = 'general';
  for (const [keyword, value] of Object.entries(INDUSTRY_VALUE)) {
    if (searchText.includes(keyword)) {
      if (value > industryScore) {
        industryScore = value;
        matchedIndustry = keyword;
      }
    }
  }
  rawScore += industryScore;
  signals.push(`Industry: ${matchedIndustry} (value score: ${industryScore}/20)`);

  // ─── 3. Review Count (15% weight) ──────────────────────────────────
  // Low reviews = less established online presence = better lead
  const reviewCount = lead.review_count ?? 0;
  if (reviewCount === 0) {
    rawScore += 15;
    signals.push('No reviews — not established online');
  } else if (reviewCount < 10) {
    rawScore += 12;
    signals.push(`Only ${reviewCount} reviews — weak online presence`);
  } else if (reviewCount < 25) {
    rawScore += 8;
    signals.push(`${reviewCount} reviews — moderate presence`);
  } else if (reviewCount < 50) {
    rawScore += 5;
    signals.push(`${reviewCount} reviews — decent presence`);
  } else {
    rawScore += 2;
    signals.push(`${reviewCount} reviews — strong presence, harder to sell`);
  }

  // ─── 4. Has Direct Email (10% weight) ──────────────────────────────
  const emails = lead.emails || [];
  const ownerEmail = lead.owner_email || '';
  if (ownerEmail) {
    rawScore += 10;
    signals.push(`Owner email found: ${ownerEmail}`);
  } else if (emails.length > 0) {
    rawScore += 7;
    signals.push(`${emails.length} email(s) found (no owner-specific)`);
  } else {
    rawScore += 0;
    signals.push('No email found — harder to reach');
  }

  // ─── 5. Has Owner/Contact Name (10% weight) ────────────────────────
  const ownerName = lead.owner_name || '';
  if (ownerName) {
    rawScore += 10;
    signals.push(`Named contact: ${ownerName}`);
  } else {
    rawScore += 0;
    signals.push('No named contact — generic outreach only');
  }

  // ─── 6. Outdated Signals (15% weight) ──────────────────────────────
  const outdated = lead.outdated_signals || lead.website_audit?.outdated_signals || [];
  const signalCount = Array.isArray(outdated) ? outdated.filter(s => s !== 'No obvious outdated signals found').length : 0;

  if (signalCount >= 4) {
    rawScore += 15;
    signals.push(`${signalCount} outdated signals — strong pitch material`);
  } else if (signalCount >= 2) {
    rawScore += 10;
    signals.push(`${signalCount} outdated signals`);
  } else if (signalCount === 1) {
    rawScore += 5;
    signals.push('1 outdated signal');
  } else {
    rawScore += 0;
    signals.push('No outdated signals — clean site');
  }

  // ─── Normalize to 0-100 ────────────────────────────────────────────
  const score = Math.min(100, Math.max(0, rawScore));
  const grade = scoreToGrade(score);
  const priority = scoreToPriority(score);

  // ─── Service Recommendations ───────────────────────────────────────
  const recommended = recommendServices(lead, score, outdated, hasWebsite);

  return {
    score,
    grade,
    priority,
    recommended_services: recommended,
    reasoning: signals.join(' | '),
  };
}

/**
 * Map problems to recommended services.
 */
function recommendServices(lead, score, outdatedSignals, hasWebsite) {
  const recs = [];

  // Always recommend website if no website or bad grade
  if (!hasWebsite || !lead.website) {
    recs.push({ ...findService('website_mockup'), reason: 'No website found — needs a professional site' });
  } else {
    const grade = lead.website_grade || lead.website_audit?.website_grade || 'F';
    if (['D', 'F'].includes(grade)) {
      recs.push({ ...findService('website_mockup'), reason: `Website graded ${grade} — needs a redesign` });
    }
  }

  // SEO if they exist but aren't ranking well
  const signals = Array.isArray(outdatedSignals) ? outdatedSignals : [];
  const seoIssues = signals.filter(s =>
    /meta|title|sitemap|robots|viewport/i.test(s)
  );
  if (seoIssues.length > 0 || !lead.has_sitemap) {
    recs.push({ ...findService('monthly_seo'), reason: `SEO issues: ${seoIssues.join(', ') || 'no sitemap/robots'}` });
  }

  // Review management if low reviews
  const reviewCount = lead.review_count ?? 0;
  if (reviewCount < 15) {
    recs.push({ ...findService('review_management'), reason: `Only ${reviewCount} reviews — needs reputation building` });
  }

  // Social media if no social presence
  const social = lead.social || {};
  const socialCount = Object.values(social).filter(v => v && v.length > 0).length;
  if (socialCount < 2) {
    recs.push({ ...findService('social_media'), reason: `Only ${socialCount} social profiles found` });
  }

  // Always suggest automation for high-score leads
  if (score >= 60) {
    recs.push({ ...findService('automation'), reason: 'High-value lead — automation saves them time' });
  }

  return recs;
}

function findService(id) {
  return SERVICE_CATALOG.find(s => s.id === id) || { id, name: id, price_min: 0, price_max: 0 };
}

function scoreToGrade(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

function scoreToPriority(score) {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  if (score >= 30) return 'cool';
  return 'cold';
}

/**
 * Batch-score an array of leads.
 */
export function scoreLeads(leads) {
  return leads.map(lead => ({
    lead_id: lead.lead_id,
    ...scoreLead(lead),
  }));
}
