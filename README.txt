GEMINI 3.8 LIVE — ONE TAP CONTINUOUS VOICE

Replace BOTH:
- server.js
- ai-client.js

Do NOT change your existing environment variables.
Keep GEMINI_API_KEY.
GEMINI_MODEL can stay as gemini-3.5-flash-lite; Gemini Live uses gemini-3.8-live separately.

New behavior:
- Tap Ask AI ONCE.
- The map stays visible.
- Gemini Live keeps the microphone session open.
- You speak naturally.
- Gemini replies with native Gemini audio, not Safari robot speech.
- After Gemini finishes, it automatically listens again.
- You can continue the conversation without tapping Ask AI again.
- Press Stop or X only when you want to end the live session.
- Live function calls can control map layers, 3D mode, search, navigation, locate and zoom.

Security:
- The permanent GEMINI_API_KEY remains only on Render.
- server.js creates a short-lived Gemini Live token for the browser.

After replacing both files, redeploy your Render Web Service.
