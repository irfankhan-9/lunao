#!/bin/bash
###############################################################################
# LUNAO SaaS — Production EC2 System Setup Script (AL2023 / Ubuntu compatible)
###############################################################################
set -euo pipefail

echo "============================================"
echo "  LUNAO EC2 PRODUCTION SETUP"
echo "============================================"

# ─── 1. SWAP (2GB) ──────────────────────────────────────────────────────────
echo ""
echo ">>> [1/7] Setting up 2GB swap..."
if [ -f /swapfile ] || swapon --show | grep -q "/swapfile"; then
  echo "    Swap already exists, skipping."
else
  dd if=/dev/zero of=/swapfile bs=128M count=16 status=progress
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  echo "    ✅ 2GB swap created and enabled."
fi
echo "    Current memory status:"
free -h

# ─── 2. SYSTEM PACKAGES (Node 22, Git, Nginx) ────────────────────────────────
echo ""
echo ">>> [2/7] Installing Node.js 22, Nginx, Git, build tools..."
if command -v dnf &>/dev/null; then
  # Amazon Linux 2023 / Fedora
  dnf install -y nodejs22 nodejs22-npm nginx git tar gzip openssl certbot python3-certbot-nginx || true
elif command -v apt-get &>/dev/null; then
  # Ubuntu / Debian
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs nginx git tar gzip openssl certbot python3-certbot-nginx
fi

echo "    Node version: $(node -v)"
echo "    NPM version:  $(npm -v)"

# ─── 3. PM2 ──────────────────────────────────────────────────────────────────
echo ""
echo ">>> [3/7] Installing PM2 process manager globally..."
npm install -g pm2
# Detect user (ec2-user or ubuntu)
TARGET_USER=$(id -un 1000 2>/dev/null || echo "ec2-user")
pm2 startup systemd -u "$TARGET_USER" --hp "/home/$TARGET_USER" || true
echo "    ✅ PM2 installed."

# ─── 4. NGINX CONFIGURATION ──────────────────────────────────────────────────
echo ""
echo ">>> [4/7] Ensuring Nginx is running and enabled..."
systemctl enable nginx
systemctl restart nginx
echo "    ✅ Nginx service running."

# ─── 5. APP DIRECTORY ───────────────────────────────────────────────────────
echo ""
echo ">>> [5/7] Preparing /var/www/lunao..."
mkdir -p /var/www/lunao
chown -R "$TARGET_USER:$TARGET_USER" /var/www/lunao
mkdir -p /var/www/lunao/logs
chown -R "$TARGET_USER:$TARGET_USER" /var/www/lunao/logs
echo "    ✅ Directory /var/www/lunao created with permissions for $TARGET_USER."

echo ""
echo "============================================"
echo "  ✅ BASE SYSTEM SETUP COMPLETE!"
echo "============================================"
