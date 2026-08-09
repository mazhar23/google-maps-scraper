import axios from 'axios';
import * as cheerio from 'cheerio';

const UNAVAILABLE_TIME_MS = 4000;
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function safeRequest(url) {
  return axios.get(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 3,
    validateStatus: () => true,
  });
}

export async function auditWebsite(website) {
  if (!website) {
    return {
      website,
      has_website: false,
      website_status: 'missing',
      website_score: 0,
      website_grade: 'F',
      outdated_signals: ['No website found'],
      tech_stack: [],
    };
  }

  const normalized = website.replace(/\/$/, '');
  const homepageUrl = normalized.startsWith('http') ? normalized : `https://${normalized}`;
  const status = {
    website: normalized,
    has_website: true,
    website_status: 'unknown',
    website_score: 0,
    website_grade: 'F',
    outdated_signals: [],
    tech_stack: [],
    https: false,
    has_robots: false,
    has_sitemap: false,
    mobile_friendly: false,
    load_speed_rating: 'unknown',
  };

  try {
    const homeResp = await safeRequest(homepageUrl);
    const finalUrl = homeResp.request?.res?.responseUrl || homepageUrl;
    status.https = finalUrl.startsWith('https');
    status.website_status = homeResp.status === 200 ? 'live' : homeResp.status >= 400 ? 'down_or_error' : 'unclear';
    const html = typeof homeResp.data === 'string' ? homeResp.data : '';
    const $ = cheerio.load(html);

    const title = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const viewport = $('meta[name="viewport"]').attr('content') || '';
    status.mobile_friendly = Boolean(viewport);

    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const bodyLower = bodyText.toLowerCase();

    status.has_robots = await checkResource(`${homepageUrl.replace(/\/$/, '')}/robots.txt`);
    status.has_sitemap = await checkResource(`${homepageUrl.replace(/\/$/, '')}/sitemap.xml`);

    const signals = [];
    if (!status.https) signals.push('No HTTPS');
    if (!title || title.length < 3) signals.push('Missing or tiny title');
    if (!metaDesc || metaDesc.length < 20) signals.push('Missing meta description');
    if (!viewport) signals.push('No viewport meta');
    if (/copyright\s+19\d{2}/i.test(bodyText)) signals.push('Very old copyright');
    if (/copyright\s+20(0|1|2)[0-9]/i.test(bodyText) && !/202[4-9]|2030/.test(bodyText)) signals.push('Stale copyright year');

    if (/\bhtml\s*\d\b/i.test(html) || /<!DOCTYPE\s+html\s+PUBLIC/i.test(html)) {
      signals.push('Very old HTML patterns');
    }
    if (/<center/i.test(html) || /<font\s/i.test(html) || /<marquee/i.test(html)) {
      signals.push('Deprecated presentational HTML');
    }

    const inlineStyles = (html.match(/style="/g) || []).length;
    if (inlineStyles > 40) signals.push(`High inline styles (${inlineStyles})`);

    const tablesForLayout = ($('table').length > 3 && $('div').length < 20);
    if (tablesForLayout) signals.push('Possible table-based layout');

    const tech = [];
    if (/jquery[^\d]*1\.|jquery-?1\./i.test(html)) tech.push('jQuery 1.x');
    if (/bootstrap\/?3/i.test(html) || /bootstrap\.min\.css/i.test(html) && /bootstrap-theme/i.test(html))
      tech.push('Bootstrap 3-like');
    if (/angular\.js|angularjs/i.test(html) && /angular\.min\.js/i.test(html) && !/react/i.test(html))
      tech.push('AngularJS 1.x');
    if (/react/i.test(html)) tech.push('React');
    if (/next\.js/i.test(html) || /__next/i.test(html)) tech.push('Next.js');
    if (/vue/i.test(html)) tech.push('Vue');
    status.tech_stack = Array.from(new Set(tech));

    if (/©\s*(19\d{2}|20(0|1|2)[0-9])/i.test(bodyText) && !/©\s*202[4-9]/i.test(bodyText))
      signals.push('Stale footer year');

    if (bodyLower.includes('under construction') || bodyLower.includes('coming soon'))
      signals.push('Placeholder/unfinished content');

    status.outdated_signals = signals.length ? signals : ['No obvious outdated signals found'];
    status.website_score = Math.max(0, 100 - signals.length * 15 - (status.https ? 0 : 20) - (!viewport ? 10 : 0));
    status.website_score = Math.min(100, status.website_score);
    status.website_grade = gradeFromScore(status.website_score);
  } catch (err) {
    status.website_status = 'error';
    status.outdated_signals = [`Audit error: ${err.message}`];
    status.website_score = 0;
    status.website_grade = 'F';
  }

  return status;
}

async function checkResource(url) {
  try {
    const resp = await axios.get(url, {
      headers: { 'user-agent': USER_AGENT },
      timeout: UNAVAILABLE_TIME_MS,
      maxRedirects: 2,
      validateStatus: () => true,
    });
    return resp.status === 200;
  } catch {
    return false;
  }
}

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
