GEMINI LIVE SDK CONNECTION FIX

Replace:
- server.js
- ai-client.js
- package.json

Why this version is different:
- Uses Google's current @google/genai Live SDK in the browser instead of hand-building the WebSocket protocol.
- Uses a constrained short-lived Gemini token generated on your Render server.
- No ws npm dependency.
- Adds a 10-second connection diagnostic instead of sitting on 'Connecting...' forever.
- Keeps the map visible and continuous one-tap voice session.
- Keeps map tools: layers, 3D, place search, navigation, locate, zoom.

Render:
Build command: npm run build
Start command: npm start

Keep GEMINI_API_KEY unchanged.
Then Manual Deploy -> Clear build cache & deploy.
