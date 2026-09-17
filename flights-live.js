/* UK Intelligent Map — AirLabs CINEMATIC 3D FLIGHT FOLLOW
   Replace only flights-live.js

   Important behavior:
   - Normal map markers always represent the latest REAL AirLabs coordinates.
   - No dead-reckoning / fake movement.
   - When a new real AirLabs fix arrives, the marker eases between the two real fixes.
   - Follow Aircraft switches to the existing Cesium/Google Photorealistic 3D view.
   - Cinematic chase camera follows from behind the selected aircraft.
*/

(()=>{
  const AIRLABS='https://airlabs.co/api/v9/flights';
  const REFRESH_MS=20000;
  const fields='hex,reg_number,flight_iata,flight_icao,dep_iata,arr_iata,lat,lng,alt,dir,speed,aircraft_icao,status,updated';
  const key=window.APP_CONFIG?.AIRLABS_API_KEY || '';
  const info=()=>document.querySelector('#info');
  const flightsButton=()=>document.querySelector('.layers button[data-layer="flights"]');

  let enabled=false,busy=false,timer=null,moveTimer=null;
  let selectedId=null,follow=false,followRAF=null;
  let lastFollowCamera=0;
  const aircraft=new Map();
  const trails=new Map();

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  injectCSS();

  function injectCSS(){
    if(document.querySelector('#flight-cinema-css')) return;
    const st=document.createElement('style');
    st.id='flight-cinema-css';
    st.textContent=`
      .real-flight-marker{
        width:34px;height:34px;border:0;background:transparent;padding:0;
        display:grid;place-items:center;cursor:pointer;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.75));
      }
      .real-flight-marker svg{width:30px;height:30px;display:block;transform-origin:center}
      .real-flight-marker.selected{filter:drop-shadow(0 0 5px rgba(77,197,255,.95)) drop-shadow(0 3px 6px rgba(0,0,0,.9))}
      .real-flight-marker.selected svg{width:36px;height:36px}

      #flightCinema{
        position:absolute;inset:0;z-index:45;pointer-events:none;display:none;
      }
      #flightCinema.show{display:block}
      #flightCinema .cinema-vignette{
        position:absolute;inset:0;
        background:
          linear-gradient(to bottom,rgba(1,7,13,.52) 0%,rgba(1,7,13,.10) 22%,transparent 48%,rgba(1,7,13,.15) 68%,rgba(1,7,13,.50) 100%),
          radial-gradient(circle at center,transparent 42%,rgba(0,0,0,.28) 100%);
      }
      #flightCinema .cinema-top{
        position:absolute;top:max(88px,calc(env(safe-area-inset-top) + 74px));left:50%;transform:translateX(-50%);
        display:flex;align-items:center;gap:9px;pointer-events:auto;
      }
      #flightCinema .follow-pill{
        height:46px;padding:0 20px;border-radius:25px;border:1px solid #bfff2a;
        background:rgba(8,15,12,.86);color:#d8ff2f;font-size:14px;font-weight:900;
        box-shadow:0 0 18px rgba(216,255,47,.18);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      }
      #flightCinema .heading-box{
        position:absolute;top:170px;left:17px;min-width:76px;padding:9px 11px;border-radius:15px;
        background:rgba(7,14,17,.82);border:1px solid rgba(255,255,255,.13);text-align:center;
        backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      }
      #flightCinema .heading-box b{display:block;font-size:18px}
      #flightCinema .heading-box small{display:block;color:#aab5ba;font-size:10px;margin-top:2px}
      #flightCinema .destination{
        position:absolute;top:25%;left:50%;transform:translateX(-50%);
        padding:7px 11px;border-radius:13px;background:rgba(8,15,18,.80);
        border:1px solid rgba(255,255,255,.13);text-align:center;backdrop-filter:blur(14px);
      }
      #flightCinema .destination b{display:block;font-size:14px}
      #flightCinema .destination small{display:block;color:#b0bbc0;font-size:10px;margin-top:2px}
      #flightCinema .hero-plane{
        position:absolute;left:50%;bottom:34%;transform:translateX(-50%);
        width:160px;height:150px;display:grid;place-items:center;
        filter:drop-shadow(0 15px 14px rgba(0,0,0,.55));
      }
      #flightCinema .hero-plane svg{width:100%;height:100%;overflow:visible}
      #flightCinema .hero-plane:after{
        content:"";position:absolute;left:50%;top:75%;transform:translateX(-50%);
        width:18px;height:170px;border-radius:50%;
        background:linear-gradient(to bottom,rgba(255,255,255,.40),rgba(185,224,255,.14),transparent);
        filter:blur(7px);
      }
      #flightCinema .flight-card{
        position:absolute;left:14px;right:14px;bottom:max(82px,calc(env(safe-area-inset-bottom) + 70px));
        padding:15px;border-radius:24px;border:1px solid rgba(107,190,234,.36);
        background:rgba(5,12,16,.90);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
        box-shadow:0 18px 42px rgba(0,0,0,.46);pointer-events:auto;
      }
      #flightCinema .card-head{display:flex;align-items:center;gap:10px}
      #flightCinema .airline-mark{width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-size:23px}
      #flightCinema .card-title{flex:1;min-width:0}
      #flightCinema .card-title b{display:block;font-size:20px}
      #flightCinema .card-title span{display:block;color:#aeb9be;font-size:11px;margin-top:2px}
      #flightCinema .status{padding:7px 10px;border-radius:12px;background:rgba(114,168,55,.22);color:#d8ff2f;font-weight:800;font-size:11px}
      #flightCinema .card-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px;margin-top:13px}
      #flightCinema .route-big{font-size:25px;font-weight:900;letter-spacing:.5px}
      #flightCinema .route-small{color:#aeb9be;font-size:10px;margin-top:2px}
      #flightCinema .stats{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;border-left:1px solid rgba(255,255,255,.10);padding-left:12px}
      #flightCinema .stats small{display:block;color:#9ba8ae;font-size:9px}
      #flightCinema .stats b{display:block;font-size:14px;margin-top:2px}
      #flightCinema .exit-row{display:flex;gap:8px;margin-top:13px}
      #flightCinema .exit-btn{flex:1;height:46px;border-radius:17px;border:1px solid rgba(255,255,255,.13);background:#18211d;color:white;font-weight:900}
      #flightCinema .map-btn{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.13);background:#18211d;color:#fff;font-size:19px}
      .flight-normal-card{
        position:absolute;z-index:42;left:50%;transform:translateX(-50%);bottom:84px;
        width:min(480px,calc(100% - 28px));padding:12px;border-radius:20px;
        background:rgba(6,13,14,.90);border:1px solid rgba(255,255,255,.13);
        backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:none;
      }
      .flight-normal-card.show{display:block}
      .flight-normal-card .row{display:flex;align-items:center;gap:10px}
      .flight-normal-card .txt{flex:1;min-width:0}
      .flight-normal-card b{display:block}
      .flight-normal-card span{display:block;color:#aab5b1;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .flight-normal-card button{height:42px;border:0;border-radius:15px;padding:0 14px;background:#d8ff2f;color:#0b0f0c;font-weight:900}
      @media(max-width:700px){
        #flightCinema .hero-plane{width:140px;height:132px;bottom:35%}
        #flightCinema .flight-card{padding:13px}
        #flightCinema .route-big{font-size:22px}
      }
    `;
    document.head.appendChild(st);
  }

  function markerSVG(){
    return `
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs><linearGradient id="fmgrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#e6edf1"/><stop offset="1" stop-color="#8997a0"/>
        </linearGradient></defs>
        <path fill="url(#fmgrad)" stroke="#0a1117" stroke-width="1.2"
          d="M32 2c-2.5 0-4.1 4.3-4.1 8.8v13L8.4 34.1c-1.8 1-2.7 2.7-2.4 4.2.3 1.2 1.5 2 3 1.7l18.9-4.1v12.4l-6.4 5.3c-1 .9-1.4 2.1-.9 3.1.5 1 1.7 1.4 2.9.9l8.5-3.3 8.5 3.3c1.2.5 2.4.1 2.9-.9.5-1 .1-2.2-.9-3.1l-6.4-5.3V35.9L55 40c1.5.3 2.7-.5 3-1.7.3-1.5-.6-3.2-2.4-4.2L36.1 23.8v-13C36.1 6.3 34.5 2 32 2z"/>
        <circle cx="8" cy="38" r="2.6" fill="#ff3150"/><circle cx="56" cy="38" r="2.6" fill="#4cff79"/>
      </svg>`;
  }

  function heroPlaneSVG(){
    return `
      <svg viewBox="0 0 210 180" aria-hidden="true">
        <defs>
          <linearGradient id="heroBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#dbe3e8"/><stop offset=".78" stop-color="#7f8d96"/><stop offset="1" stop-color="#343c42"/>
          </linearGradient>
          <linearGradient id="heroWing" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#76838b"/><stop offset=".5" stop-color="#eef3f5"/><stop offset="1" stop-color="#69767e"/>
          </linearGradient>
        </defs>
        <path fill="url(#heroWing)" stroke="#263038" stroke-width="2" d="M103 78 L18 119 L12 132 L99 110 Z"/>
        <path fill="url(#heroWing)" stroke="#263038" stroke-width="2" d="M107 78 L192 119 L198 132 L111 110 Z"/>
        <path fill="url(#heroWing)" stroke="#263038" stroke-width="2" d="M101 132 L62 153 L60 163 L103 151 Z"/>
        <path fill="url(#heroWing)" stroke="#263038" stroke-width="2" d="M109 132 L148 153 L150 163 L107 151 Z"/>
        <path fill="url(#heroBody)" stroke="#263038" stroke-width="2.2" d="M105 18 C94 18 91 47 92 76 L96 142 C97 161 101 174 105 176 C109 174 113 161 114 142 L118 76 C119 47 116 18 105 18 Z"/>
        <path d="M105 25 L105 166" stroke="rgba(255,255,255,.72)" stroke-width="2"/>
        <circle cx="17" cy="127" r="5" fill="#ff2645" filter="drop-shadow(0 0 7px #ff2645)"/>
        <circle cx="193" cy="127" r="5" fill="#48ff76" filter="drop-shadow(0 0 7px #48ff76)"/>
      </svg>`;
  }

  function ensureNormalCard(){
    let c=document.querySelector('#flightNormalCard');
    if(c) return c;
    c=document.createElement('div');
    c.id='flightNormalCard';
    c.className='flight-normal-card';
    c.innerHTML=`<div class="row"><div class="txt"><b id="fnTitle">Aircraft</b><span id="fnSub">Live flight</span></div><button id="fnFollow" type="button">✈ Follow Aircraft</button></div>`;
    document.querySelector('#app').appendChild(c);
    c.querySelector('#fnFollow').addEventListener('click',startFollow);
    return c;
  }

  function ensureCinema(){
    let c=document.querySelector('#flightCinema');
    if(c) return c;
    c=document.createElement('div');
    c.id='flightCinema';
    c.innerHTML=`
      <div class="cinema-vignette"></div>
      <div class="cinema-top"><button class="follow-pill" type="button">✈ &nbsp; Following Aircraft</button></div>
      <div class="heading-box"><b id="cinHeading">—°</b><small>HDG</small></div>
      <div class="destination"><b id="cinDest">DEST</b><small id="cinDestSub">destination guide</small></div>
      <div class="hero-plane">${heroPlaneSVG()}</div>
      <div class="flight-card">
        <div class="card-head">
          <div class="airline-mark">✈</div>
          <div class="card-title"><b id="cinFlight">Flight</b><span id="cinType">Live aircraft</span></div>
          <div class="status" id="cinStatus">En Route</div>
        </div>
        <div class="card-grid">
          <div>
            <div class="route-big"><span id="cinDep">?</span> &nbsp;→&nbsp; <span id="cinArr">?</span></div>
            <div class="route-small">Departure &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Destination</div>
          </div>
          <div class="stats">
            <div><small>Altitude</small><b id="cinAlt">—</b></div>
            <div><small>Speed</small><b id="cinSpeed">—</b></div>
            <div><small>Heading</small><b id="cinHeading2">—</b></div>
            <div><small>Aircraft</small><b id="cinAircraft">—</b></div>
          </div>
        </div>
        <div class="exit-row">
          <button class="exit-btn" id="cinExit" type="button">✕ &nbsp; Exit Follow</button>
          <button class="map-btn" id="cinZoomIn" type="button">＋</button>
          <button class="map-btn" id="cinZoomOut" type="button">−</button>
        </div>
      </div>`;
    document.querySelector('#app').appendChild(c);
    c.querySelector('#cinExit').addEventListener('click',stopFollow);
    c.querySelector('#cinZoomIn').addEventListener('click',()=>{ if(viewer) viewer.camera.zoomIn(350); });
    c.querySelector('#cinZoomOut').addEventListener('click',()=>{ if(viewer) viewer.camera.zoomOut(350); });
    return c;
  }

  function bbox(){
    const b=map.getBounds();
    return `${clamp(b.getSouth(),-85,85).toFixed(4)},${clamp(b.getWest(),-180,180).toFixed(4)},${clamp(b.getNorth(),-85,85).toFixed(4)},${clamp(b.getEast(),-180,180).toFixed(4)}`;
  }

  function idFor(a){
    return String(a.hex||a.flight_icao||a.flight_iata||a.reg_number||`${a.lat},${a.lng}`);
  }

  function flightName(a){
    return String(a.flight_iata||a.flight_icao||a.reg_number||a.hex||'Unknown flight').trim();
  }

  function pushTrail(id,lng,lat,alt){
    const arr=trails.get(id)||[];
    const last=arr[arr.length-1];
    if(!last || Math.abs(last.lng-lng)>.001 || Math.abs(last.lat-lat)>.001){
      arr.push({lng,lat,alt});
      if(arr.length>28) arr.splice(0,arr.length-28);
      trails.set(id,arr);
    }
  }

  function select(id){
    if(selectedId && aircraft.get(selectedId)) aircraft.get(selectedId).el.classList.remove('selected');
    selectedId=id;
    const x=aircraft.get(id);
    if(!x) return;
    x.el.classList.add('selected');
    const card=ensureNormalCard();
    card.classList.add('show');
    card.querySelector('#fnTitle').textContent=flightName(x.data);
    const route=(x.data.dep_iata||x.data.arr_iata)?`${x.data.dep_iata||'?'} → ${x.data.arr_iata||'?'}`:'Live aircraft';
    const alt=num(x.data.alt)!==null?`${Math.round(num(x.data.alt)*3.28084).toLocaleString()} ft`:'';
    card.querySelector('#fnSub').textContent=[route,alt].filter(Boolean).join(' · ');
  }

  function deselect(){
    if(selectedId && aircraft.get(selectedId)) aircraft.get(selectedId).el.classList.remove('selected');
    selectedId=null;
    const c=document.querySelector('#flightNormalCard');
    if(c)c.classList.remove('show');
  }

  function createMarker(a){
    const el=document.createElement('button');
    el.type='button';
    el.className='real-flight-marker';
    el.innerHTML=markerSVG();
    const heading=num(a.dir)??0;
    el.querySelector('svg').style.transform=`rotate(${heading}deg)`;
    return el;
  }

  function upsert(a){
    const lat=num(a.lat),lng=num(a.lng);
    if(lat===null||lng===null) return;
    const id=idFor(a);
    let x=aircraft.get(id);
    const now=Date.now();

    if(!x){
      const el=createMarker(a);
      const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
      x={id,el,marker,data:a,from:[lng,lat],to:[lng,lat],animStart:now,animEnd:now};
      aircraft.set(id,x);
      el.addEventListener('click',e=>{e.stopPropagation();select(id);});
    }else{
      const current=x.marker.getLngLat();
      x.from=[current.lng,current.lat];
      x.to=[lng,lat];
      x.animStart=now;
      x.animEnd=now+Math.min(6000,REFRESH_MS*.30);
      x.data=a;
    }

    x.el.querySelector('svg').style.transform=`rotate(${num(a.dir)??0}deg)`;
    pushTrail(id,lng,lat,num(a.alt)??0);
    if(selectedId===id) select(id);
  }

  function easeRealMarkers(){
    const now=Date.now();
    for(const x of aircraft.values()){
      if(x.animEnd<=x.animStart || now>=x.animEnd){
        x.marker.setLngLat(x.to);
        continue;
      }
      const t=clamp((now-x.animStart)/(x.animEnd-x.animStart),0,1);
      const s=t*t*(3-2*t);
      x.marker.setLngLat([
        x.from[0]+(x.to[0]-x.from[0])*s,
        x.from[1]+(x.to[1]-x.from[1])*s
      ]);
    }
    requestAnimationFrame(easeRealMarkers);
  }
  requestAnimationFrame(easeRealMarkers);

  async function refresh(){
    if(!enabled||busy||follow)return;
    if(!key){
      info().innerHTML='<b>✈ Live Flights</b><span>AIRLABS_API_KEY is missing.</span>';
      return;
    }
    busy=true;
    try{
      const url=`${AIRLABS}?bbox=${encodeURIComponent(bbox())}&_fields=${encodeURIComponent(fields)}&api_key=${encodeURIComponent(key)}`;
      const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(`AirLabs HTTP ${r.status}`);
      if(data.error) throw new Error(data.error.message||data.error.code||'AirLabs error');

      const rows=Array.isArray(data.response)?data.response:[];
      const seen=new Set();

      for(const a of rows){
        if(num(a.lat)===null||num(a.lng)===null)continue;
        const id=idFor(a);seen.add(id);upsert(a);
      }

      for(const [id,x] of aircraft){
        if(!seen.has(id) && id!==selectedId){
          x.marker.remove();aircraft.delete(id);
        }
      }

      if(!selectedId) info().innerHTML=`<b>✈ Live Flights</b><span>${seen.size} real aircraft positions · tap a plane to follow it in 3D.</span>`;
    }catch(err){
      console.error('AirLabs flights',err);
      info().innerHTML=`<b>✈ Live Flights</b><span>${esc(err.message||'Could not refresh live flights.')}</span>`;
    }finally{busy=false;}
  }

  function project(lat,lon,bearingDeg,distanceKm){
    const R=6371,d=distanceKm/R,b=bearingDeg*Math.PI/180,p1=lat*Math.PI/180,l1=lon*Math.PI/180;
    const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(b));
    const l2=l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
    return {lat:p2*180/Math.PI,lng:((l2*180/Math.PI+540)%360)-180};
  }

  function updateCinemaUI(a){
    const c=ensureCinema();
    c.querySelector('#cinFlight').textContent=flightName(a);
    c.querySelector('#cinType').textContent=[a.aircraft_icao,a.reg_number].filter(Boolean).join(' · ')||'Live aircraft';
    c.querySelector('#cinStatus').textContent=(a.status||'en-route').replace(/_/g,' ');
    c.querySelector('#cinDep').textContent=a.dep_iata||'?';
    c.querySelector('#cinArr').textContent=a.arr_iata||'?';
    const alt=num(a.alt);
    const speed=num(a.speed);
    const dir=num(a.dir);
    c.querySelector('#cinAlt').textContent=alt!==null?`${Math.round(alt*3.28084).toLocaleString()} ft`:'—';
    c.querySelector('#cinSpeed').textContent=speed!==null?`${Math.round(speed*0.621371)} mph`:'—';
    c.querySelector('#cinHeading').textContent=dir!==null?`${Math.round(dir)}°`:'—°';
    c.querySelector('#cinHeading2').textContent=dir!==null?`${Math.round(dir)}°`:'—';
    c.querySelector('#cinAircraft').textContent=a.aircraft_icao||'—';
    c.querySelector('#cinDest').textContent=a.arr_iata||'Ahead';
    c.querySelector('#cinDestSub').textContent=a.arr_iata?'destination':'heading guide';
  }

  let cesiumPlaneEntity=null,cesiumTrailEntity=null,cesiumAheadEntity=null;

  function removeCesiumFlightEntities(){
    if(!viewer) return;
    for(const e of [cesiumPlaneEntity,cesiumTrailEntity,cesiumAheadEntity]){
      if(e) try{viewer.entities.remove(e)}catch(_){}
    }
    cesiumPlaneEntity=cesiumTrailEntity=cesiumAheadEntity=null;
  }

  function updateCesiumScene(x){
    if(!viewer||viewer.isDestroyed()) return;
    const a=x.data,lat=num(a.lat),lng=num(a.lng);
    if(lat===null||lng===null)return;
    const altM=Math.max(500,num(a.alt)??9000);
    const heading=num(a.dir)??0;

    if(!cesiumPlaneEntity){
      cesiumPlaneEntity=viewer.entities.add({
        position:Cesium.Cartesian3.fromDegrees(lng,lat,altM),
        point:{
          pixelSize:10,color:Cesium.Color.WHITE,
          outlineColor:Cesium.Color.CYAN,outlineWidth:2,
          disableDepthTestDistance:Number.POSITIVE_INFINITY
        }
      });
    }else{
      cesiumPlaneEntity.position=Cesium.Cartesian3.fromDegrees(lng,lat,altM);
    }

    const trail=trails.get(x.id)||[];
    const trailPos=trail.flatMap(p=>[p.lng,p.lat,Math.max(500,p.alt||altM)]);
    if(trailPos.length>=6){
      if(!cesiumTrailEntity){
        cesiumTrailEntity=viewer.entities.add({
          polyline:{
            positions:Cesium.Cartesian3.fromDegreesArrayHeights(trailPos),
            width:4,
            material:new Cesium.PolylineGlowMaterialProperty({glowPower:.28,color:Cesium.Color.DEEPSKYBLUE})
          }
        });
      }else{
        cesiumTrailEntity.polyline.positions=Cesium.Cartesian3.fromDegreesArrayHeights(trailPos);
      }
    }

    const ahead=project(lat,lng,heading,120);
    const aheadPos=Cesium.Cartesian3.fromDegreesArrayHeights([lng,lat,altM,ahead.lng,ahead.lat,altM]);
    if(!cesiumAheadEntity){
      cesiumAheadEntity=viewer.entities.add({
        polyline:{
          positions:aheadPos,width:3,
          material:new Cesium.PolylineDashMaterialProperty({color:Cesium.Color.fromCssColorString('#d8ff2f'),dashLength:18})
        }
      });
    }else{
      cesiumAheadEntity.polyline.positions=aheadPos;
    }
  }

  function updateChaseCamera(x){
    if(!viewer||viewer.isDestroyed()) return;
    const a=x.data,lat=num(a.lat),lng=num(a.lng);
    if(lat===null||lng===null)return;
    const altM=Math.max(800,num(a.alt)??9000);
    const heading=num(a.dir)??0;

    // Camera roughly 2.8 km behind and 650 m above the aircraft.
    const behind=project(lat,lng,(heading+180)%360,2.8);
    viewer.camera.setView({
      destination:Cesium.Cartesian3.fromDegrees(behind.lng,behind.lat,altM+650),
      orientation:{
        heading:Cesium.Math.toRadians(heading),
        pitch:Cesium.Math.toRadians(-11),
        roll:0
      }
    });
    viewer.scene.requestRender();
  }

  async function pollSelected(){
    if(!follow||!selectedId||!key)return;
    const x=aircraft.get(selectedId);
    if(!x)return;
    try{
      const a=x.data;
      const q=a.flight_iata?`flight_iata=${encodeURIComponent(a.flight_iata)}`:
              a.flight_icao?`flight_icao=${encodeURIComponent(a.flight_icao)}`:
              a.hex?`hex=${encodeURIComponent(a.hex)}`:'';
      if(!q)return;
      const url=`${AIRLABS}?${q}&_fields=${encodeURIComponent(fields)}&api_key=${encodeURIComponent(key)}`;
      const r=await fetch(url,{cache:'no-store'});
      const d=await r.json();
      const row=Array.isArray(d.response)&&d.response[0]?d.response[0]:null;
      if(row && num(row.lat)!==null && num(row.lng)!==null){
        x.data={...x.data,...row};
        pushTrail(x.id,num(row.lng),num(row.lat),num(row.alt)??0);
        updateCinemaUI(x.data);
      }
    }catch(e){console.warn('Selected flight refresh',e)}
  }

  async function startFollow(){
    if(!selectedId)return;
    const x=aircraft.get(selectedId);
    if(!x)return;
    follow=true;
    clearInterval(timer);timer=null;

    // Switch to the existing Cesium/Google Photorealistic 3D map.
    try{
      document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode==='3d'));
      await show3D();
    }catch(e){
      follow=false;
      info().innerHTML='<b>3D Follow unavailable</b><span>Could not open the 3D map.</span>';
      return;
    }

    document.querySelector('#flightNormalCard')?.classList.remove('show');
    const cinema=ensureCinema();
    cinema.classList.add('show');
    updateCinemaUI(x.data);
    updateCesiumScene(x);
    updateChaseCamera(x);

    if(followRAF)cancelAnimationFrame(followRAF);
    const loop=(ts)=>{
      if(!follow)return;
      const current=aircraft.get(selectedId);
      if(current){
        updateCesiumScene(current);
        if(ts-lastFollowCamera>650){
          updateChaseCamera(current);
          lastFollowCamera=ts;
        }
      }
      followRAF=requestAnimationFrame(loop);
    };
    followRAF=requestAnimationFrame(loop);

    // Refresh just the selected real flight while following.
    timer=setInterval(pollSelected,REFRESH_MS);
    setTimeout(pollSelected,1000);
  }

  function stopFollow(){
    follow=false;
    if(followRAF){cancelAnimationFrame(followRAF);followRAF=null}
    clearInterval(timer);timer=null;
    removeCesiumFlightEntities();
    document.querySelector('#flightCinema')?.classList.remove('show');

    // Return to Navigation map and selected real coordinate.
    document.querySelector('#threeMap').style.display='none';
    document.querySelector('#navMap').style.display='block';
    document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode==='nav'));
    const x=selectedId?aircraft.get(selectedId):null;
    if(x){
      const p=x.marker.getLngLat();
      map.jumpTo({center:[p.lng,p.lat],zoom:Math.max(map.getZoom(),9.5),pitch:38,bearing:0});
      select(selectedId);
    }
    if(enabled){
      refresh();
      timer=setInterval(refresh,REFRESH_MS);
    }
  }

  function setEnabled(on){
    enabled=on;
    clearInterval(timer);timer=null;
    if(!on){
      if(follow)stopFollow();
      deselect();
      for(const x of aircraft.values())x.marker.remove();
      aircraft.clear();trails.clear();
      info().innerHTML='<b>Flights</b><span>Live aircraft layer hidden.</span>';
      return;
    }
    info().innerHTML='<b>✈ Live Flights</b><span>Loading real AirLabs aircraft positions…</span>';
    refresh();
    timer=setInterval(refresh,REFRESH_MS);
  }

  function hook(){
    const b=flightsButton();if(!b)return;
    b.addEventListener('click',()=>setTimeout(()=>setEnabled(b.classList.contains('on')),0));
    map.on('moveend',()=>{
      if(!enabled||follow)return;
      clearTimeout(moveTimer);
      moveTimer=setTimeout(refresh,500);
    });
  }

  if(map.loaded())hook();else map.once('load',hook);
})();