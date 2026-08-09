import axios from 'axios';
import * as cheerio from 'cheerio';

export async function extractContactsFromWebsite({ website, businessName }) {
  const result = {
    emails: [],
    additional_phones: [],
    owner_name: '',
    owner_title: '',
    owner_email: '',
    owner_phone: '',
    owner_linkedin: '',
    team_contacts: [],
    business_hours: '',
    social: { facebook: '', twitter: '', linkedin: '', instagram: '', youtube: '', tiktok: '' },
  };

  if (!website) return result;

  const normalized = website.replace(/\/$/, '');
  const baseUrl = normalized.startsWith('http') ? normalized : `https://${normalized}`;
  const pages = [baseUrl, '/about', '/about-us', '/contact', '/contact-us', '/team', '/our-team', '/leadership'];

  const visited = new Set();
  for (const page of pages) {
    const url = page.startsWith('http') ? page : `${baseUrl}${page}`;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const resp = await axios.get(url, {
        headers: { 'user-agent': 'Mozilla/5.0' },
        timeout: 15000,
        maxRedirects: 3,
        validateStatus: () => true,
      });
      const html = typeof resp.data === 'string' ? resp.data : '';
      const $ = cheerio.load(html);

      result.emails = mergeUnique(result.emails, extractEmails(html));
      result.additional_phones = mergeUnique(result.additional_phones, extractPhones(html));
      result.business_hours = detectBusinessHours(html);

      result.social = { ...result.social, ...extractSocials($, baseUrl) };

      if (!result.owner_name || !result.owner_email) {
        const owner = guessOwnerFromPage($, html, businessName);
        if (owner.name && !result.owner_name) result.owner_name = owner.name;
        if (owner.email && !result.owner_email) result.owner_email = owner.email;
        if (owner.title && !result.owner_title) result.owner_title = owner.title;
        if (owner.linkedin && !result.owner_linkedin) result.owner_linkedin = owner.linkedin;
      }

      if (/about|team|leadership|owner|founder/i.test(url) && !result.owner_name) {
        const names = detectNames($);
        if (names.length) result.owner_name = names[0];
      }
    } catch {
      // continue
    }
  }

  result.emails = result.emails.slice(0, 10);
  result.additional_phones = result.additional_phones.slice(0, 10);
  return result;
}

function extractEmails(html) {
  const matched = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const cleaned = matched
    .map(e => e.toLowerCase())
    .filter(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg') && !e.endsWith('.css') && !e.endsWith('.js'));
  return Array.from(new Set(cleaned));
}

function extractPhones(html) {
  const matched = html.match(/\+?1?\s*\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g) || [];
  return Array.from(new Set(matched.map(p => p.trim())));
}

function detectBusinessHours(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();
  const m = text.match(/(?:monday|mon).*?(?:friday|fri).*?\d{1,2}:\d{2}/i);
  return m ? m[0].slice(0, 140) : '';
}

function extractSocials($, baseUrl) {
  const links = {
    facebook: '',
    twitter: '',
    linkedin: '',
    instagram: '',
    youtube: '',
    tiktok: '',
  };

  const hostname = new URL(baseUrl).hostname.replace(/^www\./, '');

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').toLowerCase();
    const text = ($(el).text() || '').toLowerCase();
    if (href.includes('facebook.com') || text.includes('facebook')) links.facebook = resolveLink(href, baseUrl);
    if (href.includes('twitter.com') || href.includes('x.com') || text.includes('twitter'))
      links.twitter = resolveLink(href, baseUrl);
    if (href.includes('linkedin.com') || text.includes('linkedin')) links.linkedin = resolveLink(href, baseUrl);
    if (href.includes('instagram.com') || text.includes('instagram')) links.instagram = resolveLink(href, baseUrl);
    if (href.includes('youtube.com') || text.includes('youtube')) links.youtube = resolveLink(href, baseUrl);
    if (href.includes('tiktok.com') || text.includes('tiktok')) links.tiktok = resolveLink(href, baseUrl);
  });

  return links;
}

function guessOwnerFromPage($, html, businessName) {
  const result = { name: '', email: '', title: '', linkedin: '' };
  const nameRoot = businessName ? businessName.split(' ')[0] : '';
  const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const ownerish = emailMatch.find(e => /^(owner|info|contact|hello|hi|admin|support)@/i.test(e) === false);
  if (ownerish) result.email = ownerish.toLowerCase();

  const linkedinCandidates = [];
  $('a[href*="linkedin.com/in"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = ($(el).text() || '').trim();
    if (text && (!nameRoot || text.toLowerCase().includes(nameRoot.toLowerCase()))) {
      linkedinCandidates.push(href);
    }
  });
  result.linkedin = linkedinCandidates[0] || '';

  const headings = $('h1, h2, h3').text().split('\n').map(s => s.trim()).filter(Boolean);
  for (const h of headings) {
    if (nameRoot && h.toLowerCase().includes(nameRoot.toLowerCase())) {
      result.name = h;
      break;
    }
  }

  return result;
}

function detectNames($) {
  const names = [];
  $('h1, h2, h3').each((_, el) => {
    const text = ($(el).text() || '').trim();
    if (text && text.split(' ').length <= 5) names.push(text);
  });
  return Array.from(new Set(names)).slice(0, 10);
}

function resolveLink(href, baseUrl) {
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return new URL(href, baseUrl).href;
  return `${baseUrl}/${href}`;
}

function mergeUnique(arrA, arrB) {
  const set = new Set([...arrA, ...arrB]);
  return Array.from(set);
}
