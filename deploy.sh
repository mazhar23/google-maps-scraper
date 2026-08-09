#!/usr/bin/env bash
set -e

echo "🚀 Deploying Artum 8 Labs Audit Widget to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install with: npm i -g vercel"
    exit 1
fi

echo "✅ Vercel CLI found"

# Deploy to production
echo "📦 Deploying to Vercel..."
vercel --prod --confirm

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Go to https://vercel.com/artum8labs/audit-widget/settings/domains"
echo "2. Add custom domain: audit.artum8labs.com"
echo "3. Vercel will show you DNS records to add at your registrar"
echo "4. Add those DNS records (usually A record or CNAME)"
echo "5. Wait 5-10 minutes for DNS propagation"
echo ""
echo "Test your deployment:"
echo "  curl https://audit.artum8labs.com/api/audit -X POST -H 'Content-Type: application/json' -d '{\"website\":\"example.com\"}'"
