/* UK Intelligent Map — AirLabs live flights */
(()=>{
  const info=()=>document.querySelector('#info');
  const btn=()=>document.querySelector('.layers button[data-layer="flights"]');
  const key=window.APP_CONFIG?.AIRLABS_API_KEY || '';
  const ENDPOINT='https://airlabs.co/api/v9/flights';
  const REFRESH_MS=20000;
  const fields='hex,reg_number,flight_iata,flight_icao,dep_iata,arr_iata,lat,lng,alt,dir,speed,aircraft_icao,status,updated';
  let enabled=false,busy=false,timer=null,moveTimer=null;
  const markers=new Map();

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Number.isFinite(Number(v))?Number(v):null;

  function bbox(){
    const b=map.getBounds();
    const s=Math.max(-85,Math.min(85,b.getSouth()));
    const nlat=Math.max(-85,Math.min(85,b.getNorth()));
    const w=Math.max(-180,Math.min(180,b.getWest()));
    const e=Math.max(-180,Math.min(180,b.getEast()));
    return `${s.toFixed(4)},${w.toFixed(4)},${nlat.toFixed(4)},${e.toFixed(4)}`;
  }

  function planeEl(){
    const wrap=document.createElement('button');
    wrap.type='button';
    wrap.setAttribute('aria-label','Live aircraft');
    wrap.style.cssText='border:0;background:transparent;padding:0;width:36px;height:36px;display:grid;place-items:center;cursor:pointer;filter:drop-shadow(0 2px 5px #000c)';
    const icon=document.createElement('span');
    icon.textContent='✈';
    icon.style.cssText='display:block;color:#d8ff2f;font-size:26px;line-height:1;transform-origin:center;text-shadow:0 0 7px #000,0 0 12px #d8ff2f55';
    wrap.appendChild(icon);
    return {wrap,icon};
  }

  function show(a){
    const flight=(a.flight_iata||a.flight_icao||a.hex||'Unknown flight').trim?.() || 'Unknown flight';
    const alt=n(a.alt)!==null ? `${Math.round(n(a.alt)*3.28084).toLocaleString()} ft` : 'Altitude unavailable';
    const speed=n(a.speed)!==null ? `${Math.round(n(a.speed)*0.539957)} kt` : 'Speed unavailable';
    const dir=n(a.dir)!==null ? `${Math.round(n(a.dir))}°` : 'Heading unavailable';
    const route=(a.dep_iata||a.arr_iata) ? ` · ${esc(a.dep_iata||'?')} → ${esc(a.arr_iata||'?')}` : '';
    const type=a.aircraft_icao ? ` · ${esc(a.aircraft_icao)}` : '';
    info().innerHTML=`<b>✈ ${esc(flight)}</b><span>${esc(alt)} · ${esc(speed)} · ${esc(dir)}${route}${type}</span>`;
  }

  function upsert(a){
    const lat=n(a.lat),lng=n(a.lng);
    if(lat===null||lng===null)return;
    const id=String(a.hex||a.flight_icao||a.flight_iata||`${lat},${lng}`);
    let x=markers.get(id);
    if(!x){
      const el=planeEl();
      const marker=new maplibregl.Marker({element:el.wrap,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
      x={marker,wrap:el.wrap,icon:el.icon,data:a};
      markers.set(id,x);
      el.wrap.addEventListener('click',e=>{e.stopPropagation();show(x.data);});
    }
    x.data=a;
    x.marker.setLngLat([lng,lat]);
    x.icon.style.transform=`rotate(${(n(a.dir)??45)-45}deg)`;
  }

  function clearAll(){
    for(const x of markers.values()) x.marker.remove();
    markers.clear();
  }

  async function refresh(){
    if(!enabled||busy)return;
    if(!key){
      info().innerHTML='<b>✈ Live Flights</b><span>AIRLABS_API_KEY is missing from the deployed config.</span>';
      return;
    }
    busy=true;
    try{
      const url=`${ENDPOINT}?bbox=${encodeURIComponent(bbox())}&_fields=${encodeURIComponent(fields)}&api_key=${encodeURIComponent(key)}`;
      const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(`AirLabs HTTP ${r.status}`);
      if(data.error) throw new Error(data.error.message || data.error.code || 'AirLabs error');

      const rows=Array.isArray(data.response) ? data.response : (Array.isArray(data) ? data : []);
      const seen=new Set();
      for(const a of rows){
        const lat=n(a.lat),lng=n(a.lng);
        if(lat===null||lng===null)continue;
        const id=String(a.hex||a.flight_icao||a.flight_iata||`${lat},${lng}`);
        seen.add(id); upsert(a);
      }
      for(const [id,x] of markers){
        if(!seen.has(id)){x.marker.remove();markers.delete(id);}
      }
      info().innerHTML=`<b>✈ Live Flights</b><span>${seen.size} aircraft loaded in this map area · AirLabs</span>`;
    }catch(err){
      console.error('AirLabs flights:',err);
      info().innerHTML=`<b>✈ Live Flights</b><span>${esc(err.message||'AirLabs could not refresh right now.')}</span>`;
    }finally{busy=false;}
  }

  function setEnabled(on){
    enabled=on;
    clearInterval(timer);timer=null;
    if(on){
      clearAll();
      info().innerHTML='<b>✈ Live Flights</b><span>Connecting to AirLabs…</span>';
      refresh();
      timer=setInterval(refresh,REFRESH_MS);
    }else{
      clearAll();
      info().innerHTML='<b>Flights</b><span>Live aircraft layer hidden.</span>';
    }
  }

  function hook(){
    const b=btn(); if(!b)return;
    b.addEventListener('click',()=>setTimeout(()=>setEnabled(b.classList.contains('on')),0));
    map.on('moveend',()=>{
      if(!enabled)return;
      clearTimeout(moveTimer);
      moveTimer=setTimeout(refresh,500);
    });
  }

  if(map.loaded())hook();else map.once('load',hook);
})();