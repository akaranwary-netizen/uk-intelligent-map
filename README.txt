UK INTELLIGENT MAP — AIRLABS LIVE FLIGHTS

You already added AIRLABS_API_KEY in Render.

Replace ONLY:
- build.js
- flights-live.js

Then redeploy.

What this does:
- build.js exposes the Render AIRLABS_API_KEY to the browser config
- flights-live.js uses AirLabs Real-Time Flights API
- requests only the current visible map bounding box
- shows live aircraft markers
- rotates planes by heading
- tap a plane for flight, altitude, speed, route and aircraft type
- refreshes every 20 seconds and when the map moves

Important:
Because this is a static website, any API key used directly by browser JavaScript can be visible to visitors in browser developer tools. For production, move AirLabs behind a backend proxy.
