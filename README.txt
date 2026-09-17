FINAL GEMINI LIVE FIX

Replace:
- server.js
- ai-client.js
- package.json

This version removes the 'ws' npm dependency completely.
It uses Google's documented short-lived ephemeral Live token.
No npm packages are required.

Render:
Build Command: npm run build
Start Command: npm start

Keep GEMINI_API_KEY exactly as it is.
Then use Manual Deploy -> Clear build cache & deploy.

Health test:
https://YOUR-WEB-SERVICE.onrender.com/health

Expected:
"ok": true
"gemini_key": true
"live_model": "gemini-3.8-live"
"live_auth": "ephemeral-token"
