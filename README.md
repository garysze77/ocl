# IVS Realtime Web Player

Full-screen Web Player for Amazon IVS Realtime with auto token generation.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure AWS credentials:**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   ```
   http://localhost:3000
   ```

## Usage

1. Enter your IVS Stage ARN (pre-filled with your ARN)
2. Click "START PLAYING"
3. The player will:
   - Automatically generate a new token via the backend
   - Enter fullscreen mode
   - Connect and play the WebRTC stream

## Project Structure

```
├── server.js          # Express server with token API
├── public/
│   └── index.html     # Full-screen Web Player
├── .env               # AWS credentials (not committed)
├── .env.example       # Template for credentials
└── package.json       # Dependencies
```

## Notes

- Token is valid for 1 hour
- Each time you start, a new token is generated
- Pure JavaScript (no IVS SDK required)
