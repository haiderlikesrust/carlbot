# 🚀 Deployment Guide

This guide will help you deploy your Carl Gaming Companion app to production.

## Prerequisites

- Node.js 18+ installed
- A hosting provider account (Railway, Render, Heroku, Vercel, etc.)
- Domain name (optional but recommended)

## Quick Deploy Options

### Option 1: Railway (Recommended - Easiest)

1. **Sign up at [Railway.app](https://railway.app)**

2. **Create a New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or upload your code)

3. **Configure Environment Variables**
   - Go to your project → Variables
   - Add all variables from `.env.example`:
     ```
     PORT=3000
     NODE_ENV=production
     CLIENT_URL=https://your-app-name.railway.app
     JWT_SECRET=your-super-secret-jwt-key
     SESSION_SECRET=your-session-secret
     OPENAI_API_KEY=your_openai_api_key
     ELEVENLABS_API_KEY=your_elevenlabs_api_key
     ELEVENLABS_VOICE_ID=your_voice_id
     ```

4. **Deploy**
   - Railway will automatically detect your `package.json`
   - It will run `npm install` and `npm start`
   - Your app will be live at `https://your-app-name.railway.app`

5. **Build Frontend**
   - Railway will run `heroku-postbuild` script automatically
   - This builds your React app and serves it from the Express server

### Option 2: Render

1. **Sign up at [Render.com](https://render.com)**

2. **Create a New Web Service**
   - Connect your GitHub repository
   - Select "Node" as the environment

3. **Configure Build Settings**
   - Build Command: `npm install && cd client && npm install && npm run build`
   - Start Command: `npm start`

4. **Add Environment Variables**
   - Go to Environment → Add Environment Variable
   - Add all variables from `.env.example`

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy your app

### Option 3: DigitalOcean App Platform (Recommended for Full Control)

1. **Sign up at [DigitalOcean.com](https://www.digitalocean.com)**

2. **Create a New App**
   - Go to Apps → Create App
   - Connect your GitHub repository
   - DigitalOcean will auto-detect your Node.js app

3. **Configure App Settings**
   - **Build Command**: `cd client && npm install && npm run build`
   - **Run Command**: `npm start`
   - **Environment**: Node.js
   - **Buildpack**: Auto-detect or Node.js

4. **Add Environment Variables**
   - Go to Settings → App-Level Environment Variables
   - Add all variables from `.env.example`:
     ```
     NODE_ENV=production
     CLIENT_URL=https://your-app-name.ondigitalocean.app
     JWT_SECRET=your-super-secret-jwt-key
     SESSION_SECRET=your-session-secret
     OPENAI_API_KEY=your_openai_api_key
     ELEVENLABS_API_KEY=your_elevenlabs_api_key
     ELEVENLABS_VOICE_ID=your_voice_id
     ```

5. **Configure Database (Optional)**
   - Add a Managed Database (PostgreSQL recommended for production)
   - Or use SQLite (included, but less robust for production)

6. **Deploy**
   - Click "Create Resources"
   - DigitalOcean will build and deploy your app
   - Your app will be live at `https://your-app-name.ondigitalocean.app`

**Benefits of DigitalOcean:**
- ✅ Full control over your infrastructure
- ✅ Easy scaling
- ✅ Managed databases available
- ✅ Custom domains with free SSL
- ✅ Great for production apps
- ✅ Predictable pricing

### Option 4: DigitalOcean Droplet (VPS - Advanced)

For maximum control, deploy to a DigitalOcean Droplet:

1. **Create a Droplet**
   - Choose Ubuntu 22.04 LTS
   - Select size (1GB RAM minimum for small apps)
   - Add your SSH key

2. **SSH into your Droplet**
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Install Node.js and PM2**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

4. **Clone and Setup Your App**
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   npm install
   cd client && npm install && npm run build && cd ..
   ```

5. **Create .env file**
   ```bash
   nano .env
   # Add all your environment variables
   ```

6. **Start with PM2**
   ```bash
   pm2 start server.js --name "carl-app"
   pm2 save
   pm2 startup
   ```

7. **Setup Nginx (Reverse Proxy)**
   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/default
   ```
   
   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

8. **Setup SSL with Let's Encrypt**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

### Option 5: Vercel (Frontend) + Railway/Render (Backend)

**For Backend (Railway/Render):**
- Follow Option 1 or 2 above
- Set `CLIENT_URL` to your Vercel frontend URL

**For Frontend (Vercel):**
1. Sign up at [Vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set root directory to `client`
4. Add environment variables:
   ```
   VITE_API_URL=https://your-backend-url.com/api
   VITE_SOCKET_URL=https://your-backend-url.com
   ```
5. Deploy

### Option 6: Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login and Create App**
   ```bash
   heroku login
   heroku create your-app-name
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set CLIENT_URL=https://your-app-name.herokuapp.com
   heroku config:set JWT_SECRET=your-secret-key
   heroku config:set OPENAI_API_KEY=your-key
   # ... add all other variables
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

## Environment Variables

Make sure to set these in your hosting provider:

### Required
- `PORT` - Server port (usually auto-set by hosting provider)
- `NODE_ENV=production`
- `CLIENT_URL` - Your app's public URL
- `JWT_SECRET` - Random secret string for JWT tokens
- `SESSION_SECRET` - Random secret string for sessions
- `OPENAI_API_KEY` - Your OpenAI API key
- `ELEVENLABS_API_KEY` - Your Eleven Labs API key
- `ELEVENLABS_VOICE_ID` - Your Eleven Labs voice ID

### Optional
- `BIRDEYE_API_KEY` - For token data features
- `DATABASE_PATH` - SQLite database path (default: `./database/app.db`)

## Database Setup

The app uses SQLite by default. For production, consider:

1. **SQLite (Simple)**
   - Works for small to medium apps
   - Database file is stored in `./database/app.db`
   - Make sure to backup regularly

2. **PostgreSQL (Recommended for Production)**
   - More robust for production
   - You'll need to update database connection code
   - Most hosting providers offer PostgreSQL add-ons

## Building for Production

### Local Build Test

1. **Build the frontend:**
   ```bash
   cd client
   npm run build
   cd ..
   ```

2. **Test production build:**
   ```bash
   NODE_ENV=production npm start
   ```

3. **Visit:** `http://localhost:3000`

### Production Checklist

- [ ] All environment variables set
- [ ] Frontend built (`npm run build` in client folder)
- [ ] Database migrations run (automatic on startup)
- [ ] CORS configured correctly
- [ ] HTTPS enabled (most providers do this automatically)
- [ ] Rate limiting configured
- [ ] Error logging set up
- [ ] Database backups configured

## Custom Domain Setup

1. **Get a domain** from a registrar (Namecheap, GoDaddy, etc.)

2. **Add DNS Records:**
   - Add a CNAME record pointing to your hosting provider's URL
   - Example: `www` → `your-app.railway.app`

3. **Update Environment Variables:**
   - Set `CLIENT_URL` to your custom domain
   - Example: `CLIENT_URL=https://yourdomain.com`

4. **Configure SSL:**
   - Most providers auto-configure SSL certificates
   - Railway, Render, and Vercel all provide free SSL

## Troubleshooting

### Build Fails
- Check Node.js version (needs 18+)
- Ensure all dependencies are in `package.json`
- Check build logs for specific errors

### API Not Working
- Verify `CLIENT_URL` matches your frontend URL
- Check CORS settings in `server.js`
- Ensure environment variables are set correctly

### Database Issues
- Ensure database directory is writable
- Check database file permissions
- Verify migrations ran successfully

### Socket.io Not Connecting
- Check `SOCKET_URL` environment variable
- Verify CORS settings for Socket.io
- Ensure WebSocket support on your hosting provider

## Monitoring & Maintenance

1. **Set up error tracking:**
   - Consider adding Sentry or similar service
   - Monitor logs in your hosting dashboard

2. **Database backups:**
   - Set up automated backups
   - Test restore procedures

3. **Performance monitoring:**
   - Use hosting provider's analytics
   - Monitor API response times
   - Track error rates

## Support

If you encounter issues:
1. Check hosting provider logs
2. Verify all environment variables
3. Test locally with production build
4. Check GitHub issues for known problems

---

**Ready to deploy?** Choose a hosting provider above and follow the steps!
