AI FIX — replace only server.js and ai-client.js

1. Upload/replace these two files in your GitHub repository.
2. In Render confirm the service type is WEB SERVICE, not Static Site.
3. Build command: npm run build
4. Start command: npm start
5. Environment must contain GEMINI_API_KEY.
6. Redeploy.

Then test:
https://YOUR-SITE.onrender.com/health

It should show JSON similar to:
{"ok":true,"gemini_key":true,"model":"gemini-2.5-flash-lite"}

If gemini_key is false, the key is not set on the Web Service.

Voice:
On iPhone, Safari will ask for microphone permission. Allow it.
If permission was previously blocked: iPhone Settings > Apps > Safari > Microphone (or website settings) > Allow.
