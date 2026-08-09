# deploy-audit-widget.ps1
# One-command deployment for Artum 8 Labs Audit Widget to Vercel

Write-Host "Artum 8 Labs - Audit Widget Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js found: $(node --version)"

$vercel = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercel) {
    Write-Host "Vercel CLI not found." -ForegroundColor Yellow
    Write-Host "Install with: npm install -g vercel" -ForegroundColor Yellow
    Write-Host "Then run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "Vercel CLI found: $(vercel --version)"

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --silent
Write-Host "Dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "Checking environment..." -ForegroundColor Yellow
if (-not (Test-Path .env)) {
    Write-Host "No .env found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
}

Write-Host ""
Write-Host "Deploying to Vercel..." -ForegroundColor Yellow
Write-Host "If prompted, select 'Create New Project'" -ForegroundColor Gray
Write-Host ""

vercel --prod --confirm

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to Vercel dashboard and open your new project" -ForegroundColor White
Write-Host "2. Settings -> Domains" -ForegroundColor White
Write-Host "3. Add custom domain: audit.artum8labs.com" -ForegroundColor White
Write-Host "4. Vercel will show DNS records. Add them at Namecheap:" -ForegroundColor White
Write-Host "   namecheap.com -> Domain List -> Manage artum8labs.com -> Advanced DNS" -ForegroundColor Gray
Write-Host "5. Wait 5-10 minutes for DNS propagation" -ForegroundColor White
Write-Host "6. Test with curl or browser" -ForegroundColor White
Write-Host ""
Write-Host "Embed code for your main site:" -ForegroundColor Cyan
Write-Host "  window.Artum8LabsAuditSettings = { apiUrl: 'https://audit.artum8labs.com/api/audit' };" -ForegroundColor Gray
Write-Host "  script src='https://audit.artum8labs.com/widget.js'" -ForegroundColor Gray
Write-Host ""
