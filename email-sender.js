import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { logEmail as dbLogEmail } from './db.js';

const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
const BREVO_SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT || '587', 10);
const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || '';
const BREVO_SMTP_PASS = process.env.BREVO_SMTP_PASS || '';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || BREVO_SMTP_USER;
const FROM_NAME = process.env.FROM_NAME || 'Lead Automation';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: BREVO_SMTP_HOST,
    port: BREVO_SMTP_PORT,
    secure: BREVO_SMTP_PORT === 465,
    auth: {
      user: BREVO_SMTP_USER,
      pass: BREVO_SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
  return transporter;
}

/**
 * Send a single email via Brevo SMTP.
 * Accepts optional leadId + template for logging.
 *
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]
 * @param {string} [opts.leadId]
 * @param {string} [opts.templateName]
 * @returns {Promise<object>} nodemailer result
 */
export async function sendEmail({ to, subject, html, text, leadId, templateName = 'manual' }) {
  if (!BREVO_SMTP_USER || !BREVO_SMTP_PASS) {
    throw new Error('BREVO_SMTP_USER and BREVO_SMTP_PASS must be set in environment variables');
  }

  const mailOptions = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
    headers: {
      'X-Entity-Ref-ID': `a8l-${leadId || 'no-lead'}`,
    },
  };

  const tx = getTransporter();
  const result = await tx.sendMail(mailOptions);

  // Log the sent email for tracking (best-effort)
  if (leadId && result.messageId) {
    try {
      dbLogEmail({
        leadId,
        messageId: result.messageId,
        to,
        subject: subject || '',
        template: templateName || 'manual',
      });
    } catch {
      // ignore logging errors — don't fail the send
    }
  }

  return result;
}

/**
 * Send multiple emails with built-in delay and per-email logging.
 * @param {Array<{to, subject, html, text?, leadId?, templateName?}>} emails
 * @returns {Promise<Array<{to, status, messageId?, error?}>}
 */
export async function sendBulkEmails(emails) {
  const results = [];
  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      results.push({ to: email.to, status: 'sent', messageId: result.messageId });
    } catch (err) {
      results.push({ to: email.to, status: 'failed', error: err.message });
    }
  }
  return results;
}

/**
 * Load an email template file from the email-templates/ directory.
 * @param {string} templateName - e.g. "audit-first-touch.html"
 * @returns {Promise<string>}
 */
export async function loadTemplate(templateName) {
  const templatePath = path.join(process.cwd(), 'email-templates', templateName);
  return fs.readFile(templatePath, 'utf8');
}

export function getDailyLimit() {
  return parseInt(process.env.EMAIL_DAILY_LIMIT || '300', 10);
}

export function getConfig() {
  return {
    smtpHost: BREVO_SMTP_HOST,
    smtpPort: BREVO_SMTP_PORT,
    smtpUser: BREVO_SMTP_USER ? BREVO_SMTP_USER.replace(/(.{3}).*(@.*)/, '$1***$2') : 'not set',
    fromEmail: FROM_EMAIL ? FROM_EMAIL.replace(/(.{3}).*(@.*)/, '$1***$2') : 'not set',
    fromName: FROM_NAME,
    dailyLimit: getDailyLimit(),
    hasApiKey: !!BREVO_API_KEY,
  };
}
