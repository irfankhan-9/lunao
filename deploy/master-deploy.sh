#!/bin/bash
###############################################################################
# LUNAO SaaS — Master Deployment Script (run from LOCAL machine)
# 
# This script:
#   1. Transfers codebase to EC2 via SCP
#   2. Runs setup-ec2.sh to install Node.js 22, PM2, Nginx, swap
#   3. Installs dependencies, builds, and starts with PM2
#   4. Configures Nginx reverse proxy
#
# Usage:
#   bash deploy/master-deploy.sh
###############################################################################
set -euo pipefail

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
EC2_IP="51.21.181.63"
EC2_USER="ubuntu"
SSH_KEY="$HOME/.ssh/lunao-backend-key.pem"
REMOTE_DIR="/var/www/lunao"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=30"

echo "============================================"
echo "  LUNAO MASTER DEPLOYMENT"
echo "  Local:  $LOCAL_DIR"
echo "  Remote: $EC2_USER@$EC2_IP:$REMOTE_DIR"
echo "============================================"

# ─── PREFLIGHT CHECK ────────────────────────────────────────────────────────
echo ""
echo ">>> Checking SSH connectivity..."
ssh $SSH_OPTS $EC2_USER@$EC2_IP "echo 'SSH OK ✅'" || {
  echo "❌ Cannot connect to EC2. Check:"
  echo "   - EC2 Security Group allows inbound SSH (port 22) from your IP"
  echo "   - Instance is running"
  echo "   - Key file is correct"
  exit 1
}

# ─── STEP 1: SYSTEM SETUP ───────────────────────────────────────────────────
echo ""
echo ">>> [Step 1] Running system setup on EC2..."
scp $SSH_OPTS "$LOCAL_DIR/deploy/setup-ec2.sh" $EC2_USER@$EC2_IP:/tmp/setup-ec2.sh
ssh $SSH_OPTS $EC2_USER@$EC2_IP "chmod +x /tmp/setup-ec2.sh && sudo /tmp/setup-ec2.sh"

# ─── STEP 2: TRANSFER CODEBASE ──────────────────────────────────────────────
echo ""
echo ">>> [Step 2] Transferring codebase to EC2..."

# Create rsync exclude list
cat > /tmp/lunao-exclude.txt << 'EXCLUDES'
node_modules/
.git/
dist/
.gmp_cache/
backups/
*.log
.env
.env.local
lunaoownerpwa/node_modules/
lunaoownerpwa/dist/
EXCLUDES

# Use rsync if available, otherwise fall back to scp
if command -v rsync &>/dev/null; then
  rsync -avz --progress \
    --exclude-from=/tmp/lunao-exclude.txt \
    -e "ssh $SSH_OPTS" \
    "$LOCAL_DIR/" "$EC2_USER@$EC2_IP:$REMOTE_DIR/"
else
  echo "    rsync not found, using scp (slower)..."
  # Create a tar, transfer, extract
  cd "$LOCAL_DIR"
  tar czf /tmp/lunao-deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='.gmp_cache' \
    --exclude='backups' \
    --exclude='.env' \
    --exclude='.env.local' \
    .
  scp $SSH_OPTS /tmp/lunao-deploy.tar.gz $EC2_USER@$EC2_IP:/tmp/
  ssh $SSH_OPTS $EC2_USER@$EC2_IP "cd $REMOTE_DIR && tar xzf /tmp/lunao-deploy.tar.gz && rm /tmp/lunao-deploy.tar.gz"
fi

echo "    ✅ Codebase transferred."

# ─── STEP 3: TRANSFER DEPLOY CONFIGS ────────────────────────────────────────
echo ""
echo ">>> [Step 3] Transferring deployment configs..."
scp $SSH_OPTS "$LOCAL_DIR/deploy/ecosystem.config.cjs" $EC2_USER@$EC2_IP:$REMOTE_DIR/ecosystem.config.cjs
scp $SSH_OPTS "$LOCAL_DIR/deploy/nginx-lunao.conf" $EC2_USER@$EC2_IP:/tmp/nginx-lunao.conf
scp $SSH_OPTS "$LOCAL_DIR/deploy/deploy-app.sh" $EC2_USER@$EC2_IP:$REMOTE_DIR/deploy-app.sh

# ─── STEP 4: SETUP .ENV ─────────────────────────────────────────────────────
echo ""
echo ">>> [Step 4] Setting up production .env..."
ssh $SSH_OPTS $EC2_USER@$EC2_IP "
  if [ ! -f $REMOTE_DIR/.env ]; then
    cp $REMOTE_DIR/deploy/production.env.template $REMOTE_DIR/.env
    echo '    ⚠️  .env created from template — YOU MUST EDIT IT with real credentials!'
  else
    echo '    ✅ .env already exists, keeping existing.'
  fi
"

# ─── STEP 5: INSTALL & BUILD ────────────────────────────────────────────────
echo ""
echo ">>> [Step 5] Installing dependencies and building..."
ssh $SSH_OPTS $EC2_USER@$EC2_IP "
  cd $REMOTE_DIR
  chmod +x deploy-app.sh
  ./deploy-app.sh
"

# ─── STEP 6: CONFIGURE NGINX ────────────────────────────────────────────────
echo ""
echo ">>> [Step 6] Configuring Nginx reverse proxy..."
ssh $SSH_OPTS $EC2_USER@$EC2_IP "
  sudo cp /tmp/nginx-lunao.conf /etc/nginx/sites-available/lunao
  sudo ln -sf /etc/nginx/sites-available/lunao /etc/nginx/sites-enabled/lunao
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx
  echo '    ✅ Nginx configured and reloaded.'
"

# ─── STEP 7: SSL CERTIFICATE ────────────────────────────────────────────────
echo ""
echo ">>> [Step 7] SSL Certificate..."
echo "    Run this MANUALLY after DNS is pointed to $EC2_IP:"
echo ""
echo "    sudo certbot --nginx -d api.lunao.app --non-interactive --agree-tos -m your-email@lunao.app"
echo ""

# ─── DONE ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  🎉 DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "  Backend: http://$EC2_IP:8787/api/health"
echo "  Nginx:   http://$EC2_IP/"
echo ""
echo "  Next steps:"
echo "  1. Point api.lunao.app DNS A record → $EC2_IP"
echo "  2. Edit /var/www/lunao/.env with real Supabase credentials"
echo "  3. Run: sudo certbot --nginx -d api.lunao.app"
echo "  4. Run: pm2 restart lunao-backend"
echo ""
