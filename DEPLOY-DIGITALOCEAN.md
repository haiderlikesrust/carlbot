# 🚀 Deploy to DigitalOcean - Complete Guide

DigitalOcean is an excellent choice for deploying your app. It offers both managed App Platform (easier) and Droplets (more control).

## Option 1: DigitalOcean App Platform (Recommended)

### Prerequisites
- DigitalOcean account ([Sign up here](https://m.do.co/c/your-referral))
- GitHub repository with your code

### Step-by-Step

1. **Create New App**
   - Log into [DigitalOcean](https://cloud.digitalocean.com)
   - Click "Create" → "Apps"
   - Select "GitHub" as source
   - Choose your repository

2. **Configure App**
   - **Name**: Your app name
   - **Region**: Choose closest to your users
   - **Branch**: `main` or `master`

3. **Configure Build Settings**
   - DigitalOcean will auto-detect Node.js
   - **Build Command**: 
     ```bash
     cd client && npm install && npm run build
     ```
   - **Run Command**: 
     ```bash
     npm start
     ```
   - **Source Directory**: `/` (root)

4. **Add Environment Variables**
   - Go to "Environment Variables" section
   - Add each variable:
     ```
     NODE_ENV=production
     CLIENT_URL=https://your-app-name.ondigitalocean.app
     JWT_SECRET=generate-a-random-secret-here
     SESSION_SECRET=generate-another-random-secret-here
     OPENAI_API_KEY=your_openai_key
     ELEVENLABS_API_KEY=your_elevenlabs_key
     ELEVENLABS_VOICE_ID=your_voice_id
     PORT=3000
     ```

5. **Configure Database (Optional but Recommended)**
   - Click "Add Resource" → "Database"
   - Choose PostgreSQL (recommended) or MySQL
   - Select plan (Basic $15/mo minimum)
   - Note: You'll need to update your database connection code

6. **Review and Deploy**
   - Review all settings
   - Click "Create Resources"
   - DigitalOcean will build and deploy
   - Wait 5-10 minutes for first deployment

7. **Custom Domain (Optional)**
   - Go to Settings → Domains
   - Add your domain
   - Update DNS records as instructed
   - SSL certificate is automatic

### Pricing
- **App Platform**: Starts at $5/month (Basic plan)
- **Database**: Starts at $15/month (PostgreSQL)
- **Total**: ~$20/month for a small production app

## Option 2: DigitalOcean Droplet (VPS - Advanced)

For maximum control and lower cost.

### Step 1: Create Droplet

1. Go to DigitalOcean → Create → Droplets
2. Choose:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic, $6/month (1GB RAM) minimum
   - **Region**: Closest to users
   - **Authentication**: SSH keys (recommended)

### Step 2: Initial Server Setup

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install Nginx
apt install nginx -y

# Install Git
apt install git -y
```

### Step 3: Deploy Your App

```bash
# Clone your repository
cd /var/www
git clone https://github.com/your-username/your-repo.git
cd your-repo

# Install dependencies
npm install
cd client
npm install
npm run build
cd ..

# Create .env file
nano .env
# Paste all your environment variables
# Save with Ctrl+X, then Y, then Enter

# Start with PM2
pm2 start server.js --name "carl-app"
pm2 save
pm2 startup
# Follow the instructions it gives you
```

### Step 4: Configure Nginx

```bash
# Edit Nginx config
nano /etc/nginx/sites-available/default
```

Replace the content with:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Increase body size for file uploads
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Test and restart Nginx
nginx -t
systemctl restart nginx
```

### Step 5: Setup SSL (Let's Encrypt)

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is set up automatically
```

### Step 6: Firewall Setup

```bash
# Allow SSH, HTTP, and HTTPS
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### Step 7: Database Setup (Optional)

For SQLite (default):
```bash
# Create database directory
mkdir -p /var/www/your-repo/database
chmod 755 /var/www/your-repo/database
```

For PostgreSQL:
```bash
# Install PostgreSQL
apt install postgresql postgresql-contrib -y

# Create database and user
sudo -u postgres psql
CREATE DATABASE carlapp;
CREATE USER carluser WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE carlapp TO carluser;
\q
```

## Monitoring & Maintenance

### PM2 Commands

```bash
# View logs
pm2 logs carl-app

# Restart app
pm2 restart carl-app

# Stop app
pm2 stop carl-app

# View status
pm2 status

# Monitor
pm2 monit
```

### Backup Database

```bash
# For SQLite
cp /var/www/your-repo/database/app.db /var/backups/app-$(date +%Y%m%d).db

# For PostgreSQL
pg_dump -U carluser carlapp > /var/backups/carlapp-$(date +%Y%m%d).sql
```

### Auto-backup Script

Create `/root/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups"
DATE=$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backup SQLite
cp /var/www/your-repo/database/app.db $BACKUP_DIR/app-$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "app-*.db" -mtime +7 -delete
```

Make it executable and add to crontab:
```bash
chmod +x /root/backup.sh
crontab -e
# Add: 0 2 * * * /root/backup.sh
```

## Troubleshooting

### App Not Starting
```bash
pm2 logs carl-app
# Check for errors
```

### Nginx 502 Error
- Check if app is running: `pm2 status`
- Check app logs: `pm2 logs carl-app`
- Check Nginx error log: `tail -f /var/log/nginx/error.log`

### Out of Memory
- Upgrade droplet size
- Or add swap space:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Cost Comparison

| Option | Monthly Cost | Best For |
|--------|-------------|----------|
| App Platform | $5-12 | Quick deployment, managed |
| Droplet (1GB) | $6 | Full control, learning |
| Droplet (2GB) | $12 | Small production |
| Droplet (4GB) | $24 | Medium production |

## Why DigitalOcean?

✅ **Reliability**: 99.99% uptime SLA  
✅ **Performance**: Fast SSD storage  
✅ **Scalability**: Easy to upgrade  
✅ **Support**: Great documentation and community  
✅ **Pricing**: Transparent, predictable costs  
✅ **Global**: Multiple data centers  

## Next Steps

1. Set up monitoring (UptimeRobot, Pingdom)
2. Configure automated backups
3. Set up error tracking (Sentry)
4. Enable CDN for static assets (Cloudflare)
5. Set up staging environment

---

**Ready to deploy?** Start with App Platform for easiest setup, or Droplet for more control!
