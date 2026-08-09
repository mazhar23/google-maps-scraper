#!/usr/bin/env bash
# deploy-audit-widget.sh
# One-command deployment for Artum 8 Labs Audit Widget to Vercel
set -e

echo "🚀 Artum 8 Labs — Audit Widget Deployment"
echo "========================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found."
    echo "   Install with: npm install -g vercel"
    echo "   Then run this script again."
    exit 1
fi
echo "✅ Vercel CLI: $(vercel --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --silent
echo "✅ Dependencies installed"

# Check environment
echo ""
echo "🔧 Checking environment configuration..."
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Copying from .env.example..."
    cp .env.example .env
    echo "   ⚠️  Please edit .env and add your CAL_LINK and COMPANY_NAME"
fi

# Deploy to Vercel
echo ""
echo "🚀 Deploying to Vercel..."
echo "   (If prompted, select 'Create New Project')"
echo ""

vercel --prod --confirm

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. Go to your Vercel dashboard: https://vercel.com/artum8labs/audit-widget"
echo "   (Replace 'artum8labs' with your Vercel username if different)"
echo ""
echo "2. Go to Settings → Domains"
echo "   Add custom domain: audit.artum8labs.com"
echo ""
echo "3. Vercel will show you DNS records. Go to Namecheap:"
echo "   https://www.namecheap.com/myaccount/domain-list/"
echo "   Click 'Manage' for artum8labs.com → Advanced DNS"
echo "   Add the DNS records Vercel shows you (usually a CNAME)"
echo ""
echo "4. Wait 5-10 minutes for DNS propagation"
echo ""
echo "5. Test:"
echo "   curl https://audit.artum8labs.com/api/audit -X POST -H 'Content-Type: application/json' -d '{\"website\":\"example.com\"}'"
echo ""
echo "6. Embed on your main site:"
echo "   <script src='https://audit.artum8labs.com/widget.js'></script>"
echo ""
