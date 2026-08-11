/**
 * Niche-based Mockup Generator
 * ─────────────────────────────
 * Generates Awwwards-inspired HTML mockups for outreach emails.
 * Each niche gets its own color palette, content, and service recommendations.
 *
 * Supported niches:
 *   dentist, lawyer, plumber, hvac, roofing, restaurant,
 *   electrician, contractor, general (fallback)
 */

import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'mockups');

// ─── Niche Detection ──────────────────────────────────────────────────

/**
 * Detect niche from category/business name.
 * @param {string} category
 * @param {string} businessName
 * @returns {string} niche key
 */
export function detectNiche(category, businessName) {
  const text = `${category} ${businessName}`.toLowerCase();

  const nicheMap = [
    { keywords: ['dentist', 'dental', 'orthodont', 'cosmetic dentist', 'teeth', 'smile', 'oral'], niche: 'dentist' },
    { keywords: ['lawyer', 'attorney', 'law firm', 'legal', 'law office', 'litigation'], niche: 'lawyer' },
    { keywords: ['plumber', 'plumbing', 'drain', 'pipe', 'water heater'], niche: 'plumber' },
    { keywords: ['hvac', 'air conditioning', 'heating', 'cooling', 'furnace'], niche: 'hvac' },
    { keywords: ['roofing', 'roofer', 'roof', 'gutter'], niche: 'roofing' },
    { keywords: ['restaurant', 'cafe', 'bistro', 'eatery', 'food', 'diner', 'grill'], niche: 'restaurant' },
    { keywords: ['electrician', 'electrical', 'wiring'], niche: 'electrician' },
    { keywords: ['contractor', 'construction', 'builder', 'remodel'], niche: 'contractor' },
    { keywords: ['medical', 'doctor', 'physician', 'clinic', 'health'], niche: 'medical' },
    { keywords: ['veterinar', 'vet', 'animal', 'pet clinic'], niche: 'veterinary' },
    { keywords: ['real estate', 'realtor', 'realty', 'property'], niche: 'realestate' },
    { keywords: ['salon', 'barber', 'spa', 'beauty', 'hair'], niche: 'salon' },
  ];

  for (const { keywords, niche } of nicheMap) {
    if (keywords.some(kw => text.includes(kw))) {
      return niche;
    }
  }

  return 'general';
}

// ─── Conditional Trigger Logic ────────────────────────────────────────

/**
 * Determine whether a mockup should be auto-generated for this lead.
 * Returns true if the niche + website condition warrants a visual mockup.
 *
 * @param {object} lead
 * @returns {{ shouldGenerate: boolean, reason: string, niche: string }}
 */
export function shouldGenerateMockup(lead) {
  const niche = detectNiche(lead.category || '', lead.business_name || '');
  const grade = lead.website_grade || lead.website_audit?.website_grade || 'F';
  const hasWebsite = lead.has_website ?? lead.website_audit?.has_website ?? false;
  const score = lead.website_score ?? lead.website_audit?.website_score ?? 0;

  // High-value niches where visual mockups dramatically improve conversion
  const highValueNiches = ['dentist', 'lawyer', 'restaurant', 'medical', 'realestate', 'salon', 'veterinary'];
  const midValueNiches = ['plumber', 'hvac', 'roofing', 'electrician', 'contractor'];

  // Always generate for high-value niches with bad websites
  if (highValueNiches.includes(niche) && (!hasWebsite || ['D', 'F'].includes(grade))) {
    return {
      shouldGenerate: true,
      reason: `High-value niche "${niche}" with ${!hasWebsite ? 'no website' : `grade ${grade}`} — mockup will dramatically boost reply rate`,
      niche,
    };
  }

  // Generate for mid-value niches if website is truly bad
  if (midValueNiches.includes(niche) && (!hasWebsite || grade === 'F')) {
    return {
      shouldGenerate: true,
      reason: `Trade niche "${niche}" with ${!hasWebsite ? 'no website' : 'failing website'} — mockup shows immediate value`,
      niche,
    };
  }

  // Generate for any niche if score is below 30 (terrible website)
  if (score < 30 && score >= 0) {
    return {
      shouldGenerate: true,
      reason: `Very low website score (${score}/100) — visual mockup will convert regardless of niche`,
      niche,
    };
  }

  // No mockup needed — website is decent enough that audit alone suffices
  return {
    shouldGenerate: false,
    reason: `Website grade ${grade} (${score}/100) in "${niche}" niche — audit email is sufficient`,
    niche,
  };
}

// ─── Mockup Generation ───────────────────────────────────────────────

/**
 * Generate a mockup HTML file for a lead.
 * @param {object} lead
 * @returns {{ html: string, filePath: string, slug: string, niche: string }}
 */
export async function generateMockup(lead) {
  const niche = detectNiche(lead.category || '', lead.business_name || '');
  const businessName = lead.business_name || 'Your Business';
  const city = lead.city || '';
  const state = lead.state || '';
  const location = [city, state].filter(Boolean).join(', ');
  const score = lead.website_score ?? 0;
  const grade = lead.website_grade || 'F';
  const signals = (lead.outdated_signals || [])
    .filter(s => s && s !== 'No obvious outdated signals found')
    .slice(0, 4);

  const html = buildMockupHtml({
    niche,
    businessName,
    location,
    score,
    grade,
    signals,
    website: lead.website || '',
    category: lead.category || 'Local Business',
  });

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const slug = `${niche}-${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${Date.now()}`;
  const filePath = path.join(OUTPUT_DIR, `${slug}.html`);
  await fs.writeFile(filePath, html, 'utf8');

  console.log(`[mockup-gen] Generated ${niche} mockup for "${businessName}" → ${filePath}`);

  return { html, filePath, slug, niche };
}

// ─── Awwwards-Inspired Color Themes ──────────────────────────────────

function getNicheTheme(niche) {
  const themes = {
    dentist: {
      bg: '#0a0f1a', surface: '#111827', surface2: '#1a2332',
      primary: '#0ea5e9', primaryLight: '#38bdf8', accent: '#06b6d4',
      text: '#f0f9ff', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #0ea5e9, #06b6d4, #14b8a6)',
      gradientAccent: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
      glow: 'rgba(14,165,233,0.15)', glow2: 'rgba(6,182,212,0.1)',
    },
    lawyer: {
      bg: '#0c0f16', surface: '#141821', surface2: '#1c2230',
      primary: '#6366f1', primaryLight: '#818cf8', accent: '#f59e0b',
      text: '#f5f3ff', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
      gradientAccent: 'linear-gradient(135deg, #f59e0b, #f97316)',
      glow: 'rgba(99,102,241,0.12)', glow2: 'rgba(245,158,11,0.08)',
    },
    plumber: {
      bg: '#0c1017', surface: '#141b24', surface2: '#1c2530',
      primary: '#3b82f6', primaryLight: '#60a5fa', accent: '#f97316',
      text: '#f0f9ff', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
      gradientAccent: 'linear-gradient(135deg, #f97316, #ef4444)',
      glow: 'rgba(59,130,246,0.12)', glow2: 'rgba(249,115,22,0.08)',
    },
    hvac: {
      bg: '#0c1017', surface: '#141b24', surface2: '#1c2530',
      primary: '#10b981', primaryLight: '#34d399', accent: '#3b82f6',
      text: '#f0fdf4', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #10b981, #059669, #047857)',
      gradientAccent: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      glow: 'rgba(16,185,129,0.12)', glow2: 'rgba(59,130,246,0.08)',
    },
    roofing: {
      bg: '#0c0f16', surface: '#141821', surface2: '#1c2230',
      primary: '#f59e0b', primaryLight: '#fbbf24', accent: '#ef4444',
      text: '#fffbeb', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706, #b45309)',
      gradientAccent: 'linear-gradient(135deg, #ef4444, #dc2626)',
      glow: 'rgba(245,158,11,0.12)', glow2: 'rgba(239,68,68,0.08)',
    },
    restaurant: {
      bg: '#0f0c0c', surface: '#1a1414', surface2: '#241c1c',
      primary: '#ef4444', primaryLight: '#f87171', accent: '#f59e0b',
      text: '#fff1f2', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #ef4444, #dc2626, #b91c1c)',
      gradientAccent: 'linear-gradient(135deg, #f59e0b, #d97706)',
      glow: 'rgba(239,68,68,0.12)', glow2: 'rgba(245,158,11,0.08)',
    },
    electrician: {
      bg: '#0c1017', surface: '#141b24', surface2: '#1c2530',
      primary: '#fbbf24', primaryLight: '#fcd34d', accent: '#f59e0b',
      text: '#fffbeb', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)',
      gradientAccent: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      glow: 'rgba(251,191,36,0.12)', glow2: 'rgba(245,158,11,0.08)',
    },
    contractor: {
      bg: '#0c0f16', surface: '#141821', surface2: '#1c2230',
      primary: '#6366f1', primaryLight: '#818cf8', accent: '#06b6d4',
      text: '#f5f3ff', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #6366f1, #3b82f6, #06b6d4)',
      gradientAccent: 'linear-gradient(135deg, #06b6d4, #10b981)',
      glow: 'rgba(99,102,241,0.12)', glow2: 'rgba(6,182,212,0.08)',
    },
    medical: {
      bg: '#0a0f1a', surface: '#111827', surface2: '#1a2332',
      primary: '#06b6d4', primaryLight: '#22d3ee', accent: '#10b981',
      text: '#ecfeff', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2, #0e7490)',
      gradientAccent: 'linear-gradient(135deg, #10b981, #059669)',
      glow: 'rgba(6,182,212,0.15)', glow2: 'rgba(16,185,129,0.1)',
    },
    veterinary: {
      bg: '#0c1017', surface: '#141b24', surface2: '#1c2530',
      primary: '#10b981', primaryLight: '#34d399', accent: '#f59e0b',
      text: '#f0fdf4', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #10b981, #14b8a6, #06b6d4)',
      gradientAccent: 'linear-gradient(135deg, #f59e0b, #f97316)',
      glow: 'rgba(16,185,129,0.15)', glow2: 'rgba(20,184,166,0.1)',
    },
    realestate: {
      bg: '#0c0f16', surface: '#141821', surface2: '#1c2230',
      primary: '#8b5cf6', primaryLight: '#a78bfa', accent: '#f59e0b',
      text: '#f5f3ff', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed, #6d28d9)',
      gradientAccent: 'linear-gradient(135deg, #f59e0b, #d97706)',
      glow: 'rgba(139,92,246,0.15)', glow2: 'rgba(124,58,237,0.1)',
    },
    salon: {
      bg: '#110c14', surface: '#1a1420', surface2: '#241c2c',
      primary: '#ec4899', primaryLight: '#f472b6', accent: '#a855f7',
      text: '#fdf2f8', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #ec4899, #db2777, #be185d)',
      gradientAccent: 'linear-gradient(135deg, #a855f7, #8b5cf6)',
      glow: 'rgba(236,72,153,0.12)', glow2: 'rgba(168,85,247,0.08)',
    },
    general: {
      bg: '#0f172a', surface: '#1e293b', surface2: '#334155',
      primary: '#4f46e5', primaryLight: '#818cf8', accent: '#f59e0b',
      text: '#f1f5f9', textMuted: '#94a3b8', textDim: '#64748b',
      gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed, #a855f7)',
      gradientAccent: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      glow: 'rgba(79,70,229,0.15)', glow2: 'rgba(168,85,247,0.1)',
    },
  };

  return themes[niche] || themes.general;
}

// ─── Niche-Specific Content ──────────────────────────────────────────

function getNicheContent(niche, businessName, location, category) {
  const contentMap = {
    dentist: {
      heroSubtitle: 'A modern, patient-focused website that books more appointments and builds trust before they even walk in.',
      mockupTitle: 'Your Practice,<br>Reimagined Online.',
      mockupCta: 'Book Consultation',
      stat1Value: '24/7', stat1Label: 'Booking',
      stat2Value: '100%', stat2Label: 'Mobile',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    lawyer: {
      heroSubtitle: 'A prestigious digital presence that conveys authority, builds trust, and converts visitors into consultations.',
      mockupTitle: 'Authority.<br>Trust. Results.',
      mockupCta: 'Schedule Consultation',
      stat1Value: '100%', stat1Label: 'Professional',
      stat2Value: 'SSL', stat2Label: 'Secure',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    plumber: {
      heroSubtitle: 'A fast, emergency-ready website that ranks in local search and gets customers calling you first.',
      mockupTitle: 'Fast. Reliable.<br>Always Available.',
      mockupCta: 'Get Free Quote',
      stat1Value: '24/7', stat1Label: 'Emergency',
      stat2Value: 'Local', stat2Label: 'SEO',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    hvac: {
      heroSubtitle: 'A professional website that highlights your services, builds trust, and drives more service calls year-round.',
      mockupTitle: 'Comfort Starts<br>With Your Website.',
      mockupCta: 'Request Service',
      stat1Value: '4.9★', stat1Label: 'Reviews',
      stat2Value: '24/7', stat2Label: 'Support',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    roofing: {
      heroSubtitle: 'A bold, professional website that showcases your work and gets homeowners calling you for estimates.',
      mockupTitle: 'Protect Their Homes.<br>Grow Your Business.',
      mockupCta: 'Get Free Estimate',
      stat1Value: '100%', stat1Label: 'Warranty',
      stat2Value: 'Local', stat2Label: 'Trusted',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    restaurant: {
      heroSubtitle: 'A mouth-watering digital experience that drives reservations, showcases your menu, and builds a loyal following.',
      mockupTitle: 'Great Food Deserves<br>A Great Website.',
      mockupCta: 'Reserve a Table',
      stat1Value: 'Online', stat1Label: 'Reservations',
      stat2Value: 'Menu', stat2Label: 'Gallery',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    electrician: {
      heroSubtitle: 'A professional website that builds trust and gets customers calling you for electrical work.',
      mockupTitle: 'Safe. Certified.<br>Professional.',
      mockupCta: 'Get a Quote',
      stat1Value: 'Licensed', stat1Label: 'Certified',
      stat2Value: '24/7', stat2Label: 'Emergency',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    contractor: {
      heroSubtitle: 'A powerful portfolio website that showcases your projects and brings in high-value construction leads.',
      mockupTitle: 'Build Your Legacy.<br>Online.',
      mockupCta: 'Start Your Project',
      stat1Value: 'Portfolio', stat1Label: 'Showcase',
      stat2Value: 'Licensed', stat2Label: 'Insured',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    medical: {
      heroSubtitle: 'A HIPAA-aware, patient-friendly website that streamlines appointments and builds clinical trust online.',
      mockupTitle: 'Modern Care.<br>Modern Website.',
      mockupCta: 'Book Appointment',
      stat1Value: 'HIPAA', stat1Label: 'Compliant',
      stat2Value: 'Online', stat2Label: 'Booking',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    veterinary: {
      heroSubtitle: 'A warm, trustworthy website that helps pet owners find you and book visits for their furry family members.',
      mockupTitle: 'Care They Trust.<br>Online.',
      mockupCta: 'Book a Visit',
      stat1Value: '24/7', stat1Label: 'Emergency',
      stat2Value: 'Online', stat2Label: 'Booking',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    realestate: {
      heroSubtitle: 'A stunning, listing-focused website with IDX integration that turns visitors into buyers and sellers.',
      mockupTitle: 'Sell More Homes.<br>Online.',
      mockupCta: 'View Listings',
      stat1Value: 'IDX', stat1Label: 'Integration',
      stat2Value: 'Lead', stat2Label: 'Capture',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    salon: {
      heroSubtitle: 'A beautiful, on-brand website with online booking that keeps your chairs full and your clients coming back.',
      mockupTitle: 'Beauty Deserves<br>A Beautiful Website.',
      mockupCta: 'Book Now',
      stat1Value: 'Online', stat1Label: 'Booking',
      stat2Value: 'Gallery', stat2Label: 'Portfolio',
      stat3Value: 'A+', stat3Label: 'Design',
    },
    general: {
      heroSubtitle: 'A modern, conversion-focused website that helps customers find you, trust you, and choose you over competitors.',
      mockupTitle: 'Your Business.<br>Amplified Online.',
      mockupCta: 'Get Started',
      stat1Value: 'Modern', stat1Label: 'Design',
      stat2Value: 'Local', stat2Label: 'SEO',
      stat3Value: 'A+', stat3Label: 'Quality',
    },
  };

  return contentMap[niche] || contentMap.general;
}

// ─── Niche Services ──────────────────────────────────────────────────

function getNicheServices(niche) {
  const catalog = {
    dentist: [
      { icon: '🦷', name: 'Dental Website Package', price: '$2,500 — $4,500', desc: 'Custom website with online booking, before/after gallery, and patient forms.' },
      { icon: '⭐', name: 'Review Management', price: '$300/mo', desc: 'Automated review requests and Google Business Profile optimization.' },
      { icon: '📊', name: 'Patient Analytics', price: '$200/mo', desc: 'Track calls, form submissions, and new patient sources.' },
    ],
    lawyer: [
      { icon: '⚖️', name: 'Law Firm Website', price: '$3,000 — $5,500', desc: 'Prestigious design with case studies, attorney profiles, and consultation booking.' },
      { icon: '🔒', name: 'Trust & Security Suite', price: '$500', desc: 'SSL, privacy policy, and secure contact forms for client confidentiality.' },
      { icon: '📈', name: 'Case Lead Tracking', price: '$400/mo', desc: 'Track which practice areas generate the most inquiries.' },
    ],
    restaurant: [
      { icon: '🍽️', name: 'Restaurant Website', price: '$2,000 — $4,000', desc: 'Stunning design with online menu, reservation system, and photo gallery.' },
      { icon: '📸', name: 'Food Photography', price: '$500', desc: 'Professional menu and ambiance photography for your new site.' },
      { icon: '⭐', name: 'Review Monitoring', price: '$250/mo', desc: 'Monitor and respond to Google/Yelp reviews automatically.' },
    ],
    plumber: [
      { icon: '🔧', name: 'Service Website', price: '$1,800 — $3,000', desc: 'Emergency-focused design with click-to-call, service areas, and online booking.' },
      { icon: '📍', name: 'Local SEO Package', price: '$600/mo', desc: 'Dominate "plumber near me" searches in your service area.' },
      { icon: '⭐', name: 'Review Builder', price: '$200/mo', desc: 'Automated review requests after every completed job.' },
    ],
    hvac: [
      { icon: '❄️', name: 'HVAC Website', price: '$2,000 — $3,500', desc: 'Season-aware design with service scheduling, maintenance plans, and emergency CTA.' },
      { icon: '📍', name: 'Local SEO', price: '$500/mo', desc: 'Rank for heating and cooling searches across your service area.' },
      { icon: '🔔', name: 'Lead Alerts', price: '$150/mo', desc: 'Instant notification when a potential customer fills out a form or calls.' },
    ],
    roofing: [
      { icon: '🏠', name: 'Roofing Website', price: '$2,000 — $3,500', desc: 'Project gallery, free estimate forms, and financing calculator.' },
      { icon: '📸', name: 'Project Photography', price: '$400', desc: 'Before/after shoots of your best roofing projects.' },
      { icon: '📍', name: 'Storm Chaser SEO', price: '$500/mo', desc: 'Rank for storm damage and emergency roof repair in your area.' },
    ],
    electrician: [
      { icon: '⚡', name: 'Electrician Website', price: '$1,800 — $3,000', desc: 'License-first design with service menus, emergency CTA, and safety trust badges.' },
      { icon: '📍', name: 'Local SEO', price: '$500/mo', desc: 'Rank for "electrician near me" and emergency electrical searches.' },
      { icon: '⭐', name: 'Review Builder', price: '$200/mo', desc: 'Post-job automated review requests to build your 5-star reputation.' },
    ],
    contractor: [
      { icon: '🏗️', name: 'Contractor Website', price: '$2,500 — $4,500', desc: 'Portfolio-driven design with project galleries, timelines, and bid request forms.' },
      { icon: '📈', name: 'Lead Generation', price: '$600/mo', desc: 'Google Ads + landing pages optimized for high-value construction leads.' },
      { icon: '📊', name: 'Project CRM', price: '$300/mo', desc: 'Track leads from first contact to signed contract.' },
    ],
    medical: [
      { icon: '🏥', name: 'Medical Practice Website', price: '$3,000 — $5,000', desc: 'HIPAA-aware design with patient portal, appointment booking, and provider profiles.' },
      { icon: '🔒', name: 'Compliance Suite', price: '$600', desc: 'HIPAA-compliant forms, privacy policy, and security headers.' },
      { icon: '📊', name: 'Patient Analytics', price: '$300/mo', desc: 'Track new patient acquisition sources and appointment conversion.' },
    ],
    veterinary: [
      { icon: '🐾', name: 'Vet Clinic Website', price: '$2,000 — $3,500', desc: 'Warm, pet-friendly design with online booking, pet portal, and emergency info.' },
      { icon: '⭐', name: 'Review Management', price: '$250/mo', desc: 'Automated review requests from happy pet parents.' },
      { icon: '📍', name: 'Local SEO', price: '$400/mo', desc: 'Rank for "vet near me" and emergency animal hospital searches.' },
    ],
    realestate: [
      { icon: '🏡', name: 'Real Estate Website', price: '$3,500 — $6,000', desc: 'IDX-integrated site with listing search, lead capture, and neighborhood guides.' },
      { icon: '📈', name: 'Lead Generation Ads', price: '$800/mo', desc: 'Facebook and Google ads targeting buyers and sellers in your market.' },
      { icon: '📊', name: 'CRM Integration', price: '$400/mo', desc: 'Automated follow-up sequences for every incoming lead.' },
    ],
    salon: [
      { icon: '💇', name: 'Salon Website', price: '$1,800 — $3,000', desc: 'Beautiful, on-brand design with online booking, portfolio gallery, and team bios.' },
      { icon: '📱', name: 'Social Media Package', price: '$400/mo', desc: 'Instagram content creation and scheduling to showcase your work.' },
      { icon: '⭐', name: 'Review Builder', price: '$200/mo', desc: 'Post-appointment review requests to build your 5-star reputation.' },
    ],
    general: [
      { icon: '🎨', name: 'Website Redesign', price: '$1,500 — $3,500', desc: 'A fully custom, modern website designed to convert visitors into customers.' },
      { icon: '📱', name: 'Mobile Optimization', price: '$500 — $800', desc: 'Ensure your site looks and performs perfectly on every device.' },
      { icon: '🔍', name: 'Local SEO Setup', price: '$800 — $1,500', desc: 'Optimize for Google Business Profile, local citations, and search rankings.' },
    ],
  };

  return catalog[niche] || catalog.general;
}

// ─── Issue Descriptions ──────────────────────────────────────────────

function getIssueDescription(signal) {
  const descriptions = {
    'No HTTPS': 'Modern browsers flag your site as "Not Secure," driving away 30%+ of visitors before they even see your content.',
    'Missing or tiny title': 'Search engines can\'t understand what your page is about, making you invisible in local search results.',
    'Missing meta description': 'You\'re missing the most important real estate in search results — the snippet that convinces people to click.',
    'No viewport meta': '61% of local searches come from mobile. Without a viewport, your site is unusable on phones.',
    'Very old copyright': 'A decade-old copyright signals neglect. Visitors wonder if your business is still operating.',
    'Stale copyright year': 'Small detail, but it undermines trust immediately — visitors notice these signals subconsciously.',
    'Very old HTML patterns': 'Your site uses HTML from 10+ years ago. Modern browsers struggle, and Google penalizes outdated code.',
    'Deprecated presentational HTML': 'Using deprecated tags means your site renders inconsistently across devices and browsers.',
    'Possible table-based layout': 'Table layouts are broken on mobile. You\'re losing the majority of your potential customers.',
    'Placeholder/unfinished content': 'Visitors see "Coming Soon" and immediately call your competitor who has a real website.',
  };

  for (const [pattern, desc] of Object.entries(descriptions)) {
    if (signal.toLowerCase().includes(pattern.toLowerCase())) {
      return desc;
    }
  }

  if (/inline styles/i.test(signal)) return 'Heavy inline CSS means slow loads, poor maintenance, and signals amateur development to savvy visitors.';
  return 'This issue is directly affecting your site\'s performance, user experience, and search rankings.';
}

// ─── Helpers ─────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// ─── Full HTML Builder ───────────────────────────────────────────────

function buildMockupHtml({ niche, businessName, location, score, grade, signals, website, category }) {
  const t = getNicheTheme(niche);
  const c = getNicheContent(niche, businessName, location, category);
  const services = getNicheServices(niche);
  const biz = escHtml(businessName);
  const loc = escHtml(location);
  const cat = escHtml(category);
  const calLink = process.env.CAL_LINK || 'https://cal.com/artum8labs';
  const companyName = process.env.COMPANY_NAME || 'Artum 8 Labs';

  const issuesHtml = signals.length > 0 ? `
  <section class="issues-section" id="issues">
    <div class="container">
      <div class="section-label">CURRENT ISSUES</div>
      <div class="section-title">What's hurting your online presence</div>
      <div class="section-desc">We analyzed your website and found these specific issues that are costing you customers.</div>
      <div class="issues-grid">
        ${signals.map((signal, i) => `
        <div class="issue-card" style="animation-delay:${i * 0.12}s">
          <div class="issue-severity">${['🔴', '🟡', '🔵', '⚪'][i] || '⚪'}</div>
          <div class="issue-body">
            <div class="issue-title">${escHtml(signal)}</div>
            <div class="issue-desc">${getIssueDescription(signal)}</div>
          </div>
        </div>`).join('\n')}
      </div>
    </div>
  </section>` : '';

  const servicesHtml = services.map((svc, i) => `
    <div class="service-card${i === 0 ? ' featured' : ''}" style="animation-delay:${i * 0.1}s">
      ${i === 0 ? '<div class="service-badge">RECOMMENDED</div>' : ''}
      <div class="service-icon">${svc.icon}</div>
      <div class="service-name">${escHtml(svc.name)}</div>
      <div class="service-price">${svc.price}</div>
      <div class="service-desc">${escHtml(svc.desc)}</div>
    </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${biz} — Website Redesign Concept</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:${t.bg};--surface:${t.surface};--surface2:${t.surface2};
  --primary:${t.primary};--primary-light:${t.primaryLight};--accent:${t.accent};
  --text:${t.text};--text-muted:${t.textMuted};--text-dim:${t.textDim};
  --gradient:${t.gradient};--gradient-accent:${t.gradientAccent};
  --glow:${t.glow};--glow2:${t.glow2};
  --radius:20px;--radius-sm:12px;
}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;overflow-x:hidden}
a{color:var(--primary-light);text-decoration:none;transition:opacity .2s}
a:hover{opacity:.85}
.container{max-width:1000px;margin:0 auto;padding:0 28px}

/* ─── Nav ─── */
nav{position:sticky;top:0;z-index:100;backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5);background:rgba(${hexToRgb(t.bg)},0.8);border-bottom:1px solid rgba(255,255,255,0.04)}
nav .container{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-size:1.1rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-.02em}
.nav-links{display:flex;gap:28px;font-size:.8rem;font-weight:500;color:var(--text-dim)}
.nav-links a{color:var(--text-dim);transition:color .2s}
.nav-links a:hover{color:var(--text);opacity:1}

/* ─── Hero ─── */
.hero{position:relative;overflow:hidden;padding:100px 0 80px}
.hero::before{content:'';position:absolute;top:-60%;left:-40%;width:180%;height:180%;background:radial-gradient(ellipse at 30% 20%,var(--glow) 0%,transparent 50%),radial-gradient(ellipse at 70% 80%,var(--glow2) 0%,transparent 50%);animation:heroFloat 25s ease-in-out infinite;pointer-events:none}
@keyframes heroFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-3%,2%) scale(1.02)}}
.hero .container{position:relative;z-index:1;text-align:center}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(${hexToRgb(t.primary)},0.1);border:1px solid rgba(${hexToRgb(t.primary)},0.2);border-radius:100px;padding:6px 20px;font-size:.72rem;font-weight:600;color:var(--primary-light);margin-bottom:24px;letter-spacing:.04em}
.hero-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
.hero h1{font-size:clamp(2rem,5vw,3.8rem);font-weight:900;line-height:1.08;margin-bottom:20px;letter-spacing:-.03em}
.hero h1 .highlight{background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-sub{max-width:620px;margin:0 auto 36px;font-size:1.05rem;color:var(--text-muted);line-height:1.7}
.hero-cta{display:inline-flex;align-items:center;gap:10px;padding:16px 36px;border-radius:100px;font-size:.9rem;font-weight:600;color:#fff;background:var(--gradient);box-shadow:0 4px 24px rgba(${hexToRgb(t.primary)},0.3);transition:all .25s;cursor:pointer;border:none;text-decoration:none}
.hero-cta:hover{transform:translateY(-2px);box-shadow:0 8px 36px rgba(${hexToRgb(t.primary)},0.4);opacity:1}
.hero-cta svg{width:18px;height:18px}

/* ─── Mockup Preview ─── */
.mockup-section{padding:60px 0 40px}
.mockup-frame{position:relative;max-width:800px;margin:0 auto;border-radius:var(--radius);overflow:hidden;background:var(--surface);border:1px solid rgba(255,255,255,0.06);box-shadow:0 20px 60px rgba(0,0,0,0.4),0 0 80px var(--glow)}
.mockup-toolbar{display:flex;align-items:center;gap:8px;padding:14px 20px;background:var(--surface2);border-bottom:1px solid rgba(255,255,255,0.04)}
.mockup-dot{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,0.08)}
.mockup-dot.r{background:#ff5f57}.mockup-dot.y{background:#ffbd2e}.mockup-dot.g{background:#28c840}
.mockup-url{flex:1;margin-left:12px;padding:5px 14px;border-radius:8px;background:rgba(255,255,255,0.04);font-size:.7rem;color:var(--text-dim);font-family:'Inter',monospace}
.mockup-body{padding:48px 40px;text-align:center;position:relative;min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.mockup-body::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,var(--glow) 0%,transparent 70%);pointer-events:none}
.mockup-logo{font-size:.85rem;font-weight:700;color:var(--primary-light);letter-spacing:.06em;margin-bottom:20px;text-transform:uppercase}
.mockup-h{font-size:clamp(1.6rem,4vw,2.8rem);font-weight:900;line-height:1.12;margin-bottom:16px;letter-spacing:-.02em;position:relative;z-index:1}
.mockup-loc{font-size:.8rem;color:var(--text-dim);margin-bottom:28px;letter-spacing:.04em}
.mockup-btn{display:inline-flex;padding:12px 32px;border-radius:100px;font-size:.82rem;font-weight:600;color:#fff;background:var(--gradient);box-shadow:0 4px 20px rgba(${hexToRgb(t.primary)},0.25);position:relative;z-index:1}
.mockup-stats{display:flex;justify-content:center;gap:48px;margin-top:32px;padding-top:28px;border-top:1px solid rgba(255,255,255,0.06);position:relative;z-index:1}
.mockup-stat-val{font-size:1.3rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.mockup-stat-label{font-size:.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.1em;margin-top:2px}

/* ─── Sections ─── */
section{padding:64px 0}
.section-label{text-align:center;font-size:.65rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--primary-light);margin-bottom:12px}
.section-title{text-align:center;font-size:clamp(1.4rem,3.5vw,2.2rem);font-weight:800;margin-bottom:12px;letter-spacing:-.02em}
.section-desc{text-align:center;max-width:560px;margin:0 auto 40px;color:var(--text-muted);font-size:.9rem;line-height:1.7}

/* ─── Issues ─── */
.issues-section{background:rgba(${hexToRgb(t.surface)},0.4)}
.issues-grid{display:flex;flex-direction:column;gap:14px}
.issue-card{display:flex;gap:16px;align-items:flex-start;background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius-sm);padding:20px 24px;transition:all .3s;animation:fadeUp .5s ease backwards}
.issue-card:hover{border-color:rgba(255,255,255,0.1);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.2)}
.issue-severity{font-size:1.3rem;flex-shrink:0;margin-top:2px}
.issue-title{font-size:.88rem;font-weight:600;margin-bottom:4px}
.issue-desc{font-size:.78rem;color:var(--text-dim);line-height:1.6}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

/* ─── Services ─── */
.services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.service-card{position:relative;background:var(--surface);border:1px solid rgba(255,255,255,0.05);border-radius:var(--radius);padding:32px 28px;transition:all .3s;animation:fadeUp .5s ease backwards}
.service-card:hover{border-color:rgba(${hexToRgb(t.primary)},0.3);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.25)}
.service-card.featured{border-color:rgba(${hexToRgb(t.accent)},0.3);background:linear-gradient(180deg,rgba(${hexToRgb(t.accent)},0.04) 0%,var(--surface) 50%)}
.service-badge{font-size:.58rem;font-weight:700;letter-spacing:.14em;color:var(--accent);margin-bottom:14px}
.service-icon{font-size:1.8rem;margin-bottom:14px}
.service-name{font-size:1rem;font-weight:700;margin-bottom:6px}
.service-price{font-size:1.05rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px}
.service-desc{font-size:.78rem;color:var(--text-dim);line-height:1.6}

/* ─── CTA ─── */
.cta-section{text-align:center;padding:80px 0;position:relative;overflow:hidden}
.cta-section::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,var(--glow) 0%,transparent 60%);pointer-events:none}
.cta-section h2{font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800;margin-bottom:12px;position:relative;z-index:1}
.cta-section p{color:var(--text-muted);margin-bottom:32px;max-width:480px;margin-left:auto;margin-right:auto;font-size:.9rem;position:relative;z-index:1}
.cta-btn{display:inline-flex;align-items:center;gap:10px;padding:18px 40px;border-radius:100px;font-size:.95rem;font-weight:700;color:#fff;background:var(--gradient);box-shadow:0 6px 30px rgba(${hexToRgb(t.primary)},0.35);transition:all .25s;cursor:pointer;border:none;text-decoration:none;position:relative;z-index:1}
.cta-btn:hover{transform:translateY(-3px);box-shadow:0 10px 40px rgba(${hexToRgb(t.primary)},0.45);opacity:1}
.cta-note{font-size:.75rem;color:var(--text-dim);margin-top:16px;position:relative;z-index:1}

/* ─── Footer ─── */
footer{padding:40px 0;border-top:1px solid rgba(255,255,255,0.04);text-align:center;font-size:.72rem;color:var(--text-dim)}
footer p{margin:4px 0}
footer strong{color:var(--text-muted)}

/* ─── Responsive ─── */
@media(max-width:768px){
  .nav-links{display:none}
  .mockup-body{padding:32px 24px}
  .mockup-stats{gap:24px}
  .services-grid{grid-template-columns:1fr}
  .hero{padding:60px 0 50px}
}
@media(max-width:480px){
  .mockup-stats{flex-direction:column;gap:16px}
}
</style>
</head>
<body>

<nav>
<div class="container">
  <div class="logo">${escHtml(companyName)}</div>
  <div class="nav-links">
    ${signals.length > 0 ? '<a href="#issues">Issues</a>' : ''}
    <a href="#services">Services</a>
    <a href="#cta">Get Started</a>
  </div>
</div>
</nav>

<section class="hero">
<div class="container">
  <div class="hero-badge">Website Redesign Concept for ${biz}</div>
  <h1><span class="highlight">${biz}</span><br>deserves a stronger online presence.</h1>
  <p class="hero-sub">${c.heroSubtitle}</p>
  <a href="#cta" class="hero-cta">
    View Your Custom Plan
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
  </a>
</div>
</section>

<section class="mockup-section">
<div class="container">
  <div class="mockup-frame">
    <div class="mockup-toolbar">
      <span class="mockup-dot r"></span>
      <span class="mockup-dot y"></span>
      <span class="mockup-dot g"></span>
      <span class="mockup-url">${website ? escHtml(website.replace(/^https?:\/\//, '')) : `www.${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`}</span>
    </div>
    <div class="mockup-body">
      <div class="mockup-logo">${biz}</div>
      <div class="mockup-h">${c.mockupTitle}</div>
      <div class="mockup-loc">${loc} — ${cat}</div>
      <div class="mockup-btn">${c.mockupCta}</div>
      <div class="mockup-stats">
        <div><div class="mockup-stat-val">${c.stat1Value}</div><div class="mockup-stat-label">${c.stat1Label}</div></div>
        <div><div class="mockup-stat-val">${c.stat2Value}</div><div class="mockup-stat-label">${c.stat2Label}</div></div>
        <div><div class="mockup-stat-val">${c.stat3Value}</div><div class="mockup-stat-label">${c.stat3Label}</div></div>
      </div>
    </div>
  </div>
</div>
</section>

${issuesHtml}

<section id="services">
<div class="container">
  <div class="section-label">OUR RECOMMENDATION</div>
  <div class="section-title">Services tailored for ${biz}</div>
  <div class="section-desc">Based on our analysis, here's exactly what we recommend to transform your online presence.</div>
  <div class="services-grid">
    ${servicesHtml}
  </div>
</div>
</section>

<section class="cta-section" id="cta">
<div class="container">
  <h2>Ready to grow?</h2>
  <p>Every price is negotiable — let's find the right package that fits your budget and goals.</p>
  <a href="${escHtml(calLink)}" class="cta-btn" target="_blank">
    Schedule a Free Consultation
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
  </a>
  <div class="cta-note">No obligation. We'll discuss your goals and send a custom proposal.</div>
</div>
</section>

<footer>
<div class="container">
  <p><strong>${escHtml(companyName)}</strong> — Helping local businesses grow online.</p>
  <p>This is a design concept prepared for ${biz}. &copy; ${new Date().getFullYear()} ${escHtml(companyName)}.</p>
</div>
</footer>

</body>
</html>`;
}
