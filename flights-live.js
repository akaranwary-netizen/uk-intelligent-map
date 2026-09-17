/* UK Intelligent Map — FlightLogic live aircraft layer
   Free, no-key, browser-CORS endpoint:
   https://flightlogic.co.uk/api/flights?lat=...&lon=...
*/
(()=>{
  const ENDPOINT='https://flightlogic.co.uk/api/flights';
  const REFRESH_MS=15000;
  const info=()=>document.querySelector('#info');
  const button=()=>document.querySelector('.layers button[data-layer="flights"]');

  let enabled=false, busy=false, timer=null, moveTimer=null;
  const markers=new Map();

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>(
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
  const num=v=>{
    const n=Number(v);
    return Number.isFinite(n)?n:null;
  };
  const first=(obj,keys)=>{
    for(const k of keys){
      if(obj && obj[k]!==undefined && obj[k]!==null && obj[k]!=='') return obj[k];
    }
    return null;
  };
  const clean=v=>typeof v==='string'?v.trim():v;

  function normalise(a){
    return {
      id: String(first(a,['hex','icao24','icao','id','registration','reg','callsign','flight','flight_number']) || Math.random()),
      lat: num(first(a,['lat','latitude'])),
      lon: num(first(a,['lon','lng','longitude'])),
      callsign: clean(first(a,['flight','callsign','flight_number','flightNumber','number'])) || 'Unknown flight',
      altitude: first(a,['alt_baro','altitude','altitude_ft','altitudeFeet','alt']),
      speed: first(a,['gs','speed','ground_speed','groundSpeed','velocity']),
      heading: first(a,['track','heading','direction','course']),
      hex: clean(first(a,['hex','icao24','icao'])),
      registration: clean(first(a,['registration','reg'])),
      raw:a
    };
  }

  function unwrap(data){
    if(Array.isArray(data)) return data;
    for(const key of ['flights','aircraft','ac','results','data','items']){
      if(Array.isArray(data?.[key])) return data[key];
    }
    return [];
  }

  function aircraftElement(){
    const wrap=document.createElement('button');
    wrap.type='button';
    wrap.className='live-aircraft';
    wrap.setAttribute('aria-label','Live aircraft');
    wrap.style.cssText='border:0;background:transparent;padding:0;width:36px;height:36px;display:grid;place-items:center;cursor:pointer;filter:drop-shadow(0 2px 5px #000c)';
    const icon=document.createElement('span');
    icon.textContent='✈';
    icon.style.cssText='display:block;color:#d8ff2f;font-size:26px;line-height:1;transform-origin:center;text-shadow:0 0 7px #000,0 0 12px #d8ff2f55';
    wrap.appendChild(icon);
    return {wrap,icon};
  }

  function showAircraft(a){
    let alt='Altitude unavailable';
    if(String(a.altitude).toLowerCase()==='ground') alt='On ground';
    else if(num(a.altitude)!==null) alt=Math.round(num(a.altitude)).toLocaleString()+' ft';

    let speed='Speed unavailable';
    if(num(a.speed)!==null) speed=Math.round(num(a.speed))+' kt';

    let heading='Heading unavailable';
    if(num(a.heading)!==null) heading=Math.round(num(a.heading))+'°';

    const extra=a.registration ? ' · '+esc(a.registration) : (a.hex ? ' · ICAO '+esc(String(a.hex).toUpperCase()) : '');
    if(info()) info().innerHTML=`<b>✈ ${esc(a.callsign)}</b><span>${esc(alt)} · ${esc(speed)} · ${esc(heading)}${extra}</span>`;
  }

  function upsert(a){
    if(a.lat===null || a.lon===null) return;
    let x=markers.get(a.id);
    if(!x){
      const el=aircraftElement();
      const marker=new maplibregl.Marker({element:el.wrap,anchor:'center'})
        .setLngLat([a.lon,a.lat]).addTo(map);
      x={marker,el:el.wrap,icon:el.icon,data:a,last:Date.now()};
      markers.set(a.id,x);
      el.wrap.addEventListener('click',e=>{
        e.stopPropagation();
        showAircraft(x.data);
      });
    }
    x.data=a;
    x.last=Date.now();
    x.marker.setLngLat([a.lon,a.lat]);

    const h=num(a.heading);
    // Unicode plane points roughly NE by default, offset for visual heading.
    x.icon.style.transform=`rotate(${(h ?? 45)-45}deg)`;
  }

  function clearAll(){
    for(const x of markers.values()) x.marker.remove();
    markers.clear();
  }

  function requestPoints(){
    const b=map.getBounds(), c=map.getCenter(), z=map.getZoom();

    // Close view: one request is enough.
    if(z>=7) return [[c.lat,c.lng]];

    // Wider UK view: sample up to four areas of the current viewport.
    const n=Math.min(60.8,b.getNorth()), s=Math.max(49.5,b.getSouth());
    const w=Math.max(-8.8,b.getWest()), e=Math.min(2.2,b.getEast());
    if(n<=s || e<=w) return [[c.lat,c.lng]];

    const midLat=(n+s)/2, midLon=(w+e)/2;
    return [
      [(n+midLat)/2,(w+midLon)/2],
      [(n+midLat)/2,(e+midLon)/2],
      [(s+midLat)/2,(w+midLon)/2],
      [(s+midLat)/2,(e+midLon)/2],
    ];
  }

  async function fetchArea(lat,lon){
    const url=`${ENDPOINT}?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`;
    const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
    if(!r.ok) throw new Error('FlightLogic HTTP '+r.status);
    const data=await r.json();
    return unwrap(data).map(normalise).filter(a=>a.lat!==null && a.lon!==null);
  }

  async function refresh(){
    if(!enabled || busy) return;
    busy=true;
    try{
      const pts=requestPoints();
      const results=await Promise.allSettled(pts.map(([lat,lon])=>fetchArea(lat,lon)));
      const all=[];
      for(const r of results) if(r.status==='fulfilled') all.push(...r.value);

      if(!all.length && results.every(r=>r.status==='rejected')){
        throw results[0].reason || new Error('No flight responses');
      }

      // De-duplicate aircraft returned by overlapping 100 km circles.
      const latest=new Map();
      for(const a of all) latest.set(a.id,a);

      const seen=new Set();
      for(const a of latest.values()){
        seen.add(a.id);
        upsert(a);
      }
      for(const [id,x] of markers){
        if(!seen.has(id)){
          x.marker.remove();
          markers.delete(id);
        }
      }

      if(info()) info().innerHTML=
        `<b>✈ Live Flights</b><span>${latest.size} aircraft currently received around this map area · FlightLogic</span>`;
    }catch(err){
      console.error('FlightLogic live flights:',err);
      if(info()) info().innerHTML=
        '<b>✈ Live Flights</b><span>Live aircraft could not refresh right now. The map will retry automatically.</span>';
    }finally{
      busy=false;
    }
  }

  function setEnabled(on){
    enabled=on;
    clearInterval(timer); timer=null;

    if(on){
      clearAll();
      if(info()) info().innerHTML='<b>✈ Live Flights</b><span>Connecting to live aircraft…</span>';
      refresh();
      timer=setInterval(refresh,REFRESH_MS);
    }else{
      clearAll();
      if(info()) info().innerHTML='<b>Flights</b><span>Live aircraft layer hidden.</span>';
    }
  }

  function hook(){
    const b=button();
    if(!b) return;

    // app.js already toggles the button. We run immediately after and replace its demo flight marker.
    b.addEventListener('click',()=>{
      setTimeout(()=>{
        const on=b.classList.contains('on');

        // Hide/remove any prototype flight marker created by app.js.
        try{
          if(window.markers?.flights){
            window.markers.flights.forEach(m=>m.remove?.());
          }
        }catch(_){}

        setEnabled(on);
      },0);
    });

    map.on('moveend',()=>{
      if(!enabled) return;
      clearTimeout(moveTimer);
      moveTimer=setTimeout(refresh,500);
    });
  }

  if(map.loaded()) hook();
  else map.once('load',hook);
})();