/* UK Intelligent Map — live aircraft layer powered by ADSB.lol */
(()=>{
  const API='https://api.adsb.lol/v2';
  const REFRESH_MS=10000;
  const MAX_RADIUS_NM=250;
  const UK={w:-11.5,e:3.5,s:49.0,n:61.5};
  let enabled=false,timer=null,moveTimer=null,markers=new Map(),busy=false;

  const btn=()=>document.querySelector('.layers button[data-layer="flights"]');
  const info=()=>document.querySelector('#info');
  const clean=v=>typeof v==='string'?v.trim():v;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nm=(lat1,lon1,lat2,lon2)=>{
    const R=3440.065,d2r=Math.PI/180;
    const a=Math.sin((lat2-lat1)*d2r/2)**2+Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin((lon2-lon1)*d2r/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  };
  const visibleUK=()=>{
    const b=map.getBounds();
    return !(b.getEast()<UK.w||b.getWest()>UK.e||b.getNorth()<UK.s||b.getSouth()>UK.n);
  };
  function queryCircle(){
    const b=map.getBounds(), c=map.getCenter();
    const lat=Math.max(UK.s,Math.min(UK.n,c.lat)),lon=Math.max(UK.w,Math.min(UK.e,c.lng));
    const corners=[[b.getNorth(),b.getEast()],[b.getNorth(),b.getWest()],[b.getSouth(),b.getEast()],[b.getSouth(),b.getWest()]];
    let r=Math.max(...corners.map(x=>nm(lat,lon,x[0],x[1])));
    if(map.getZoom()<6){ return {lat:54.5,lon:-2.5,r:MAX_RADIUS_NM}; }
    return {lat,lon,r:Math.max(15,Math.min(MAX_RADIUS_NM,Math.ceil(r*1.15)))};
  }
  function planeEl(a){
    const wrap=document.createElement('button');
    wrap.type='button'; wrap.className='live-aircraft';
    wrap.style.cssText='border:0;background:transparent;padding:0;width:34px;height:34px;display:grid;place-items:center;cursor:pointer;filter:drop-shadow(0 2px 5px #000b)';
    const icon=document.createElement('span');
    icon.textContent='✈'; icon.style.cssText='display:block;color:#d8ff2f;font-size:25px;line-height:1;transform-origin:50% 50%;text-shadow:0 0 8px #000,0 0 12px #d8ff2f55';
    wrap.appendChild(icon);
    wrap.addEventListener('click',e=>{e.stopPropagation();showAircraft(a);});
    return {wrap,icon};
  }
  function showAircraft(a){
    const call=clean(a.flight)||'Unknown flight',alt=a.alt_baro==='ground'?'On ground':Number.isFinite(+a.alt_baro)?Math.round(+a.alt_baro).toLocaleString()+' ft':'Altitude unavailable';
    const speed=Number.isFinite(+a.gs)?Math.round(+a.gs)+' kt':'Speed unavailable';
    const heading=Number.isFinite(+a.track)?Math.round(+a.track)+'°':'Heading unavailable';
    info().innerHTML=`<b>✈ ${esc(call)}</b><span>${esc(alt)} · ${esc(speed)} · ${esc(heading)}${a.hex?' · ICAO '+esc(String(a.hex).toUpperCase()):''}</span>`;
  }
  function updateMarker(a){
    if(!Number.isFinite(+a.lat)||!Number.isFinite(+a.lon))return;
    const id=String(a.hex||clean(a.flight)||`${a.lat},${a.lon}`);
    let x=markers.get(id);
    if(!x){
      const el=planeEl(a);
      const marker=new maplibregl.Marker({element:el.wrap,anchor:'center'}).setLngLat([+a.lon,+a.lat]).addTo(map);
      x={marker,el:el.wrap,icon:el.icon,data:a,last:Date.now()}; markers.set(id,x);
    }
    x.data=a;x.last=Date.now();x.marker.setLngLat([+a.lon,+a.lat]);
    const tr=Number.isFinite(+a.track)?+a.track:0;
    x.icon.style.transform=`rotate(${tr-45}deg)`;
    x.el.onclick=()=>showAircraft(x.data);
  }
  function prune(seen){
    for(const [id,x] of markers) if(!seen.has(id)){x.marker.remove();markers.delete(id);}
  }
  function clear(){
    for(const x of markers.values())x.marker.remove();
    markers.clear();
  }
  async function refresh(){
    if(!enabled||busy||!visibleUK())return;
    busy=true;
    try{
      const q=queryCircle();
      const url=`${API}/lat/${q.lat.toFixed(4)}/lon/${q.lon.toFixed(4)}/dist/${q.r}`;
      const res=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!res.ok)throw new Error('Aircraft service HTTP '+res.status);
      const data=await res.json(), ac=Array.isArray(data.ac)?data.ac:[];
      const seen=new Set();
      ac.forEach(a=>{if(Number.isFinite(+a.lat)&&Number.isFinite(+a.lon)){const id=String(a.hex||clean(a.flight)||`${a.lat},${a.lon}`);seen.add(id);updateMarker(a);}});
      prune(seen);
      if(enabled) info().innerHTML=`<b>✈ Live Flights</b><span>${ac.filter(a=>Number.isFinite(+a.lat)&&Number.isFinite(+a.lon)).length} aircraft received for this map area · ADSB.lol live feed</span>`;
    }catch(err){
      console.error('Live flights:',err);
      if(enabled) info().innerHTML='<b>✈ Live Flights</b><span>Aircraft feed could not refresh right now. The map will try again automatically.</span>';
    }finally{busy=false;}
  }
  function setEnabled(on){
    enabled=on;
    if(timer){clearInterval(timer);timer=null;}
    if(on){
      clear();refresh();
      timer=setInterval(refresh,REFRESH_MS);
      info().innerHTML='<b>✈ Live Flights</b><span>Connecting to live aircraft positions…</span>';
    }else{
      clear();
      info().innerHTML='<b>Flights</b><span>Live aircraft layer hidden.</span>';
    }
  }
  function hook(){
    const b=btn(); if(!b)return;
    /* app.js owns the layer button click; run after it and replace demo flight marker */
    b.addEventListener('click',()=>setTimeout(()=>{
      const on=b.classList.contains('on');
      if(window.markers?.flights) window.markers.flights.forEach(m=>m.remove?.());
      setEnabled(on);
    },0));
    map.on('moveend',()=>{
      if(!enabled)return;
      clearTimeout(moveTimer);moveTimer=setTimeout(refresh,350);
    });
    map.on('styledata',()=>{ if(enabled)setTimeout(refresh,250); });
  }
  if(map.loaded())hook();else map.once('load',hook);
})();