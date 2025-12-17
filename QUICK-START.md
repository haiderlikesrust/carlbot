# 🚀 Quick Start - Deploy Your App

## Step 1: Build the Frontend

```bash
cd client
npm install
npm run build
cd ..
```

## Step 2: Set Environment Variables

Create a `.env` file in the root directory:

```bash
NODE_ENV=production
CLIENT_URL=https://your-app-url.com
JWT_SECRET=your-random-secret-key-here
SESSION_SECRET=your-random-session-secret-here
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id
```

## Step 3: Test Locally

```bash
NODE_ENV=production npm start
```

Visit `http://localhost:3000` to test.

## Step 4: Deploy

### Option A: Railway (Easiest)

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Add environment variables
4. Deploy!

### Option C: Render

1. Go to [render.com](https://render.com)
2. New Web Service
3. Build: `npm install && cd client && npm install && npm run build`
4. Start: `npm start`
5. Add environment variables
6. Deploy!

### Option D: Vercel + Railway

- **Backend**: Deploy to Railway (follow Option A)
- **Frontend**: Deploy to Vercel
  - Root: `client`
  - Build: `npm run build`
  - Output: `dist`
  - Env: `VITE_API_URL=https://your-backend.railway.app/api`

## That's It! 🎉

Your app should now be live. For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
