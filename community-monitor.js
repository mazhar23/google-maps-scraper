import fetch from 'node-fetch';
import { sendEmail } from './email-sender.js';

const SUBREDDITS = [
  'smallbusiness',
  'Entrepreneur',
  'sweatystartup',
  'restaurantowners',
  'ecommerce'
];

const KEYWORDS = [
  'need a website',
  'need a developer',
  'looking for a developer',
  'looking for a web designer',
  'website is broken',
  'build a website',
  'shopify expert',
  'wordpress help',
  'seo help',
  'local seo'
];

/**
 * Scans subreddits for keywords and sends an alert email if matches are found.
 */
export async function runCommunityMonitor() {
  console.log('[MONITOR] Starting Reddit community scan...');
  
  const matches = [];

  for (const sub of SUBREDDITS) {
    try {
      // Using Reddit's open JSON API (limit 50 new posts)
      const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=50`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' // Generic UA to avoid 429
        }
      });

      if (!res.ok) {
        console.warn(`[MONITOR] Failed to fetch r/${sub}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const posts = data.data?.children || [];

      for (const post of posts) {
        const { title, selftext, url, created_utc, author } = post.data;
        
        // Only care about posts from the last 24 hours
        if ((Date.now() / 1000) - created_utc > 24 * 60 * 60) continue;

        const content = `${title} ${selftext}`.toLowerCase();
        
        const matchedKeywords = KEYWORDS.filter(kw => content.includes(kw));
        if (matchedKeywords.length > 0) {
          matches.push({
            subreddit: sub,
            title,
            author,
            url,
            matchedKeywords
          });
        }
      }
      
      // Delay to respect rate limits
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[MONITOR] Error scanning r/${sub}:`, err.message);
    }
  }

  if (matches.length > 0) {
    console.log(`[MONITOR] Found ${matches.length} high-intent posts. Sending alert...`);
    
    // Build HTML for alert
    const html = `
      <h2>Community Keyword Matches (${new Date().toLocaleDateString()})</h2>
      <p>Found ${matches.length} posts matching your target keywords in the last 24 hours:</p>
      <hr>
      ${matches.map(m => `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
          <h3><a href="${m.url}" target="_blank">${m.title}</a></h3>
          <p><strong>Subreddit:</strong> r/${m.subreddit}</p>
          <p><strong>Author:</strong> u/${m.author}</p>
          <p><strong>Keywords:</strong> <span style="background: #e0f2fe; padding: 3px 6px; border-radius: 4px; color: #0369a1;">${m.matchedKeywords.join(', ')}</span></p>
        </div>
      `).join('')}
    `;

    try {
      // Send alert to the user's own email
      await sendEmail({
        to: process.env.FROM_EMAIL || 'youremail@example.com',
        subject: `🚨 ${matches.length} New Lead Opportunities from Reddit`,
        html,
        templateName: 'internal-alert'
      });
      console.log('[MONITOR] Alert email sent successfully.');
    } catch (err) {
      console.error('[MONITOR] Failed to send alert email:', err.message);
    }
  } else {
    console.log('[MONITOR] No matching posts found today.');
  }
}
