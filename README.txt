UK INTELLIGENT MAP — TOMTOM LIVE TRAFFIC

Upload these 3 files to the ROOT of your GitHub repository:
1. index.html  (replace existing)
2. traffic-live.js  (new file)
3. build.js  (new file)

Do NOT change app.js or style.css.

Then in Render:
- TOMTOM_API_KEY should already exist under Environment Variables.
- Open Settings / Build & Deploy.
- Build Command: node build.js
- Publish Directory: dist
- Save changes and deploy the latest commit.

What this update does:
- Keeps your current UI, GPS and 3D map.
- Removes the old fake/demo traffic line.
- Adds TomTom real-time traffic-flow tiles.
- Your existing Traffic button turns live traffic ON/OFF.

Note:
The TomTom key is injected only during Render's build and is not committed to GitHub.
Because traffic tiles are requested by the browser, a web traffic key can still be visible in browser network requests; apply TomTom's available key restrictions/quotas.
