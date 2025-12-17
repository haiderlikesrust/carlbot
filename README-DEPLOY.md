# 🚀 Quick Deploy Guide

## Pre-Deployment Checklist

1. ✅ Build the frontend: `cd client && npm run build`
2. ✅ Set all environment variables (see `.env.example`)
3. ✅ Test locally with `NODE_ENV=production npm start`

## One-Click Deploy

### DigitalOcean App Platform (Recommended)

[![Deploy on DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new)

1. Click the button above or go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Create App → Connect GitHub
3. Auto-detects Node.js
4. Build: `cd client && npm install && npm run build`
5. Start: `npm start`
6. Add environment variables
7. Deploy! 🎉

**Why DigitalOcean?**
- ✅ Full control over infrastructure
- ✅ Easy scaling and monitoring
- ✅ Managed databases available
- ✅ Custom domains with free SSL
- ✅ Great for production apps
- ✅ Predictable, transparent pricing

### Railway (Easiest)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Click the button above or go to [railway.app](https://railway.app)
2. Connect your GitHub repo
3. Add environment variables from `.env.example`
4. Deploy! 🎉

### Render

1. Go to [render.com](https://render.com)
2. Create New → Web Service
3. Connect your repo
4. Build: `npm install && cd client && npm install && npm run build`
5. Start: `npm start`
6. Add environment variables
7. Deploy!

## Environment Variables

**Required:**
- `NODE_ENV=production`
- `CLIENT_URL` - Your app URL
- `JWT_SECRET` - Random secret
- `SESSION_SECRET` - Random secret
- `OPENAI_API_KEY` - Your OpenAI key
- `ELEVENLABS_API_KEY` - Your Eleven Labs key

See `.env.example` for full list.

## After Deployment

1. Visit your app URL
2. Create an admin account
3. Test all features
4. Set up database backups

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
