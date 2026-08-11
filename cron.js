import cron from 'node-cron';
import { runPipeline } from './pipeline.js';
import { checkImapReplies } from './reply-detector.js';
import { getLeadsByStatus, getLeadsForFollowUp, getDb } from './db.js';
import { sendEmail, loadTemplate } from './email-sender.js';
import { advanceLead } from './crm.js';
import { renderTemplate } from './template-renderer.js';
import fs from 'fs/promises';
import path from 'path';

console.log('🚀 Starting Artum 8 Labs Automation Cron Server...');
console.log('⏰ Scheduled tasks loaded. Waiting for triggers...');

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
// ─────────────────────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] 08:00 - Starting daily email outreach...');
  try {
    const leads = getLeadsByStatus('new', 50); // Fetch top 50 new leads
    
    if (leads.length === 0) {
      console.log('[CRON] No new leads to email today.');
      return;
    }

    const htmlTemplate = await loadTemplate('audit-first-touch.html');

    let sentCount = 0;
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

      const html = renderTemplate(htmlTemplate, {
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

      try {
        await sendEmail({
          leadId: lead.lead_id,
          to: email,
          subject: `${lead.business_name} website score`,
          html,
          templateName: 'audit-first-touch'
        });
        advanceLead(lead.lead_id, 'contacted');
        sentCount++;
        // Throttle sending slightly to avoid triggering spam filters instantly
        await new Promise(res => setTimeout(res, 2000));
      } catch (err) {
        console.error(`[CRON] Failed to send email to ${email}:`, err.message);
      }
    }
    
    console.log(`[CRON] 08:00 - Sent ${sentCount} first-touch emails.`);
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
