# Audit Widget — artum8labs.com

A standalone Express server that provides a **free website audit widget** for Artum 8 Labs.

## What It Does

- **`/`** — Full-page landing page at `/free-audit` (or root)
- **`/api/audit`** — API endpoint that runs `auditWebsite()` and returns score, grade, issues, and service recommendation
- **`/widget.js`** — Embeddable script that any site can include to add the audit widget in 1 line

## Quick Start

```bash
# Install dependencies (already in package.json)
npm install

# Run locally
node audit-widget.js
# → http://localhost:3001
```

## Deployment Options

### Vercel (Serverless / Edge)

Create `vercel.json`:

```json
{
  "functions": {
    "audit-widget.js": {
      "runtime": "nodejs18.x",
      "maxDuration": 30
    }
  },
  "routes": [
    { "src": "/api/audit", "dest": "/audit-widget.js" },
    { "src": "/widget.js", "dest": "/audit-widget.js" },
    { "src": "/(.*)", "dest": "/audit-widget.js" }
  ]
}
```

Then `vercel --prod` from the project root.

### Render / Railway (Full Node)

```bash
# Just point the service to:
node audit-widget.js
# Set env vars: PORT (auto-assigned), CAL_LINK, COMPANY_NAME
```

### Netlify (Serverless Function)

Create `netlify/functions/audit.js`:

```js
import { auditWebsite } from '../../website-auditor.js';

export async function handler(event) {
  const { website } = JSON.parse(event.body);
  const audit = await auditWebsite(website);
  return { statusCode: 200, body: JSON.stringify(audit) };
}
```

Then set up redirects in `netlify.toml`:

```toml
[[redirects]]
  from = "/api/audit"
  to = "/.netlify/functions/audit"
  status = 200
```

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | 3001 | Widget server port |
| `CAL_LINK` | cal.com link | CTA button URL |
| `COMPANY_NAME` | Artum 8 Labs | Brand name in responses |

## Embed Code

Drop this on any page to embed the widget:

```html
<div id="audit-widget-root"></div>
<script>
  window.Artum8LabsAuditSettings = {
    apiUrl: 'https://audit.artum8labs.com/api/audit',
    brandColor: '#4f46e5',
    buttonText: 'Audit My Website',
    calLink: 'https://cal.com/artum8labs'
  };
</script>
<script src="https://audit.artum8labs.com/widget.js"></script>
```

## Daily Automation with Cron

The full system is orchestrated by `cron.js`:

```bash
# Run the automation server (scrapes, emails, monitors replies, 24/7)
node cron.js
```

Schedule:
| Time | Task |
|------|------|
| 06:00 | Scrape 50 new leads (dentist, Austin, TX) |
| 08:00 | Send first-touch audit emails to new leads |
| 09:00 | Send Day-4 / Day-10 follow-up sequences |
| 10:00 | Send Day-30 / Day-60 referral upsells |
| 12:00 | Check IMAP inbox for replies |
| 14:00 | Scan Reddit for high-intent business queries |
| 16:00 | Send daily metrics report to admin email |
