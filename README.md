# 🎮 Carl - Gaming Companion

An intelligent AI gaming companion, powered by ChatGPT and Eleven Labs text-to-speech.

## Features

- 💬 **Intelligent Conversations**: Powered by OpenAI's GPT-5/GPT-4 for gaming discussions
- 🔊 **Voice Responses**: Text-to-speech using Eleven Labs API
- ⚔️ **Build Analyzer**: Analyze gaming builds, items, and strategies
- 📸 **Screenshot Analysis**: Upload gaming screenshots for AI-powered analysis
- 🎯 **Quick Actions**: One-click access to common queries (Build Analysis, Meta Check, Strategy Help, Tips)
- ⌨️ **Command Shortcuts**: Use `/build`, `/meta`, `/tips` for quick actions
- 🤖 **3D Interactive Mascot**: Carl mascot that reacts to interactions
- 🎨 **Retro UI**: Matte black cyberpunk aesthetic
- 🛡️ **Spam Protection**: Rate limiting and message validation
- 💡 **Real-time Chat**: Interactive conversation experience

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key
- Eleven Labs API key

## Setup

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   BIRDEYE_API_KEY=your_birdeye_api_key_here (optional - for token data)
   ```

4. **Get API Keys**
   
   - **OpenAI API Key**: Get it from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Eleven Labs API Key**: Get it from [https://elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys)

5. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

6. **Start the development servers**
   
   **Option 1: Run both servers separately (recommended for development)**
   ```bash
   # Terminal 1 - Backend server
   npm run dev
   
   # Terminal 2 - Frontend dev server
   cd client
   npm run dev
   ```
   
   **Option 2: Run both with concurrently**
   ```bash
   npm run dev:all
   ```

7. **Open your browser**
   
   Navigate to `http://localhost:5173` (React dev server)
   - Backend API runs on `http://localhost:3000`
   - Frontend automatically proxies API requests

## Usage

### Basic Chat
1. Type your question about games, builds, or strategies in the input field
2. Press Enter or click the send button
3. Carl will respond with tactical gaming analysis
4. Voice responses will automatically play (can be toggled off)

### Quick Actions
- Click **Build Analysis** button to analyze a gaming build
- Click **Meta Check** to see current game meta
- Click **Strategy** for strategy help
- Click **Tips** for pro gaming tips

### Command Shortcuts
- `/build [description]` - Quick build analysis
- `/meta [game_name]` - Check current meta for a game
- `/tips [game_name]` - Get pro tips for a game

### Build Analysis
- Use the "Build Analysis" quick action button
- Describe your build (items, abilities, stats, etc.)
- Optionally specify the game name
- Carl will analyze the build and give tactical feedback

### Screenshot Analysis
- Click the image upload button (📷) next to the input
- Upload a gaming screenshot (build screen, gameplay, stats, etc.)
- Carl will analyze the image and give tactical insights

## Customization

### Change the AI Voice

Edit the `ELEVENLABS_VOICE_ID` in your `.env` file. You can find available voices in your Eleven Labs dashboard.

### Modify the System Prompt

Edit the `SYSTEM_PROMPT` constant in `server.js` to change the AI's personality and expertise.

### Change the Port

Set the `PORT` environment variable in your `.env` file.

## Project Structure

```
carl-gaming-companion/
├── server.js              # Express server with API endpoints
├── package.json            # Backend dependencies and scripts
├── .env                    # Environment variables (create from .env.example)
├── client/                 # React frontend application
│   ├── src/
│   │   ├── App.jsx        # Main React app component
│   │   ├── App.css        # Main styles
│   │   ├── main.jsx       # React entry point
│   │   ├── index.css      # Global styles
│   │   └── components/    # React components
│   │       ├── Chat.jsx
│   │       ├── Mascot.jsx
│   │       ├── Message.jsx
│   │       ├── MessageList.jsx
│   │       ├── QuickActions.jsx
│   │       └── InputArea.jsx
│   ├── package.json        # Frontend dependencies
│   ├── vite.config.js      # Vite configuration
│   └── index.html          # HTML template
├── public/                 # Legacy static files (kept for reference)
└── README.md               # This file
```

## API Endpoints

- `POST /api/chat` - Send a message and get AI response
- `POST /api/tts` - Convert text to speech using Eleven Labs
- `POST /api/analyze-build` - Analyze a gaming build
- `POST /api/analyze-image` - Analyze a gaming screenshot (multipart/form-data)

## Technologies Used

- **Backend**: Node.js, Express
- **AI**: OpenAI GPT-5/GPT-4o (with Vision API for screenshot analysis)
- **TTS**: Eleven Labs API
- **Frontend**: React 18, Vite, Three.js (3D mascot)
- **File Upload**: Multer

## License

MIT

## Notes

- Make sure to keep your API keys secure and never commit them to version control
- The `.env` file is already in `.gitignore`
- Voice responses require an active Eleven Labs subscription
- OpenAI API usage is billed per token, so monitor your usage

