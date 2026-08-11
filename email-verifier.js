import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * Basic email verification without external APIs.
 * Checks:
 * 1. Syntax validity
 * 2. Domain has MX records (can receive email)
 * 3. Not a known disposable/temp email domain
 */
export async function verifyEmailBasic(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'missing_email' };
  }

  const trimmed = email.trim().toLowerCase();

  // Syntax check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: 'invalid_syntax' };
  }

  const domain = trimmed.split('@')[1];

  // Check for disposable email domains
  const disposableDomains = [
    'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'yopmail.com',
    'trashmail.com', 'mailinator.com', 'fakeinbox.com', 'dispostable.com',
    'throwaway.email', 'temp-mail.org', 'getnada.com', 'mohmal.com',
  ];
  if (disposableDomains.some(d => domain === d || domain.endsWith('.' + d))) {
    return { valid: false, reason: 'disposable_domain' };
  }

  // Check MX records
  try {
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'no_mx_records' };
    }
  } catch (err) {
    return { valid: false, reason: 'mx_lookup_failed' };
  }

  return { valid: true, reason: 'passed', domain };
}

/**
 * Verify email via ZeroBounce API (optional, requires API key).
 * Free tier: 100 verifications/month.
 * https://www.zerobounce.net/
 */
export async function verifyEmailZeroBounce(email, apiKey) {
  if (!apiKey || !email) {
    return { valid: false, reason: 'missing_api_key_or_email' };
  }

  try {
    const resp = await fetch(`https://api.zerobounce.net/v2/validate?apikey=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      return { valid: false, reason: 'api_error', status: resp.status };
    }

    const data = await resp.json();
    const status = (data.status || '').toLowerCase();

    return {
      valid: status === 'valid',
      reason: status,
      domain: data.domain || '',
      free_email: data.free_email || false,
      catch_all: data.catch_all || false,
      smtp_provider: data.smtp_provider || '',
      raw: data,
    };
  } catch (err) {
    return { valid: false, reason: 'api_request_failed', error: err.message };
  }
}

/**
 * Verify email via Hunter API (optional, requires API key).
 * Free tier: 25 verifications/month.
 * https://hunter.io/
 */
export async function verifyEmailHunter(email, apiKey) {
  if (!apiKey || !email) {
    return { valid: false, reason: 'missing_api_key_or_email' };
  }

  try {
    const resp = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      return { valid: false, reason: 'api_error', status: resp.status };
    }

    const data = await resp.json();
    const result = data.data || {};
    const status = (result.status || '').toLowerCase();

    return {
      valid: status === 'valid',
      reason: status,
      domain: result.domain || '',
      free_email: result.webmail || false,
      catch_all: result.mx_records ? result.mx_records.length > 0 : false,
      smtp_provider: result.smtp_server || '',
      raw: data,
    };
  } catch (err) {
    return { valid: false, reason: 'api_request_failed', error: err.message };
  }
}

/**
 * Verify an email using available methods.
 * Tries ZeroBounce first if API key is provided,
 * falls back to Hunter, then basic verification.
 */
export async function verifyEmail(email, options = {}) {
  const { zerobounceKey, hunterKey, strict = false } = options;

  // Try ZeroBounce if key provided
  if (zerobounceKey) {
    const result = await verifyEmailZeroBounce(email, zerobounceKey);
    if (result.reason !== 'api_error' && result.reason !== 'api_request_failed') {
      return result;
    }
  }

  // Try Hunter if key provided
  if (hunterKey) {
    const result = await verifyEmailHunter(email, hunterKey);
    if (result.reason !== 'api_error' && result.reason !== 'api_request_failed') {
      return result;
    }
  }

  // Fallback to basic verification
  return verifyEmailBasic(email);
}
