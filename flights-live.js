/* UK Intelligent Map — Premium Flight Tracker + Real Cesium 3D Aircraft
   Replace ONLY flights-live.js

   What this version does:
   - Normal-map planes stay tied to real AirLabs coordinates.
   - No fake dead-reckoning.
   - Smooths ONLY between successive real AirLabs fixes.
   - Rich flight card with route, airline, aircraft, registration, times, gates, delay, squawk, etc.
   - "Route" shows the observed trail in 2D.
   - "3D View / Follow" switches to your existing Cesium + Google Photorealistic 3D map.
   - The aircraft in 3D is a REAL Cesium model entity at the real lat/lng/altitude.
   - The chase camera sits behind the actual model. It is NOT a screen-stuck picture.
*/

(()=>{
  const key=window.APP_CONFIG?.AIRLABS_API_KEY||'';
  const FLIGHTS='https://airlabs.co/api/v9/flights';
  const FLIGHT='https://airlabs.co/api/v9/flight';
  const AIRLINES='https://airlabs.co/api/v9/airlines';
  const MODEL_URL='https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb';

  const REFRESH_MS=20000;
  const fields='hex,reg_number,flight_iata,flight_icao,airline_iata,airline_icao,dep_iata,dep_icao,arr_iata,arr_icao,lat,lng,alt,dir,speed,v_speed,squawk,aircraft_icao,status,updated';

  const info=()=>document.querySelector('#info');
  const layerBtn=()=>document.querySelector('.layers button[data-layer="flights"]');

  let enabled=false,busy=false,timer=null,moveTimer=null;
  let selectedId=null,detailCache=new Map(),airlineCache=new Map();
  let follow3D=false,followTimer=null,followRAF=null,lastCam=0;
  let plane3D=null,trail3D=null,ahead3D=null;
  const items=new Map();
  const trails=new Map();

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const text=v=>(v===undefined||v===null||v==='')?'—':String(v);
  const fmtAlt=v=>num(v)!==null?`${Math.round(num(v)*3.28084).toLocaleString()} ft`:'—';
  const fmtKts=v=>num(v)!==null?`${Math.round(num(v)*0.539957)} kts`:'—';
  const fmtHeading=v=>num(v)!==null?`${Math.round(num(v))}°`:'—';
  const fmtVSpeed=v=>num(v)!==null?`${Math.round(num(v)*196.8504)} ft/min`:'—';
  const flightName=a=>String(a?.flight_iata||a?.flight_icao||a?.reg_number||a?.hex||'Unknown flight').trim();
  const idFor=a=>String(a.hex||a.flight_icao||a.flight_iata||a.reg_number||`${a.lat},${a.lng}`);

  injectCSS();

  function injectCSS(){
    if(document.querySelector('#premium-flight-css'))return;
    const st=document.createElement('style');
    st.id='premium-flight-css';
    st.textContent=`
      .pf-marker{width:34px;height:34px;border:0;background:transparent;padding:0;display:grid;place-items:center;cursor:pointer;filter:drop-shadow(0 2px 4px #000a)}
      .pf-marker svg{width:29px;height:29px;display:block;transform-origin:center;transition:width .15s,height .15s}
      .pf-marker.selected{filter:drop-shadow(0 0 5px rgba(95,202,255,.95)) drop-shadow(0 3px 6px #000b)}
      .pf-marker.selected svg{width:36px;height:36px}
      #pfSheet{position:absolute;z-index:44;left:12px;right:12px;bottom:72px;max-width:640px;margin:auto;background:rgba(7,11,13,.94);border:1px solid rgba(124,202,240,.24);border-radius:25px;box-shadow:0 20px 48px rgba(0,0,0,.48);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);display:none;overflow:hidden}
      #pfSheet.show{display:block}
      .pf-drag{width:54px;height:5px;border-radius:4px;background:#7c858a;margin:8px auto 3px;opacity:.7}
      .pf-head{display:flex;align-items:center;gap:11px;padding:10px 14px 9px}
      .pf-logo{width:46px;height:46px;border-radius:14px;background:#141c20;display:grid;place-items:center;font-size:24px}
      .pf-head-main{min-width:0;flex:1}.pf-head-main b{display:block;font-size:20px;letter-spacing:.2px}.pf-head-main span{display:block;color:#aab4b9;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pf-status{padding:7px 10px;border-radius:12px;background:#1b351b;color:#d8ff2f;font-size:11px;font-weight:900;text-transform:capitalize}
      .pf-close{width:36px;height:36px;border:1px solid rgba(255,255,255,.1);background:#151b1e;color:#fff;border-radius:50%;font-size:19px}
      .pf-route{display:grid;grid-template-columns:1fr auto 1fr auto;align-items:center;gap:10px;padding:12px 14px;border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)}
      .pf-airport strong{display:block;font-size:28px;line-height:1}.pf-airport small{display:block;color:#9faab0;font-size:10px;margin-top:5px}
      .pf-arrow{font-size:24px;color:#d8ff2f}.pf-live{padding:7px 9px;border-radius:11px;background:#171f22;color:#9fdcff;font-size:10px;font-weight:800}
      .pf-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:8px 10px 0}
      .pf-tab{height:36px;border:0;border-radius:12px;background:transparent;color:#9ca6aa;font-size:11px;font-weight:800}
      .pf-tab.active{background:#1d2528;color:#fff}
      .pf-pane{display:none;padding:12px 14px 10px}.pf-pane.active{display:block}
      .pf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px 8px}
      .pf-stat small{display:block;color:#8f9ba1;font-size:9px;text-transform:uppercase;letter-spacing:.4px}.pf-stat b{display:block;font-size:14px;margin-top:2px;word-break:break-word}
      .pf-actions{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:8px;padding:8px 12px 12px}
      .pf-actions button{height:46px;border-radius:16px;border:1px solid rgba(255,255,255,.11);background:#151c1f;color:#fff;font-weight:900;font-size:12px}
      .pf-actions .primary{background:#d8ff2f;color:#09100b;border-color:#d8ff2f}
      .pf-route-note{font-size:10px;color:#8f9ba1;line-height:1.45;margin-top:8px}
      .pf-more-list{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px}.pf-more-item{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)}.pf-more-item small{display:block;color:#87939a;font-size:9px}.pf-more-item b{display:block;font-size:12px;margin-top:2px}
      #pf3DHUD{position:absolute;inset:0;z-index:46;pointer-events:none;display:none}
      #pf3DHUD.show{display:block}
      .pf3d-vignette{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(2,7,11,.48),transparent 26%,transparent 68%,rgba(2,7,11,.52));pointer-events:none}
      .pf3d-top{position:absolute;top:max(88px,calc(env(safe-area-inset-top) + 72px));left:50%;transform:translateX(-50%);padding:11px 18px;border-radius:23px;background:rgba(7,12,13,.86);border:1px solid #c8ff36;color:#d8ff2f;font-weight:900;font-size:14px;backdrop-filter:blur(16px);white-space:nowrap}
      .pf3d-hdg{position:absolute;left:15px;top:170px;background:rgba(7,12,14,.86);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:10px 13px;text-align:center}.pf3d-hdg b{display:block;font-size:21px}.pf3d-hdg small{display:block;color:#99a6ac;font-size:9px}
      .pf3d-mini{position:absolute;left:12px;right:12px;bottom:80px;background:rgba(7,11,13,.91);border:1px solid rgba(124,202,240,.28);border-radius:23px;padding:12px;backdrop-filter:blur(22px);pointer-events:auto}
      .pf3d-mini .row{display:flex;align-items:center;gap:10px}.pf3d-mini .grow{flex:1;min-width:0}.pf3d-mini b{display:block}.pf3d-mini span{display:block;color:#a2adb2;font-size:10px;margin-top:2px}
      .pf3d-mini .route{font-size:22px;font-weight:900;margin-top:9px}.pf3d-mini .statsline{display:flex;gap:12px;color:#cbd4d8;font-size:11px;margin-top:7px;flex-wrap:wrap}
      .pf3d-buttons{display:flex;gap:7px;margin-top:10px}.pf3d-buttons button{height:44px;border-radius:15px;border:1px solid rgba(255,255,255,.12);background:#18201d;color:#fff;font-weight:900}.pf3d-exit{flex:1}.pf3d-z{width:44px}
      @media(max-width:700px){#pfSheet{bottom:72px}.pf-grid{grid-template-columns:repeat(2,1fr)}.pf-airport strong{font-size:24px}.pf-tabs{grid-template-columns:repeat(4,1fr)}}
    `;
    document.head.appendChild(st);
  }

  function markerSVG(){
    return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="pfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#dfe7eb"/><stop offset="1" stop-color="#82919a"/></linearGradient></defs>
      <path fill="url(#pfg)" stroke="#0c1419" stroke-width="1.3" d="M32 2c-2.5 0-4.1 4.3-4.1 8.8v13L8.4 34.1c-1.8 1-2.7 2.7-2.4 4.2.3 1.2 1.5 2 3 1.7l18.9-4.1v12.4l-6.4 5.3c-1 .9-1.4 2.1-.9 3.1.5 1 1.7 1.4 2.9.9l8.5-3.3 8.5 3.3c1.2.5 2.4.1 2.9-.9.5-1 .1-2.2-.9-3.1l-6.4-5.3V35.9L55 40c1.5.3 2.7-.5 3-1.7.3-1.5-.6-3.2-2.4-4.2L36.1 23.8v-13C36.1 6.3 34.5 2 32 2z"/>
      <circle cx="8" cy="38" r="2.4" fill="#ff3650"/><circle cx="56" cy="38" r="2.4" fill="#4eff7d"/>
    </svg>`;
  }

  function ensureSheet(){
    let s=document.querySelector('#pfSheet'); if(s)return s;
    s=document.createElement('div');s.id='pfSheet';
    s.innerHTML=`
      <div class="pf-drag"></div>
      <div class="pf-head">
        <div class="pf-logo">✈</div>
        <div class="pf-head-main"><b id="pfTitle">Flight</b><span id="pfAirline">Live aircraft</span></div>
        <div class="pf-status" id="pfStatus">en-route</div>
        <button class="pf-close" id="pfClose" type="button">×</button>
      </div>
      <div class="pf-route">
        <div class="pf-airport"><strong id="pfDep">?</strong><small id="pfDepName">Departure</small></div>
        <div class="pf-arrow">→</div>
        <div class="pf-airport"><strong id="pfArr">?</strong><small id="pfArrName">Destination</small></div>
        <div class="pf-live">LIVE</div>
      </div>
      <div class="pf-tabs">
        <button class="pf-tab active" data-pane="overview" type="button">Overview</button>
        <button class="pf-tab" data-pane="route" type="button">Route</button>
        <button class="pf-tab" data-pane="aircraft" type="button">Aircraft</button>
        <button class="pf-tab" data-pane="more" type="button">More</button>
      </div>
      <div class="pf-pane active" data-pane="overview"><div class="pf-grid" id="pfOverview"></div></div>
      <div class="pf-pane" data-pane="route"><div id="pfRoutePane"></div></div>
      <div class="pf-pane" data-pane="aircraft"><div class="pf-grid" id="pfAircraftPane"></div></div>
      <div class="pf-pane" data-pane="more"><div class="pf-more-list" id="pfMorePane"></div></div>
      <div class="pf-actions">
        <button class="primary" id="pfFollow" type="button">✈ Follow 3D</button>
        <button id="pfRouteBtn" type="button">⌁ Route</button>
        <button id="pfRefresh" type="button">↻ Refresh</button>
      </div>`;
    document.querySelector('#app').appendChild(s);
    s.querySelector('#pfClose').onclick=closeSelection;
    s.querySelector('#pfFollow').onclick=start3DFollow;
    s.querySelector('#pfRouteBtn').onclick=()=>showPane('route');
    s.querySelector('#pfRefresh').onclick=()=>selectedId&&loadDetails(items.get(selectedId)?.data,true);
    s.querySelectorAll('.pf-tab').forEach(b=>b.onclick=()=>showPane(b.dataset.pane));
    return s;
  }

  function showPane(name){
    const s=ensureSheet();
    s.querySelectorAll('.pf-tab').forEach(b=>b.classList.toggle('active',b.dataset.pane===name));
    s.querySelectorAll('.pf-pane').forEach(p=>p.classList.toggle('active',p.dataset.pane===name));
  }

  function ensureHUD(){
    let h=document.querySelector('#pf3DHUD');if(h)return h;
    h=document.createElement('div');h.id='pf3DHUD';
    h.innerHTML=`
      <div class="pf3d-vignette"></div>
      <div class="pf3d-top">✈ &nbsp; Following real aircraft in 3D</div>
      <div class="pf3d-hdg"><b id="pf3DHdg">—°</b><small>HEADING</small></div>
      <div class="pf3d-mini">
        <div class="row"><div class="pf-logo">✈</div><div class="grow"><b id="pf3DFlight">Flight</b><span id="pf3DAircraft">Aircraft</span></div><div class="pf-status" id="pf3DStatus">en-route</div></div>
        <div class="route"><span id="pf3DDep">?</span> &nbsp;→&nbsp; <span id="pf3DArr">?</span></div>
        <div class="statsline"><span id="pf3DAlt">—</span><span id="pf3DSpeed">—</span><span id="pf3DReg">—</span></div>
        <div class="pf3d-buttons"><button class="pf3d-exit" id="pf3DExit" type="button">✕ &nbsp; Exit Follow</button><button class="pf3d-z" id="pf3DZin" type="button">＋</button><button class="pf3d-z" id="pf3DZout" type="button">−</button></div>
      </div>`;
    document.querySelector('#app').appendChild(h);
    h.querySelector('#pf3DExit').onclick=stop3DFollow;
    h.querySelector('#pf3DZin').onclick=()=>viewer&&viewer.camera.zoomIn(550);
    h.querySelector('#pf3DZout').onclick=()=>viewer&&viewer.camera.zoomOut(550);
    return h;
  }

  function stat(label,value){return `<div class="pf-stat"><small>${esc(label)}</small><b>${esc(text(value))}</b></div>`}
  function more(label,value){return `<div class="pf-more-item"><small>${esc(label)}</small><b>${esc(text(value))}</b></div>`}

  function renderDetails(a){
    if(!a)return;
    const s=ensureSheet();
    const d=detailCache.get(idFor(a))||a;
    const airline=airlineCache.get(d.airline_iata||a.airline_iata)||{};
    s.classList.add('show');
    s.querySelector('#pfTitle').textContent=flightName(d);
    s.querySelector('#pfAirline').textContent=airline.name||d.airline_name||d.airline_iata||d.airline_icao||'Live aircraft';
    s.querySelector('#pfStatus').textContent=(d.status||'live').replace(/_/g,' ');
    s.querySelector('#pfDep').textContent=d.dep_iata||d.dep_icao||'?';
    s.querySelector('#pfArr').textContent=d.arr_iata||d.arr_icao||'?';
    s.querySelector('#pfDepName').textContent=d.dep_city||d.dep_name||'Departure';
    s.querySelector('#pfArrName').textContent=d.arr_city||d.arr_name||'Destination';

    s.querySelector('#pfOverview').innerHTML=
      stat('Altitude',fmtAlt(d.alt))+
      stat('Ground speed',fmtKts(d.speed))+
      stat('Heading',fmtHeading(d.dir))+
      stat('Vertical speed',fmtVSpeed(d.v_speed))+
      stat('Registration',d.reg_number)+
      stat('Aircraft',d.model||d.aircraft_icao);

    const tr=trails.get(idFor(a))||[];
    s.querySelector('#pfRoutePane').innerHTML=
      `<div class="pf-grid">${stat('From',d.dep_iata||d.dep_icao)}${stat('To',d.arr_iata||d.arr_icao)}${stat('Observed points',tr.length)}${stat('Status',d.status)}</div>
       <div class="pf-route-note">The blue trail is made from positions this map has actually observed. A future route line is not presented as an exact ATC path unless a source provides one.</div>`;

    s.querySelector('#pfAircraftPane').innerHTML=
      stat('Model',d.model||d.aircraft_icao)+
      stat('Manufacturer',d.manufacturer)+
      stat('Registration',d.reg_number)+
      stat('Built',d.built)+
      stat('Age',d.age!=null?`${d.age} years`:'—')+
      stat('Engines',d.engine_count?`${d.engine_count} × ${d.engine||'engine'}`:d.engine);

    s.querySelector('#pfMorePane').innerHTML=
      more('Flight ICAO',d.flight_icao)+more('Hex / ICAO24',d.hex)+
      more('Squawk',d.squawk)+more('Departure terminal',d.dep_terminal)+
      more('Departure gate',d.dep_gate)+more('Arrival terminal',d.arr_terminal)+
      more('Arrival gate',d.arr_gate)+more('Baggage',d.arr_baggage)+
      more('Scheduled departure',d.dep_time)+more('Actual departure',d.dep_actual||d.dep_estimated)+
      more('Scheduled arrival',d.arr_time)+more('Estimated arrival',d.arr_estimated)+
      more('Delay',d.delayed!=null?`${d.delayed} min`:'—')+more('Updated',d.updated?new Date(Number(d.updated)*1000).toLocaleTimeString():'—');
  }

  function bbox(){
    const b=map.getBounds();
    return `${clamp(b.getSouth(),-85,85).toFixed(4)},${clamp(b.getWest(),-180,180).toFixed(4)},${clamp(b.getNorth(),-85,85).toFixed(4)},${clamp(b.getEast(),-180,180).toFixed(4)}`;
  }

  function pushTrail(id,lng,lat,alt){
    if(lng==null||lat==null)return;
    const arr=trails.get(id)||[],last=arr[arr.length-1];
    if(!last||Math.abs(last.lng-lng)>.001||Math.abs(last.lat-lat)>.001){
      arr.push({lng,lat,alt:alt||0});
      if(arr.length>50)arr.shift();
      trails.set(id,arr);
    }
  }

  function upsert(a){
    const lat=num(a.lat),lng=num(a.lng);if(lat===null||lng===null)return;
    const id=idFor(a),now=Date.now();
    let x=items.get(id);
    if(!x){
      const el=document.createElement('button');el.type='button';el.className='pf-marker';el.innerHTML=markerSVG();
      const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
      x={id,el,marker,data:a,from:[lng,lat],to:[lng,lat],animStart:now,animEnd:now};
      items.set(id,x);
      el.onclick=e=>{e.stopPropagation();select(id)};
    }else{
      const p=x.marker.getLngLat();
      x.from=[p.lng,p.lat];x.to=[lng,lat];x.animStart=now;x.animEnd=now+5000;x.data={...x.data,...a};
    }
    x.el.querySelector('svg').style.transform=`rotate(${num(a.dir)||0}deg)`;
    pushTrail(id,lng,lat,num(a.alt)||0);
    if(selectedId===id)renderDetails(x.data);
  }

  function animate(){
    const now=Date.now();
    for(const x of items.values()){
      if(now>=x.animEnd||x.animEnd<=x.animStart){x.marker.setLngLat(x.to);continue}
      const t=clamp((now-x.animStart)/(x.animEnd-x.animStart),0,1),s=t*t*(3-2*t);
      x.marker.setLngLat([x.from[0]+(x.to[0]-x.from[0])*s,x.from[1]+(x.to[1]-x.from[1])*s]);
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  async function refresh(){
    if(!enabled||busy||follow3D)return;
    busy=true;
    try{
      const u=`${FLIGHTS}?bbox=${encodeURIComponent(bbox())}&_fields=${encodeURIComponent(fields)}&api_key=${encodeURIComponent(key)}`;
      const r=await fetch(u,{cache:'no-store'}),d=await r.json();
      if(!r.ok||d.error)throw new Error(d?.error?.message||`AirLabs HTTP ${r.status}`);
      const rows=Array.isArray(d.response)?d.response:[],seen=new Set();
      for(const a of rows){if(num(a.lat)===null||num(a.lng)===null)continue;seen.add(idFor(a));upsert(a)}
      for(const [id,x] of items)if(!seen.has(id)&&id!==selectedId){x.marker.remove();items.delete(id)}
      if(!selectedId)info().innerHTML=`<b>✈ Live Flights</b><span>${seen.size} real aircraft · tap one for full details.</span>`;
    }catch(e){console.error(e);info().innerHTML=`<b>✈ Live Flights</b><span>${esc(e.message||'Could not refresh flights.')}</span>`}
    finally{busy=false}
  }

  async function loadDetails(a,force=false){
    if(!a)return;
    const id=idFor(a);
    if(!force&&detailCache.has(id)){renderDetails(a);return}
    let d={...a};
    try{
      const q=a.flight_iata?`flight_iata=${encodeURIComponent(a.flight_iata)}`:a.flight_icao?`flight_icao=${encodeURIComponent(a.flight_icao)}`:'';
      if(q){
        const r=await fetch(`${FLIGHT}?${q}&api_key=${encodeURIComponent(key)}`,{cache:'no-store'});
        const j=await r.json();
        if(j.response)d={...d,...j.response};
      }
      detailCache.set(id,d);
      const airlineCode=d.airline_iata||a.airline_iata;
      if(airlineCode&&!airlineCache.has(airlineCode)){
        try{
          const ar=await fetch(`${AIRLINES}?iata_code=${encodeURIComponent(airlineCode)}&_fields=name,iata_code,icao_code,callsign,country_code&api_key=${encodeURIComponent(key)}`,{cache:'no-store'});
          const aj=await ar.json(),row=Array.isArray(aj.response)?aj.response[0]:null;
          if(row)airlineCache.set(airlineCode,row);
        }catch(_){}
      }
    }catch(e){console.warn('flight details',e)}
    renderDetails(d);
  }

  function select(id){
    if(selectedId&&items.get(selectedId))items.get(selectedId).el.classList.remove('selected');
    selectedId=id;
    const x=items.get(id);if(!x)return;
    x.el.classList.add('selected');
    renderDetails(x.data);
    loadDetails(x.data);
  }

  function closeSelection(){
    if(selectedId&&items.get(selectedId))items.get(selectedId).el.classList.remove('selected');
    selectedId=null;ensureSheet().classList.remove('show');
  }

  function project(lat,lon,bearingDeg,km){
    const R=6371,d=km/R,b=bearingDeg*Math.PI/180,p1=lat*Math.PI/180,l1=lon*Math.PI/180;
    const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(b));
    const l2=l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
    return {lat:p2*180/Math.PI,lng:((l2*180/Math.PI+540)%360)-180};
  }

  function remove3D(){
    if(!viewer)return;
    [plane3D,trail3D,ahead3D].forEach(e=>{if(e)try{viewer.entities.remove(e)}catch(_){}});
    plane3D=trail3D=ahead3D=null;
  }

  function update3DEntities(x){
    if(!viewer||viewer.isDestroyed())return;
    const a=x.data,lat=num(a.lat),lng=num(a.lng),alt=Math.max(300,num(a.alt)||3000),hdg=num(a.dir)||0;
    if(lat===null||lng===null)return;
    const pos=Cesium.Cartesian3.fromDegrees(lng,lat,alt);
    const hpr=new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(hdg),0,0);
    const orientation=Cesium.Transforms.headingPitchRollQuaternion(pos,hpr);

    if(!plane3D){
      plane3D=viewer.entities.add({
        name:flightName(a),position:pos,orientation,
        model:{uri:MODEL_URL,minimumPixelSize:96,maximumScale:2500,scale:1.35,runAnimations:true}
      });
    }else{plane3D.position=pos;plane3D.orientation=orientation}

    const tr=trails.get(x.id)||[];
    const arr=tr.flatMap(p=>[p.lng,p.lat,Math.max(300,p.alt||alt)]);
    if(arr.length>=6){
      const positions=Cesium.Cartesian3.fromDegreesArrayHeights(arr);
      if(!trail3D)trail3D=viewer.entities.add({polyline:{positions,width:5,material:new Cesium.PolylineGlowMaterialProperty({glowPower:.25,color:Cesium.Color.DEEPSKYBLUE})}});
      else trail3D.polyline.positions=positions;
    }

    const ahead=project(lat,lng,hdg,100);
    const apos=Cesium.Cartesian3.fromDegreesArrayHeights([lng,lat,alt,ahead.lng,ahead.lat,alt]);
    if(!ahead3D)ahead3D=viewer.entities.add({polyline:{positions:apos,width:2.5,material:new Cesium.PolylineDashMaterialProperty({color:Cesium.Color.fromCssColorString('#d8ff2f'),dashLength:18})}});
    else ahead3D.polyline.positions=apos;
  }

  function chaseCamera(x){
    if(!viewer||viewer.isDestroyed())return;
    const a=x.data,lat=num(a.lat),lng=num(a.lng),alt=Math.max(300,num(a.alt)||3000),hdg=num(a.dir)||0;
    const target=Cesium.Cartesian3.fromDegrees(lng,lat,alt);
    const transform=Cesium.Transforms.eastNorthUpToFixedFrame(target);
    const range=3800,above=1050,rad=Cesium.Math.toRadians(hdg);
    const offset=new Cesium.Cartesian3(-Math.sin(rad)*range,-Math.cos(rad)*range,above);
    viewer.camera.lookAtTransform(transform,offset);
    viewer.scene.requestRender();
  }

  function updateHUD(a){
    const h=ensureHUD();h.classList.add('show');
    const d=detailCache.get(idFor(a))||a;
    h.querySelector('#pf3DHdg').textContent=fmtHeading(d.dir);
    h.querySelector('#pf3DFlight').textContent=flightName(d);
    h.querySelector('#pf3DAircraft').textContent=[d.model||d.aircraft_icao,d.reg_number].filter(Boolean).join(' · ')||'Live aircraft';
    h.querySelector('#pf3DStatus').textContent=(d.status||'live').replace(/_/g,' ');
    h.querySelector('#pf3DDep').textContent=d.dep_iata||d.dep_icao||'?';
    h.querySelector('#pf3DArr').textContent=d.arr_iata||d.arr_icao||'?';
    h.querySelector('#pf3DAlt').textContent=fmtAlt(d.alt);
    h.querySelector('#pf3DSpeed').textContent=fmtKts(d.speed);
    h.querySelector('#pf3DReg').textContent=d.reg_number||'';
  }

  async function pollSelected3D(){
    if(!follow3D||!selectedId)return;
    const x=items.get(selectedId);if(!x)return;
    try{
      const q=x.data.hex?`hex=${encodeURIComponent(x.data.hex)}`:x.data.flight_iata?`flight_iata=${encodeURIComponent(x.data.flight_iata)}`:`flight_icao=${encodeURIComponent(x.data.flight_icao||'')}`;
      const r=await fetch(`${FLIGHTS}?${q}&_fields=${encodeURIComponent(fields)}&api_key=${encodeURIComponent(key)}`,{cache:'no-store'});
      const j=await r.json(),row=Array.isArray(j.response)?j.response[0]:null;
      if(row&&num(row.lat)!==null&&num(row.lng)!==null){
        x.data={...x.data,...row};
        pushTrail(x.id,num(row.lng),num(row.lat),num(row.alt)||0);
        updateHUD(x.data);
      }
    }catch(e){console.warn('3D flight refresh',e)}
  }

  async function start3DFollow(){
    if(!selectedId)return;
    const x=items.get(selectedId);if(!x)return;
    follow3D=true;clearInterval(timer);timer=null;
    ensureSheet().classList.remove('show');

    try{
      document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode==='3d'));
      await show3D();
    }catch(e){
      follow3D=false;info().innerHTML='<b>3D Follow unavailable</b><span>Could not open the 3D map.</span>';return
    }

    await loadDetails(x.data);
    updateHUD(x.data);
    update3DEntities(x);
    chaseCamera(x);

    if(followRAF)cancelAnimationFrame(followRAF);
    const loop=t=>{
      if(!follow3D)return;
      const cur=items.get(selectedId);
      if(cur){
        update3DEntities(cur);
        if(t-lastCam>700){chaseCamera(cur);lastCam=t}
      }
      followRAF=requestAnimationFrame(loop);
    };
    followRAF=requestAnimationFrame(loop);
    followTimer=setInterval(pollSelected3D,REFRESH_MS);
    setTimeout(pollSelected3D,1000);
  }

  function stop3DFollow(){
    follow3D=false;
    clearInterval(followTimer);followTimer=null;
    if(followRAF){cancelAnimationFrame(followRAF);followRAF=null}
    remove3D();
    ensureHUD().classList.remove('show');
    try{if(viewer)viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)}catch(_){}
    document.querySelector('#threeMap').style.display='none';
    document.querySelector('#navMap').style.display='block';
    document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode==='nav'));
    const x=selectedId?items.get(selectedId):null;
    if(x){
      const p=x.marker.getLngLat();map.jumpTo({center:[p.lng,p.lat],zoom:Math.max(map.getZoom(),9.5),pitch:35,bearing:0});
      renderDetails(x.data);
    }
    if(enabled){refresh();timer=setInterval(refresh,REFRESH_MS)}
  }

  function setEnabled(on){
    enabled=on;clearInterval(timer);timer=null;
    if(!on){
      if(follow3D)stop3DFollow();
      closeSelection();
      for(const x of items.values())x.marker.remove();
      items.clear();trails.clear();
      info().innerHTML='<b>Flights</b><span>Live aircraft layer hidden.</span>';
      return
    }
    info().innerHTML='<b>✈ Live Flights</b><span>Loading real AirLabs aircraft…</span>';
    refresh();timer=setInterval(refresh,REFRESH_MS);
  }

  function hook(){
    const b=layerBtn();if(!b)return;
    b.addEventListener('click',()=>setTimeout(()=>setEnabled(b.classList.contains('on')),0));
    map.on('moveend',()=>{if(!enabled||follow3D)return;clearTimeout(moveTimer);moveTimer=setTimeout(refresh,450)});
  }

  if(map.loaded())hook();else map.once('load',hook);
})();