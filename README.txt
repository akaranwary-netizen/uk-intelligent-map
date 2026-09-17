UK INTELLIGENT MAP — TOMTOM BRANDED NAVIGATION UPGRADE

Upload/replace these files in the GitHub repository root:
1. index.html
2. build.js
3. traffic-live.js
4. map-theme.js (new)

KEEP unchanged:
- app.js
- style.css
- navigation.js
- navigation.css

Render:
Build Command: node build.js
Publish Directory: dist
TOMTOM_API_KEY remains in Render Environment Variables.

This changes only Navigation Map. Existing Cesium/Google 3D mode is untouched.
