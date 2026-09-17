GEMINI LIVE RELAY FIX

The previous error was caused while creating the temporary Live token.
This version removes that token step entirely.

Replace:
- server.js
- ai-client.js
- package.json

Render:
Build Command: npm run build
Start Command: npm start

Keep the same environment variables including GEMINI_API_KEY.
Then redeploy.

The browser connects to /live on YOUR Render server.
Your server privately connects to Gemini 3.8 Live using GEMINI_API_KEY.
The permanent key is never sent to the browser.

Tap Ask AI once. The session remains listening until Stop/X.
