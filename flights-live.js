/* UK Intelligent Map — AirLabs Live Flights Pro
   Features:
   - realistic aircraft markers
   - smooth motion between API refreshes using speed + heading
   - tap an aircraft for live details
   - observed trail behind selected aircraft
   - projected heading line ahead (NOT an exact ATC route)
   - Follow Aircraft chase / dashcam-style camera
*/
(()=>{
  const info=()=>document.querySelector('#info');
  const btn=()=>document.querySelector('.layers button[data-layer="flights"]');
  const key=window.APP_CONFIG?.AIRLABS_API_KEY || '';
  const ENDPOINT='https://airlabs.co/api/v9/flights';

  // Keep API usage sensible on a free plan.
  const REFRESH_MS=20000;
  const MAX_DEAD_RECKON_SECONDS=28;
  const TRAIL_MAX_POINTS=28;
  const fields='hex,reg_number,flight_iata,flight_icao,dep_iata,arr_iata,lat,lng,alt,dir,speed,aircraft_icao,status,updated';

  let enabled=false,busy=false,timer=null,moveTimer=null,raf=null;
  let selectedId=null,followMode=false,lastFrame=performance.now();
  const markers=new Map();
  const trails=new Map();

  const TRAIL_SOURCE='flight-selected-trail';
  const AHEAD_SOURCE='flight-selected-ahead';
  const TRAIL_LAYER='flight-selected-trail-line';
  const AHEAD_LAYER='flight-selected-ahead-line';

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  injectStyles();

  function injectStyles(){
    if(document.querySelector('#flight-pro-styles')) return;
    const s=document.createElement('style');
    s.id='flight-pro-styles';
    s.textContent=`
      .flight-aircraft{position:relative;border:0;background:transparent;padding:0;width:42px;height:42px;display:grid;place-items:center;cursor:pointer;filter:drop-shadow(0 3px 5px rgba(0,0,0,.7));transition:filter .2s ease}
      .flight-aircraft svg{width:34px;height:34px;display:block;transform-origin:50% 50%}
      .flight-aircraft .body{fill:url(#planeBodyGradient)}
      .flight-aircraft .edge{stroke:rgba(6,13,18,.72);stroke-width:1.1;paint-order:stroke fill}
      .flight-aircraft .wing-l,.flight-aircraft .wing-r{position:absolute;width:4px;height:4px;border-radius:50%;top:19px;box-shadow:0 0 7px currentColor}
      .flight-aircraft .wing-l{left:5px;background:#ff344d;color:#ff344d}
      .flight-aircraft .wing-r{right:5px;background:#48ff7a;color:#48ff7a}
      .flight-aircraft.selected{filter:drop-shadow(0 0 5px rgba(78,190,255,.95)) drop-shadow(0 4px 8px rgba(0,0,0,.85))}
      .flight-aircraft.selected svg{width:42px;height:42px}
      #flightFollowPanel{position:absolute;z-index:40;left:50%;transform:translateX(-50%);bottom:86px;width:min(520px,calc(100% - 28px));padding:12px;background:rgba(7,13,13,.90);border:1px solid rgba(255,255,255,.13);border-radius:22px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 12px 35px rgba(0,0,0,.35);display:none}
      #flightFollowPanel.show{display:block}
      .fp-top{display:flex;align-items:center;gap:10px}
      .fp-plane{width:40px;height:40px;border-radius:14px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-size:23px}
      .fp-main{min-width:0;flex:1}.fp-main b{display:block;font-size:16px}.fp-main span{display:block;color:#a8b0ab;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fp-actions{display:flex;gap:7px;margin-top:10px}
      .fp-actions button{height:42px;border-radius:15px;border:1px solid rgba(255,255,255,.12);padding:0 14px;font-weight:800;font-size:12px}
      #flightFollowBtn{flex:1;background:#d8ff2f;color:#0b0e0b;border-color:#d8ff2f}
      #flightCloseBtn{background:#17201a;color:#fff}
      #flightExitFollow{display:none;flex:1;background:#202720;color:#fff}
      #flightFollowPanel.following #flightFollowBtn{display:none}
      #flightFollowPanel.following #flightExitFollow{display:block}
      @media(max-width:700px){#flightFollowPanel{bottom:80px}.flight-aircraft{width:38px;height:38px}.flight-aircraft svg{width:31px;height:31px}}
    `;
    document.head.appendChild(s);
  }

  function planeElement(){
    const wrap=document.createElement('button');
    wrap.type='button';
    wrap.className='flight-aircraft';
    wrap.setAttribute('aria-label','Live aircraft');
    wrap.innerHTML=`
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="planeBodyGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset=".52" stop-color="#dfe6ea"/>
            <stop offset="1" stop-color="#84929c"/>
          </linearGradient>
        </defs>
        <path class="body edge" d="M32 2c-2.6 0-4.2 4.1-4.2 8.5v13.4L8.4 34.3c-1.8 1-2.8 2.8-2.5 4.3.3 1.2 1.5 2 3 1.7l18.9-4.2v12.5l-6.3 5.2c-1.1.9-1.5 2.2-1 3.2.5 1 1.8 1.4 3 .9l8.5-3.3 8.5 3.3c1.2.5 2.5.1 3-.9.5-1 .1-2.3-1-3.2l-6.3-5.2V36.1l18.9 4.2c1.5.3 2.7-.5 3-1.7.3-1.5-.7-3.3-2.5-4.3L36.2 23.9V10.5C36.2 6.1 34.6 2 32 2z"/>
        <path d="M32 7v43" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
      </svg>
      <i class="wing-l"></i><i class="wing-r"></i>
    `;
    return wrap;
  }

  function ensurePanel(){
    let p=document.querySelector('#flightFollowPanel');
    if(p) return p;
    p=document.createElement('div');
    p.id='flightFollowPanel';
    p.innerHTML=`
      <div class="fp-top">
        <div class="fp-plane">✈</div>
        <div class="fp-main"><b id="fpFlight">Aircraft</b><span id="fpRoute">Live aircraft</span></div>
        <button id="flightCloseBtn" type="button">×</button>
      </div>
      <div class="fp-actions">
        <button id="flightFollowBtn" type="button">✈ Follow Aircraft</button>
        <button id="flightExitFollow" type="button">Exit Follow</button>
      </div>`;
    document.querySelector('#app').appendChild(p);
    p.querySelector('#flightFollowBtn').addEventListener('click',()=>setFollow(true));
    p.querySelector('#flightExitFollow').addEventListener('click',()=>setFollow(false));
    p.querySelector('#flightCloseBtn').addEventListener('click',()=>deselect());
    return p;
  }

  function bbox(){
    const b=map.getBounds();
    const s=clamp(b.getSouth(),-85,85);
    const nlat=clamp(b.getNorth(),-85,85);
    const w=clamp(b.getWest(),-180,180);
    const e=clamp(b.getEast(),-180,180);
    return `${s.toFixed(4)},${w.toFixed(4)},${nlat.toFixed(4)},${e.toFixed(4)}`;
  }

  function idFor(a){
    return String(a.hex||a.flight_icao||a.flight_iata||a.reg_number||`${a.lat},${a.lng}`);
  }

  function flightName(a){
    return String(a.flight_iata||a.flight_icao||a.reg_number||a.hex||'Unknown flight').trim();
  }

  function pushTrail(id,lng,lat){
    if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
    const arr=trails.get(id)||[];
    const last=arr[arr.length-1];
    if(!last || Math.abs(last[0]-lng)>0.001 || Math.abs(last[1]-lat)>0.001){
      arr.push([lng,lat]);
      if(arr.length>TRAIL_MAX_POINTS) arr.splice(0,arr.length-TRAIL_MAX_POINTS);
      trails.set(id,arr);
    }
  }

  function toRad(d){return d*Math.PI/180}
  function toDeg(r){return r*180/Math.PI}

  function project(lat,lon,bearingDeg,distanceKm){
    const R=6371;
    const br=toRad(bearingDeg), d=distanceKm/R;
    const p1=toRad(lat), l1=toRad(lon);
    const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(br));
    const l2=l1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
    return [((toDeg(l2)+540)%360)-180,toDeg(p2)];
  }

  function ensureRouteLayers(){
    if(!map.getSource(TRAIL_SOURCE)){
      map.addSource(TRAIL_SOURCE,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    }
    if(!map.getLayer(TRAIL_LAYER)){
      map.addLayer({
        id:TRAIL_LAYER,type:'line',source:TRAIL_SOURCE,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#55c8ff','line-width':['interpolate',['linear'],['zoom'],5,2,12,5],'line-opacity':.82,'line-blur':.3}
      });
    }
    if(!map.getSource(AHEAD_SOURCE)){
      map.addSource(AHEAD_SOURCE,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    }
    if(!map.getLayer(AHEAD_LAYER)){
      map.addLayer({
        id:AHEAD_LAYER,type:'line',source:AHEAD_SOURCE,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#d8ff2f','line-width':['interpolate',['linear'],['zoom'],5,1.5,12,3.5],'line-opacity':.72,'line-dasharray':[2,2]}
      });
    }
  }

  function setLineData(sourceId,coords){
    const s=map.getSource(sourceId);
    if(!s) return;
    s.setData({
      type:'FeatureCollection',
      features:coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[]
    });
  }

  function redrawSelectedLines(){
    if(!selectedId) return;
    const x=markers.get(selectedId);
    if(!x) return;
    try{ ensureRouteLayers(); }catch(_){ return; }

    const pos=x.marker.getLngLat();
    const observed=[...(trails.get(selectedId)||[])];
    if(!observed.length || Math.abs(observed[observed.length-1][0]-pos.lng)>.0001 || Math.abs(observed[observed.length-1][1]-pos.lat)>.0001){
      observed.push([pos.lng,pos.lat]);
    }
    setLineData(TRAIL_SOURCE,observed);

    const heading=num(x.data.dir);
    const speedKmh=num(x.data.speed);
    if(heading!==null){
      // Project 12 minutes ahead, clamped to a useful visual length.
      const km=clamp((speedKmh||700)*(12/60),30,180);
      const ahead=project(pos.lat,pos.lng,heading,km);
      setLineData(AHEAD_SOURCE,[[pos.lng,pos.lat],ahead]);
    }else{
      setLineData(AHEAD_SOURCE,[]);
    }
  }

  function showDetails(x){
    const a=x.data;
    const alt=num(a.alt)!==null ? `${Math.round(num(a.alt)*3.28084).toLocaleString()} ft` : 'Altitude unavailable';
    const speed=num(a.speed)!==null ? `${Math.round(num(a.speed)*0.539957)} kt` : 'Speed unavailable';
    const dir=num(a.dir)!==null ? `${Math.round(num(a.dir))}°` : 'Heading unavailable';
    const route=(a.dep_iata||a.arr_iata)?`${a.dep_iata||'?'} → ${a.arr_iata||'?'}`:'Route unavailable';
    const type=a.aircraft_icao?` · ${a.aircraft_icao}`:'';
    info().innerHTML=`<b>✈ ${esc(flightName(a))}</b><span>${esc(route)} · ${esc(alt)} · ${esc(speed)} · ${esc(dir)}${esc(type)}</span>`;
  }

  function updatePanel(){
    const p=ensurePanel();
    const x=selectedId?markers.get(selectedId):null;
    if(!x){p.classList.remove('show','following');return;}
    const a=x.data;
    p.classList.add('show');
    p.classList.toggle('following',followMode);
    p.querySelector('#fpFlight').textContent=flightName(a);
    const route=(a.dep_iata||a.arr_iata)?`${a.dep_iata||'?'} → ${a.arr_iata||'?'}`:'Live aircraft';
    const alt=num(a.alt)!==null?`${Math.round(num(a.alt)*3.28084).toLocaleString()} ft`:'';
    const speed=num(a.speed)!==null?`${Math.round(num(a.speed)*0.539957)} kt`:'';
    p.querySelector('#fpRoute').textContent=[route,alt,speed].filter(Boolean).join(' · ');
  }

  function selectAircraft(id){
    if(selectedId && markers.get(selectedId)) markers.get(selectedId).el.classList.remove('selected');
    selectedId=id;
    const x=markers.get(id);
    if(!x)return;
    x.el.classList.add('selected');
    showDetails(x);
    updatePanel();
    redrawSelectedLines();
  }

  function deselect(){
    setFollow(false);
    if(selectedId && markers.get(selectedId)) markers.get(selectedId).el.classList.remove('selected');
    selectedId=null;
    const p=document.querySelector('#flightFollowPanel');
    if(p)p.classList.remove('show','following');
    try{
      setLineData(TRAIL_SOURCE,[]);
      setLineData(AHEAD_SOURCE,[]);
    }catch(_){}
  }

  function setFollow(on){
    if(on && (!selectedId || !markers.get(selectedId))) return;
    followMode=!!on;
    updatePanel();
    if(!followMode){
      map.easeTo({pitch:Math.min(map.getPitch(),45),duration:600});
      return;
    }
    chaseCamera(true);
  }

  function chaseCamera(force=false){
    if(!followMode || !selectedId) return;
    const x=markers.get(selectedId);
    if(!x)return;
    const p=x.marker.getLngLat();
    const heading=num(x.data.dir)??map.getBearing();
    map.easeTo({
      center:[p.lng,p.lat],
      offset:[0,115],
      bearing:heading,
      pitch:67,
      zoom:Math.max(map.getZoom(),10.6),
      duration:force?900:650,
      easing:t=>t
    });
  }

  function upsert(a){
    const lat=num(a.lat),lng=num(a.lng);
    if(lat===null||lng===null)return;
    const id=idFor(a);
    const now=Date.now();
    let x=markers.get(id);

    if(!x){
      const el=planeElement();
      const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
      x={
        id,marker,el,data:a,
        realLat:lat,realLng:lng,
        simLat:lat,simLng:lng,
        correctionLat:0,correctionLng:0,
        lastApiAt:now
      };
      markers.set(id,x);
      el.addEventListener('click',e=>{
        e.stopPropagation();
        selectAircraft(id);
      });
    }else{
      // Soft-correct our smoothly projected position toward the newest real fix.
      x.correctionLat=lat-x.simLat;
      x.correctionLng=lng-x.simLng;
      x.realLat=lat;
      x.realLng=lng;
      x.lastApiAt=now;
      x.data=a;
    }

    pushTrail(id,lng,lat);
    const heading=num(a.dir)??0;
    x.el.querySelector('svg').style.transform=`rotate(${heading}deg)`;
    if(selectedId===id){
      showDetails(x);
      updatePanel();
      redrawSelectedLines();
    }
  }

  function animate(now){
    const dt=Math.min(.25,(now-lastFrame)/1000);
    lastFrame=now;

    for(const x of markers.values()){
      const a=x.data;
      const age=(Date.now()-x.lastApiAt)/1000;
      const heading=num(a.dir);
      const speedKmh=num(a.speed);

      // Gently absorb real-position corrections over ~5 seconds.
      const correctionFactor=Math.min(1,dt/5);
      x.simLat += x.correctionLat*correctionFactor;
      x.simLng += x.correctionLng*correctionFactor;
      x.correctionLat *= (1-correctionFactor);
      x.correctionLng *= (1-correctionFactor);

      // Dead-reckon only briefly between genuine AirLabs updates.
      if(age<MAX_DEAD_RECKON_SECONDS && heading!==null && speedKmh!==null && speedKmh>20){
        const distanceKm=speedKmh*(dt/3600);
        const next=project(x.simLat,x.simLng,heading,distanceKm);
        x.simLng=next[0];
        x.simLat=next[1];
      }

      x.marker.setLngLat([x.simLng,x.simLat]);
    }

    if(selectedId){
      redrawSelectedLines();
      if(followMode) chaseCamera(false);
    }
    raf=requestAnimationFrame(animate);
  }

  function clearAll(){
    deselect();
    for(const x of markers.values()) x.marker.remove();
    markers.clear();
    trails.clear();
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
      if(data.error) throw new Error(data.error.message||data.error.code||'AirLabs error');

      const rows=Array.isArray(data.response)?data.response:(Array.isArray(data)?data:[]);
      const seen=new Set();

      for(const a of rows){
        const lat=num(a.lat),lng=num(a.lng);
        if(lat===null||lng===null)continue;
        const id=idFor(a);
        seen.add(id);
        upsert(a);
      }

      for(const [id,x] of markers){
        if(!seen.has(id) && id!==selectedId){
          x.marker.remove();
          markers.delete(id);
        }
      }

      if(!selectedId){
        info().innerHTML=`<b>✈ Live Flights</b><span>${seen.size} aircraft loaded · tap a plane to inspect or follow it.</span>`;
      }
    }catch(err){
      console.error('AirLabs flights:',err);
      info().innerHTML=`<b>✈ Live Flights</b><span>${esc(err.message||'AirLabs could not refresh right now.')}</span>`;
    }finally{
      busy=false;
    }
  }

  function setEnabled(on){
    enabled=on;
    clearInterval(timer);timer=null;
    if(on){
      clearAll();
      info().innerHTML='<b>✈ Live Flights</b><span>Connecting to AirLabs…</span>';
      refresh();
      timer=setInterval(refresh,REFRESH_MS);
      if(!raf){
        lastFrame=performance.now();
        raf=requestAnimationFrame(animate);
      }
    }else{
      clearAll();
      info().innerHTML='<b>Flights</b><span>Live aircraft layer hidden.</span>';
    }
  }

  function hook(){
    const b=btn();
    if(!b)return;

    b.addEventListener('click',()=>setTimeout(()=>setEnabled(b.classList.contains('on')),0));

    map.on('moveend',()=>{
      if(!enabled || followMode)return;
      clearTimeout(moveTimer);
      moveTimer=setTimeout(refresh,500);
    });

    map.on('styledata',()=>{
      if(!selectedId)return;
      setTimeout(()=>{try{ensureRouteLayers();redrawSelectedLines()}catch(_){}},150);
    });
  }

  if(map.loaded())hook();
  else map.once('load',hook);
})();