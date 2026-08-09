# Lead Automation (Merged)

Automate local-business lead extraction, website outdatedness scoring, contact enrichment, Brevo email outreach, and Excel export. Includes Docker-based Google Maps scraping with proxy rotation.

## What It Produces

- business name, category, address, city, state, zip
- phone / website / rating / review count
- extracted emails, additional phones, business hours
- social links: facebook, twitter, linkedin, instagram, youtube, tiktok
- owner name, title, email, phone, linkedin
- team contacts
- website audit: score, grade, outdated signals, tech stack, HTTPS, robots, sitemap, mobile friendly

## Requirements

- Node.js 18+ with `npm`
- Dependencies: `axios`, `cheerio`, `exceljs`, `playwright`, `uuid`, `nodemailer`
- Optional: `APIFY_API_TOKEN` for live Google Maps bulk scraping via Apify
- Optional: `YELP_API_TOKEN` for Yelp Fusion search
- Optional: Docker for proxy rotation via Google Maps scraper scripts

## Install

```bash
npm install
# Optional for browser scrapers
npx playwright install chromium
```

## Usage

```bash
# Run with defaults (New York, 50 leads)
node cli.js

# Run with custom params (multi-state)
node cli.js --query "dentist" --states CA,TX,NY --limit 100

# Run with state names
node cli.js --query "plumber" --states "California,Texas" --limit 50

# List all available states
node cli.js --states help

# Batch mode from input JSON
node batch-runner.js output/sample-input.json 50 output/leads.xlsx

# Inspect latest Excel output
node inspect-output.mjs

# Docker-based scraping with proxy rotation
bash start.sh
```

## Project Structure

```
Desktop/google-maps-scraper/
├── SKILL.md                    # Scraper skill documentation
├── start.sh                    # Docker one-command starter
├── api_keys.txt.txt            # Brevo SMTP + OpenAI keys (SECRET)
├── new-roadmap-to-impliment.txt # Full automation roadmap
├── .env.example                # Environment variable template
├── pipeline.js                 # Orchestrator (multi-state aware)
├── cli.js                      # CLI entry point
├── batch-runner.js             # Batch execution
├── google-maps-scraper.js      # Maps search + enrichment (free direct scraping)
├── website-auditor.js          # Website audit
├── contact-enricher.js         # Contact/social extraction
├── excel-exporter.js           # .xlsx output
├── email-sender.js             # Brevo SMTP/API email sending
├── client-proposal.html        # Client-facing service proposal template
├── inspect-output.mjs          # Quick inspect of latest .xlsx
├── run-full.sh                 # Full run script
├── email-templates/
│   └── outreach.html           # Beautiful HTML outreach template
├── output/
│   ├── la-dentists.json        # 16 sample leads
│   └── sample-input.json       # Sample input for batch mode
├── scripts/                    # Docker + proxy scripts
│   ├── run-local.sh
│   ├── configure-proxy.sh
│   ├── ensure-latest.sh
│   └── ...
└── references/                 # Proxy setup, recovery docs
    ├── proxy-setup.md
    ├── recovery.md
    └── ...
```

## Output

Excel workbook and JSON data written to the `output/` directory.

## Brevo Email Setup

1. Copy `.env.example` to `.env.local` and fill in your Brevo credentials
2. The credentials from `api_keys.txt.txt` should be moved to `.env.local`
3. Email sending is available via the `email-sender.js` module — import and call `sendEmail()` or `sendBulkEmails()`
4. Daily limit is 300 emails (Brevo free tier), configurable via `EMAIL_DAILY_LIMIT` env var
