import cron from 'node-cron';
import { runPipeline } from './pipeline.js';
import { checkImapReplies } from './reply-detector.js';
import { getLeadsByStatus, getLeadsForFollowUp, getDb } from './db.js';
import { sendEmail, loadTemplate } from './email-sender.js';
import { advanceLead } from './crm.js';
import { renderTemplate } from './template-renderer.js';
import { shouldGenerateMockup, generateMockup, detectNiche } from './mockup-generator.js';
import fs from 'fs/promises';
import path from 'path';

console.log('🚀 Starting Artum 8 Labs Automation Cron Server...');
console.log('⏰ Scheduled tasks loaded. Waiting for triggers...');

// ─── Niche Color Map (for email template interpolation) ─────
const NICHE_COLORS = {
  dentist:     { primary: '#0ea5e9', alt: '#06b6d4' },
  lawyer:      { primary: '#6366f1', alt: '#8b5cf6' },
  plumber:     { primary: '#3b82f6', alt: '#2563eb' },
  hvac:        { primary: '#10b981', alt: '#059669' },
  roofing:     { primary: '#f59e0b', alt: '#d97706' },
  restaurant:  { primary: '#ef4444', alt: '#dc2626' },
  electrician: { primary: '#fbbf24', alt: '#f59e0b' },
  contractor:  { primary: '#6366f1', alt: '#06b6d4' },
  medical:     { primary: '#06b6d4', alt: '#0891b2' },
  veterinary:  { primary: '#10b981', alt: '#14b8a6' },
  realestate:  { primary: '#8b5cf6', alt: '#7c3aed' },
  salon:       { primary: '#ec4899', alt: '#db2777' },
  general:     { primary: '#4f46e5', alt: '#7c3aed' },
};

const NICHE_MOCKUP_TITLES = {
  dentist: 'Your Practice,<br>Reimagined Online.',
  lawyer: 'Authority.<br>Trust. Results.',
  plumber: 'Fast. Reliable.<br>Always Available.',
  hvac: 'Comfort Starts<br>With Your Website.',
  roofing: 'Protect Homes.<br>Grow Business.',
  restaurant: 'Great Food Deserves<br>A Great Website.',
  electrician: 'Safe. Certified.<br>Professional.',
  contractor: 'Build Your Legacy.<br>Online.',
  medical: 'Modern Care.<br>Modern Website.',
  veterinary: 'Care They Trust.<br>Online.',
  realestate: 'Sell More Homes.<br>Online.',
  salon: 'Beauty Deserves<br>A Beautiful Website.',
  general: 'Your Business.<br>Amplified Online.',
};

const NICHE_CTAS = {
  dentist: 'Book Consultation', lawyer: 'Schedule Consultation', plumber: 'Get Free Quote',
  hvac: 'Request Service', roofing: 'Get Free Estimate', restaurant: 'Reserve a Table',
  electrician: 'Get a Quote', contractor: 'Start Your Project', medical: 'Book Appointment',
  veterinary: 'Book a Visit', realestate: 'View Listings', salon: 'Book Now', general: 'Get Started',
};

// ─────────────────────────────────────────────────────────────
// 06:00 AM - RUN THE SCRAPER PIPELINE
// ─────────────────────────────────────────────────────────────
cron.schedule('0 6 * * *', async () => {
  console.log('[CRON] 06:00 - Starting daily scrape pipeline...');
  try {
    // Example: Scrape Dentists in Austin, TX
    await runPipeline({
      query: 'dentist',
      city: 'Austin',
      states: [{ code: 'TX', name: 'Texas' }],
      limit: 50,
      stage: 'full'
    });
    console.log('[CRON] 06:00 - Scrape pipeline completed successfully.');
  } catch (err) {
    console.error('[CRON] 06:00 - Scrape pipeline failed:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 08:00 AM - SEND OUTREACH (First Touch)
// Conditional trigger: if the niche qualifies AND the website
// is bad enough, generate an Awwwards-inspired mockup and
// send the mockup email. Otherwise, send the standard audit.
// ─────────────────────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] 08:00 - Starting daily email outreach...');
  try {
    const leads = getLeadsByStatus('new', 50);
    
    if (leads.length === 0) {
      console.log('[CRON] No new leads to email today.');
      return;
    }

    // Pre-load both templates
    const auditTemplate = await loadTemplate('audit-first-touch.html');
    let mockupTemplate;
    try {
      mockupTemplate = await loadTemplate('mockup-first-touch.html');
    } catch {
      console.warn('[CRON] mockup-first-touch.html template not found — falling back to audit-only.');
      mockupTemplate = null;
    }

    let sentCount = 0;
    let mockupCount = 0;
    let auditCount = 0;

    for (const lead of leads) {
      const email = lead.owner_email || lead.emails?.[0];
      if (!email) continue;

      const score = lead.website_score || 0;
      let grade = 'F';
      let gradeColor = '#ef4444';
      if (score >= 90) { grade = 'A'; gradeColor = '#22c55e'; }
      else if (score >= 80) { grade = 'B'; gradeColor = '#84cc16'; }
      else if (score >= 65) { grade = 'C'; gradeColor = '#f59e0b'; }
      else if (score >= 50) { grade = 'D'; gradeColor = '#f97316'; }

      const signals = (lead.outdated_signals || ['Missing mobile optimization', 'Slow load times', 'Outdated design'])
        .filter(s => s && s !== 'No obvious outdated signals found')
        .slice(0, 3);

      // ─── CONDITIONAL NICHE TRIGGER ───────────────────────
      // Check if this lead qualifies for a mockup based on
      // niche + website condition
      const mockupDecision = shouldGenerateMockup(lead);
      let html;
      let templateUsed;
      let emailSubject;

      if (mockupDecision.shouldGenerate && mockupTemplate) {
        // ─── MOCKUP PATH ───────────────────────────────────
        // Generate the full Awwwards-inspired mockup page
        console.log(`[CRON] 🎨 Generating mockup for "${lead.business_name}" — ${mockupDecision.reason}`);
        
        try {
          const mockup = await generateMockup(lead);
          const niche = mockup.niche;
          const colors = NICHE_COLORS[niche] || NICHE_COLORS.general;
          const mockupUrl = `${process.env.APP_URL || 'https://audit.artum8labs.com'}/mockup/${mockup.slug}.html`;
          const bizSlug = (lead.business_name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '');

          html = renderTemplate(mockupTemplate, {
            business_name: lead.business_name || 'Your Business',
            business_name_slug: bizSlug,
            owner_name: lead.owner_name || 'there',
            audit_score: score,
            grade: grade,
            grade_color: gradeColor,
            category: lead.category || 'local business',
            city: lead.city || 'your city',
            niche_color: colors.primary,
            niche_color_alt: colors.alt,
            mockup_title: NICHE_MOCKUP_TITLES[niche] || NICHE_MOCKUP_TITLES.general,
            mockup_cta: NICHE_CTAS[niche] || NICHE_CTAS.general,
            mockup_url: mockupUrl,
            reply_to: process.env.FROM_EMAIL || '',
            cal_link: process.env.CAL_LINK || 'https://cal.com/artum8labs',
            outdated_signals: signals,
          });

          templateUsed = 'mockup-first-touch';
          emailSubject = `${lead.business_name} — we redesigned your website`;
          mockupCount++;
        } catch (mockupErr) {
          console.error(`[CRON] Mockup generation failed for ${lead.business_name}: ${mockupErr.message}. Falling back to audit.`);
          // Fall through to audit template below
          html = null;
        }
      }

      // ─── AUDIT PATH (default / fallback) ────────────────
      if (!html) {
        html = renderTemplate(auditTemplate, {
          business_name: lead.business_name || 'Your Business',
          owner_name: lead.owner_name || 'there',
          audit_score: score,
          grade: grade,
          grade_color: gradeColor,
          category: lead.category || 'local business',
          city: lead.city || 'your city',
          review_count: lead.review_count || 'several',
          reply_to: process.env.FROM_EMAIL || '',
          outdated_signals: signals,
        });
        templateUsed = 'audit-first-touch';
        emailSubject = `${lead.business_name} website score`;
        auditCount++;
      }

      try {
        await sendEmail({
          leadId: lead.lead_id,
          to: email,
          subject: emailSubject,
          html,
          templateName: templateUsed,
        });
        advanceLead(lead.lead_id, 'contacted');
        sentCount++;
        // Throttle sending to avoid spam filter triggers
        await new Promise(res => setTimeout(res, 2000));
      } catch (err) {
        console.error(`[CRON] Failed to send email to ${email}:`, err.message);
      }
    }
    
    console.log(`[CRON] 08:00 - Sent ${sentCount} first-touch emails (${mockupCount} mockups, ${auditCount} audits).`);
  } catch (err) {
    console.error('[CRON] 08:00 - Outreach failed:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 09:00 AM - SEND FOLLOW-UP DRIPS (Day 4 & Day 10)
// ─────────────────────────────────────────────────────────────
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] 09:00 - Starting automated follow-up sequences...');
  try {
    const { getEmailsForLead } = await import('./db.js');
    
    // We will query for leads in 'contacted' status.
    // For day 4: updated_at was ~4 days ago, and exactly 1 email sent.
    // For day 10: updated_at was ~10 days ago (or ~6 days since day 4), and exactly 2 emails sent.
    const allContacted = getLeadsByStatus('contacted', 500);
    const day4Leads = [];
    const day10Leads = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const lead of allContacted) {
      const emailCount = getEmailsForLead(lead.lead_id).length;
      const daysSinceFirstContact = (now - new Date(lead.updated_at).getTime()) / dayMs;

      // They get the day 4 follow up if it's been ~4 days since first contact
      if (emailCount === 1 && daysSinceFirstContact >= 4 && daysSinceFirstContact < 6) {
        day4Leads.push(lead);
      }
      // They get the day 10 follow up if it's been ~10 days since first contact
      else if (emailCount === 2 && daysSinceFirstContact >= 10 && daysSinceFirstContact < 12) {
        day10Leads.push(lead);
      }
    }

    const day4Template = await loadTemplate('competitor-case-study.html');
    const day10Template = await loadTemplate('social-proof.html');

    let followUpCount = 0;

    // Helper to process leads
    const processFollowUps = async (leads, template, subjectTemplate) => {
      for (const lead of leads) {
        const email = lead.owner_email || lead.emails?.[0];
        if (!email) continue;

        let html = renderTemplate(template, {
          business_name: lead.business_name || 'Your Business',
          owner_name: lead.owner_name || 'there',
          category: lead.category || 'local business',
          city: lead.city || 'your area',
          reply_to: process.env.FROM_EMAIL || '',
          competitor_name: 'a competitor',
          outdated_signal_1: lead.outdated_signals?.[0] || 'an outdated design',
          old_metric: 'almost no traffic',
          new_metric: 'consistent inbound leads',
        });

        try {
          await sendEmail({
            leadId: lead.lead_id,
            to: email,
            subject: subjectTemplate.replace('[business_name]', lead.business_name).replace('[city]', lead.city || 'your area'),
            html,
            templateName: 'follow-up'
          });
          followUpCount++;
          await new Promise(res => setTimeout(res, 2000));
        } catch (err) {
          console.error(`[CRON] Failed follow up to ${email}:`, err.message);
        }
      }
    };

    if (day4Leads.length > 0) {
      console.log(`[CRON] Sending Day 4 follow-ups to ${day4Leads.length} leads...`);
      await processFollowUps(day4Leads, day4Template, 'A competitor in [city] just updated their site');
    }

    if (day10Leads.length > 0) {
      console.log(`[CRON] Sending Day 10 follow-ups to ${day10Leads.length} leads...`);
      await processFollowUps(day10Leads, day10Template, '3 [category]s I helped last month');
    }
    
    console.log(`[CRON] 09:00 - Sent ${followUpCount} follow-up emails.`);
  } catch (err) {
    console.error('[CRON] 09:00 - Follow-up failed:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 10:00 AM - SEND POST-PROJECT REFERRAL EMAILS (Day 30 & Day 60)
// ─────────────────────────────────────────────────────────────
cron.schedule('0 10 * * *', async () => {
  console.log('[CRON] 10:00 - Starting post-project referral sequences...');
  try {
    const { getLeadsForFollowUp } = await import('./db.js');
    const day30Leads = getLeadsForFollowUp(720, 'closed_won');
    const day60Leads = getLeadsForFollowUp(1440, 'closed_won');

    const day30Template = await loadTemplate('referral-30.html');
    const day60Template = await loadTemplate('referral-60.html');

    let sentCount = 0;

    const processReferrals = async (leads, template, subjectTemplate) => {
      for (const lead of leads) {
        const email = lead.owner_email || lead.emails?.[0];
        if (!email) continue;

        let html = renderTemplate(template, {
          business_name: lead.business_name || 'Your Business',
          owner_name: lead.owner_name || 'there',
          city: lead.city || 'your area',
          cal_link: process.env.CAL_LINK || 'https://cal.com/artum8labs',
        });

        try {
          await sendEmail({
            leadId: lead.lead_id,
            to: email,
            subject: subjectTemplate.replace('[business_name]', lead.business_name),
            html,
            templateName: 'referral'
          });
          sentCount++;
          await new Promise(res => setTimeout(res, 2000));
        } catch (err) {
          console.error(`[CRON] Failed referral email to ${email}:`, err.message);
        }
      }
    };

    if (day30Leads.length > 0) {
      console.log(`[CRON] Sending Day 30 check-ins to ${day30Leads.length} clients...`);
      await processReferrals(day30Leads, day30Template, 'Checking in on [business_name]');
    }

    if (day60Leads.length > 0) {
      console.log(`[CRON] Sending Day 60 check-ins to ${day60Leads.length} clients...`);
      await processReferrals(day60Leads, day60Template, 'Scaling [business_name] further');
    }
    
    console.log(`[CRON] 10:00 - Sent ${sentCount} referral/upsell emails.`);
  } catch (err) {
    console.error('[CRON] 10:00 - Referral sequence failed:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 12:00 PM - CHECK REPLIES
// ─────────────────────────────────────────────────────────────
cron.schedule('0 12 * * *', async () => {
  console.log('[CRON] 12:00 - Checking for email replies...');
  try {
    const replies = await checkImapReplies();
    console.log(`[CRON] 12:00 - Processed ${replies.length} replies.`);
  } catch (err) {
    console.error('[CRON] 12:00 - Reply check failed:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 14:00 PM - COMMUNITY KEYWORD MONITOR (Reddit)
// ─────────────────────────────────────────────────────────────
cron.schedule('0 14 * * *', async () => {
  try {
    const { runCommunityMonitor } = await import('./community-monitor.js');
    await runCommunityMonitor();
  } catch (err) {
    console.error('[CRON] 14:00 - Community monitor failed:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 04:00 PM (16:00) - SEND DAILY SUMMARY REPORT TO ADMIN
// ─────────────────────────────────────────────────────────────
cron.schedule('0 16 * * *', async () => {
  console.log('[CRON] 16:00 - Generating daily report...');
  try {
    const db = getDb();
    
    // Get stats for today
    const today = new Date().toISOString().split('T')[0];
    const emailsSent = db.prepare(`SELECT count(*) as count FROM email_log WHERE sent_at LIKE ?`).get(today + '%').count;
    const repliesRecv = db.prepare(`SELECT count(*) as count FROM replies WHERE received_at LIKE ?`).get(today + '%').count;
    
    // Get current funnel
    const funnel = db.prepare(`SELECT status, count(*) as count FROM leads GROUP BY status`).all();
    let funnelText = funnel.map(f => `• ${f.status}: ${f.count}`).join('\n');

    const adminEmail = process.env.FROM_EMAIL;
    if (!adminEmail) return;

    const reportHtml = `
      <h2>Daily Operations Report</h2>
      <p><strong>Date:</strong> ${today}</p>
      <h3>Today's Metrics:</h3>
      <ul>
        <li>Emails Sent: ${emailsSent}</li>
        <li>Replies Received: ${repliesRecv}</li>
      </ul>
      <h3>Current Pipeline:</h3>
      <ul>
        ${funnel.map(f => `<li>${f.status}: ${f.count}</li>`).join('')}
      </ul>
    `;

    await sendEmail({
      to: adminEmail,
      subject: `[Artum 8 Labs] Daily Report - ${today}`,
      html: reportHtml,
      templateName: 'daily-report'
    });

    console.log(`[CRON] 16:00 - Daily report sent to ${adminEmail}.`);
  } catch (err) {
    console.error('[CRON] 16:00 - Daily report failed:', err.message);
  }
});
