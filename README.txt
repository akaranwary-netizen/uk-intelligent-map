UK INTELLIGENT MAP — PREMIUM FLIGHT TRACKER + REAL 3D AIRCRAFT

REPLACE ONLY:
- flights-live.js

Do not replace index.html, app.js, style.css, build.js, navigation files or luxury-ui.js.

WHAT'S NEW
- redesigned premium flight information sheet
- Overview / Route / Aircraft / More tabs
- flight number, airline (when available), departure, destination
- altitude, speed, heading, vertical speed
- aircraft model, manufacturer, registration, build year, age, engines
- ICAO24/hex, squawk, terminals, gates, baggage, schedule, delay when AirLabs provides them
- observed route trail
- manual Refresh button
- real 3D Follow mode using your existing Cesium + Google Photorealistic 3D map

CRITICAL 3D FIX
The aircraft is no longer a picture attached to the screen.
It is a real Cesium 3D model entity placed at the AirLabs latitude, longitude and altitude.
The camera follows BEHIND that real 3D model.

3D MODEL
This uses Cesium's public CesiumAir GLB sample model from the official Cesium GitHub repository.
It is not an airline-specific livery, but it is a true 3D aircraft object.

POSITION ACCURACY
Normal-map aircraft are tied to AirLabs real positions.
There is no dead-reckoning. The only animation is easing between one real AirLabs fix and the next real fix.

ROUTE NOTE
The blue trail contains positions observed by your map.
The dashed line ahead is only a heading guide, not a claimed exact ATC route.
