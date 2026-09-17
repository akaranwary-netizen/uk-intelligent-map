NAVIGATION UPGRADE

Upload/replace:
- index.html (replace)
- build.js (replace)
- navigation.js (new)
- navigation.css (new)

Keep app.js, style.css and traffic-live.js unchanged.

Render stays:
Build Command: node build.js
Publish Directory: dist

Then deploy latest commit.

Adds:
- visible mobile postcode/address/place search
- TomTom UK search
- route from current GPS
- traffic-aware ETA + distance
- route line + destination marker
- continuous GPS tracking
- heading/direction cone; uses GPS course while moving and device heading when browser provides it
- map follows/rotates during an active route
