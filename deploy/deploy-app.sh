#!/bin/bash
###############################################################################
# LUNAO SaaS — Application Deployment Script
###############################################################################
set -euo pipefail

APP_DIR="/var/www/lunao"
cd "$APP_DIR"

echo "============================================"
echo "  LUNAO APP DEPLOYMENT (AMAZON LINUX 2023)"
echo "============================================"

# ─── 1. INSTALL DEPENDENCIES ────────────────────────────────────────────────
echo ""
echo ">>> [1/5] Installing Node dependencies..."
npm install --legacy-peer-deps
echo "    ✅ Dependencies installed."

# ─── 2. BUILD FRONTEND ──────────────────────────────────────────────────────
echo ""
echo ">>> [2/5] Building React frontend (Vite)..."
NODE_OPTIONS="--max-old-space-size=1536" npx vite build
echo "    ✅ Frontend built to ./dist/"

# ─── 3. BUILD OWNER PWA ─────────────────────────────────────────────────────
echo ""
echo ">>> [3/5] Building Owner PWA..."
if [ -d "lunaoownerpwa" ]; then
  cd lunaoownerpwa
  npm install --legacy-peer-deps
  NODE_OPTIONS="--max-old-space-size=1536" npx vite build
  cd "$APP_DIR"
  echo "    ✅ Owner PWA built."
fi

# ─── 4. VERIFY .ENV ─────────────────────────────────────────────────────────
echo ""
echo ">>> [4/5] Checking environment configuration..."
if [ ! -f "$APP_DIR/.env" ]; then
  echo "    Creating .env from template..."
  cp "$APP_DIR/deploy/production.env.template" "$APP_DIR/.env"
fi

# ─── 5. START WITH PM2 ──────────────────────────────────────────────────────
echo ""
echo ">>> [5/5] Launching backend with PM2..."
mkdir -p "$APP_DIR/logs"

# Ensure global tsx is installed or available
npm install -g tsx || true

pm2 start "$APP_DIR/deploy/ecosystem.config.cjs" || pm2 reload "$APP_DIR/deploy/ecosystem.config.cjs"
pm2 save

echo ""
echo "============================================"
echo "  ✅ LUNAO BACKEND RUNNING ON PORT 8787!"
echo "============================================"
pm2 status
