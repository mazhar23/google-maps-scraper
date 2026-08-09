import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function searchGoogleMaps({ query, limit = 20, city, state }) {
  const location = [city, state].filter(Boolean).join(', ');
  const q = location ? `${query} near ${location}` : query;
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (apifyToken) {
    const fromApify = await apifyGooglePlaces({ query, limit, token: apifyToken });
    if (fromApify.length) return fromApify;
  }

  const yelpToken = process.env.YELP_API_TOKEN;
  if (yelpToken) {
    const fromYelp = await yelpSearch({ term: query, location: location || 'USA', limit, token: yelpToken });
    if (fromYelp.length) return fromYelp;
  }

  const candidates = [];
  const urls = [
    `https://www.google.com/maps/search/${encodeURIComponent(q)}?hl=en&gl=us`,
    `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=us&num=20`,
    `https://www.yelp.com/search?find_desc=${encodeURIComponent(q)}&find_loc=${encodeURIComponent(location || 'USA')}`,
  ];

  for (const url of urls) {
    try {
      const resp = await axios.get(url, {
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      const text = typeof resp.data === 'string' ? resp.data : '';
      await parseCandidates(q, url, text, candidates);
    } catch {
      // continue
    }
  }

  const seen = new Set();
  const unique = [];
  for (const item of candidates) {
    const key = item.name || item.href;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit + 5) break;
  }
  return unique.slice(0, limit + 5);
}

async function parseCandidates(query, url, text, candidates) {
  if (!text) return;
  if (url.includes('google.com/maps')) {
    const m = text.match(/\/search\?tbm=map[^"]+pb=([^"]+)/);
    const decoded = m ? decodeURIComponent(m[1]).split('!') : [];
    for (const token of decoded) {
      if (token.startsWith('1s') || token.startsWith('2s')) continue;
      const maybeUrl = token.replace(/^0s/, '').replace(/^7i\d+/, '');
      if (maybeUrl.startsWith('http')) {
        const decodedUrl = decodeURIComponent(maybeUrl);
        if (decodedUrl.includes('maps.google.com') || decodedUrl.includes('maps.app.goo.gl')) {
          candidates.push({ name: String(decodedUrl), href: decodedUrl, source: 'Google Maps', query });
        }
      }
    }
  } else if (url.includes('google.com/search')) {
    const $ = cheerio.load(text);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const textContent = $(el).text().trim();
      if (textContent && href.includes('maps.google.com/maps?q=')) {
        candidates.push({ name: textContent.split('\n')[0].trim(), href, source: 'Google Search', query });
      }
    });
  } else if (url.includes('yelp.com')) {
    const $ = cheerio.load(text);
    $('a[href*="/biz/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const textContent = $(el).text().trim();
      if (textContent) candidates.push({ name: textContent.split('\n')[0].trim(), href, source: 'Yelp', query });
    });
  }
}

async function yelpSearch({ term, location, limit, token }) {
  try {
    const params = new URLSearchParams({ term, location, limit: String(Math.min(limit, 50)) });
    const resp = await axios.get(`https://api.yelp.com/v3/businesses/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const businesses = resp.data?.businesses || [];
    return businesses.slice(0, limit).map(b => ({
      name: b.name || '',
      href: b.url || `https://www.yelp.com/biz/${b.alias || ''}`,
      source: 'Yelp Fusion',
      query: `${term} in ${location}`,
      raw: {
        name: b.name,
        address: b.location?.address1 || '',
        city: b.location?.city || '',
        state: b.location?.state || '',
        zip: b.location?.zip_code || '',
        phone: b.phone || '',
        website: '',
        rating: b.rating ?? '',
        reviewCount: b.review_count ?? '',
        categories: b.categories || [],
        url: b.url || '',
      },
    }));
  } catch {
    return [];
  }
}

async function apifyGooglePlaces({ query, limit, token }) {
  try {
    const resp = await axios.post(
      `https://api.apify.com/v2/actor-tasks/${encodeURIComponent('compass/crawler-google-places')}/run-sync?token=${encodeURIComponent(token)}&recomputeStatuses=true`,
      { searchString: query, maxCrawledPlaces: limit },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    const data = resp.data;
    const places = (data && (data.items || data.places || (Array.isArray(data) ? data : []))) || [];
    return places.slice(0, limit).map(place => ({
      name: place.name || place.title || '',
      href: place.mapsUrl || place.url || '',
      source: 'Apify',
      query,
      raw: place,
    }));
  } catch {
    return [];
  }
}

export async function enrichMapsListing(entry) {
  const href = entry.href || '';
  const raw = entry.raw || {};
  const data = {
    business_name: raw.name || entry.name || '',
    category: [raw.categories?.map(c => c.title).filter(Boolean).join(', '), entry.query].filter(Boolean).join(' | ') || '',
    address: raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    zip_code: raw.zip || '',
    phone: raw.phone || '',
    website: raw.website || '',
    rating: raw.rating ?? '',
    review_count: raw.reviewCount ?? '',
    source_url: href,
  };

  const needsWebsite = !data.website && href;
  if (needsWebsite) {
    try {
      const resp = await axios.get(href, {
        headers: { 'user-agent': USER_AGENT },
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      const text = typeof resp.data === 'string' ? resp.data : '';
      const $ = cheerio.load(text);

      const websiteLink = $('a[href*="/biz_redir?"], a[href*="/website?"], a[href*="://"]' +
        ', span:contains("Business website")');
      const websiteHref = websiteLink.attr('href') || '';
      const websiteMatch = text.match(/https?:\/\/(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/g);
      const domains = websiteMatch
        .map(u => u.replace(/\/$/, '').split(/[?#]/)[0])
        .filter(u => !u.includes('google.com') && !u.includes('googleapis.com') && !u.includes('gstatic.com') && !u.includes('yelp.com'));

      if (websiteHref && websiteHref.includes('http')) {
        data.website = websiteHref.split(/[?#]/)[0];
      } else if (domains.length) {
        data.website = domains[0] || '';
      }

      const phoneMatch = text.match(/\+?1?\s*\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
      if (phoneMatch) data.phone = phoneMatch[0].trim();
    } catch {
      // ignore
    }
  }

  return data;
}
