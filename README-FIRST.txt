ONE-PART VERSION — ONLY ONE RENDER SERVICE

This changes your project from a Render Static Site into ONE Render Web Service.
The same service:
- serves your map website
- keeps GEMINI_API_KEY private
- answers /ai requests
- keeps TomTom + AirLabs working

FILES IN THIS ZIP
Replace:
- index.html
- build.js

Add:
- ai-client.js
- server.js
- package.json

KEEP all your existing working files:
- app.js
- style.css
- map-theme.js
- traffic-live.js
- navigation.js
- navigation.css
- luxury-ui.js
- flights-live.js

RENDER SETTINGS
Create ONE Web Service from the same repo:
Build Command:
npm run build

Start Command:
npm start

Environment variables on this ONE service:
TOMTOM_API_KEY = your existing TomTom key
AIRLABS_API_KEY = your existing AirLabs key
GEMINI_API_KEY = your Gemini key

You do NOT need AI_API_URL.
You do NOT need a second Render service.
You do NOT need to expose the Gemini key to the browser.

After it deploys, use the Web Service URL as your website URL.
