const info=document.querySelector('#info'), title=document.querySelector('#voiceTitle');

// TEMPORARY VISIBLE DIAGNOSTICS (useful on iPhone without Safari developer console)
function showDiagnostic(label, value){
  let msg;
  try {
    if (value && typeof value === 'object') {
      msg = [
        value.name ? 'Name: '+value.name : '',
        value.message ? 'Message: '+value.message : '',
        value.statusCode ? 'HTTP: '+value.statusCode : '',
        value.response ? 'Response: '+JSON.stringify(value.response) : '',
        value.stack ? 'Stack: '+value.stack : '',
        'Raw: '+JSON.stringify(value, Object.getOwnPropertyNames(value))
      ].filter(Boolean).join('\n');
    } else {
      msg = String(value);
    }
  } catch (_) { msg = String(value); }
  console.error(label, value);
  if(info) info.innerHTML='<b>⚠️ '+label+'</b><span style="white-space:pre-wrap;word-break:break-word">'+
    msg.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</span>';
}
window.addEventListener('error', e=>showDiagnostic('JavaScript error', e.error || e.message));
window.addEventListener('unhandledrejection', e=>showDiagnostic('Promise error', e.reason));

const map=new maplibregl.Map({container:'navMap',style:'https://tiles.openfreemap.org/styles/dark',center:[-2.24,51.86],zoom:10.5,pitch:28,bearing:-12,attributionControl:true});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
const points={cctv:[[-2.18,51.86],[-2.29,51.83]],speed:[[-2.22,51.82]],trains:[[-2.238,51.865]],buses:[[-2.245,51.87]],flights:[[-2.05,51.89]],parking:[[-2.25,51.85]]};
const emoji={cctv:'📹',speed:'📸',trains:'🚆',buses:'🚌',flights:'✈️',parking:'🅿️'};let markers={};
map.on('load',()=>{map.addSource('traffic',{type:'geojson',data:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[-2.43,51.74],[-2.35,51.78],[-2.28,51.84],[-2.21,51.91],[-2.12,51.98]]}}]}});map.addLayer({id:'traffic',type:'line',source:'traffic',paint:{'line-width':8,'line-color':['interpolate',['linear'],['zoom'],8,'#20c86a',12,'#ffb000']}});});
function toggleMarkers(k,on){if(!markers[k]) markers[k]=(points[k]||[]).map(p=>{let el=document.createElement('div');el.textContent=emoji[k];el.style.cssText='font-size:25px;background:white;border-radius:50%;padding:5px;box-shadow:0 4px 12px #0008';return new maplibregl.Marker({element:el}).setLngLat(p).addTo(map)});markers[k].forEach(m=>m.getElement().style.display=on?'block':'none')}
document.querySelectorAll('.layers button').forEach(b=>b.onclick=()=>{b.classList.toggle('on');let k=b.dataset.layer,on=b.classList.contains('on');if(k==='traffic'){if(map.getLayer('traffic'))map.setLayoutProperty('traffic','visibility',on?'visible':'none')}else toggleMarkers(k,on);info.innerHTML=`<b>${b.textContent.trim()}</b><span>${on?'Layer enabled':'Layer hidden'} — demo data in this prototype.</span>`});
// Paste your PUBLIC, read-only Cesium ion token between the quotes below.
// Keep private/write scopes disabled and restrict the token to your site in Cesium ion.
const CESIUM_ION_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjB5TURTMzZTNGdJa29LTUIiLCJqdGkiOiJjMTZmYzM4MS1mOGFkLTQ5NzQtOGE4My1lODhkNjhlNjY2YzEiLCJpZCI6NDk3NzMyLCJzdWIiOiJha2FyYW53YXJ5LW5ldGl6ZW4iLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiVWsgbWFwIiwiaWF0IjoxNzg5NjAxMjM4fQ.P8ZvLq4hqIfVBpJclJaj7QhRCNny5r7XkhM-z0MAWaE';

let viewer,googleTileset;
async function show3D(){
  document.querySelector('#navMap').style.display='none';
  document.querySelector('#threeMap').style.display='block';

  if(!viewer){
    if(!CESIUM_ION_TOKEN){
      info.innerHTML='<b>3D token needed</b><span>Open app.js and replace eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjB5TURTMzZTNGdJa29LTUIiLCJqdGkiOiJjMTZmYzM4MS1mOGFkLTQ5NzQtOGE4My1lODhkNjhlNjY2YzEiLCJpZCI6NDk3NzMyLCJzdWIiOiJha2FyYW53YXJ5LW5ldGl6ZW4iLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiVWsgbWFwIiwiaWF0IjoxNzg5NjAxMjM4fQ.P8ZvLq4hqIfVBpJclJaj7QhRCNny5r7XkhM-z0MAWaE with your public read-only Cesium ion token.</span>';
      return;
    }

    Cesium.Ion.defaultAccessToken=CESIUM_ION_TOKEN;
    info.innerHTML='<b>3D diagnostic</b><span>Step 1: creating Cesium Viewer…</span>';
    viewer=new Cesium.Viewer('threeMap',{
      geocoder:Cesium.IonGeocodeProviderType.GOOGLE,homeButton:false,sceneModePicker:false,baseLayerPicker:false,
      navigationHelpButton:false,animation:false,timeline:false,fullscreenButton:false,
      infoBox:false,selectionIndicator:false,globe:false
    });

    try{
      info.innerHTML='<b>3D diagnostic</b><span>Step 2: requesting ion asset 2275207…</span>';
      googleTileset=viewer.scene.primitives.add(
        await Cesium.Cesium3DTileset.fromIonAssetId(2275207)
      );
      const c=lastUserLocation ? {lng:lastUserLocation.lng,lat:lastUserLocation.lat} : map.getCenter();
      viewer.camera.setView({
        destination:Cesium.Cartesian3.fromDegrees(c.lng,c.lat,lastUserLocation?900:1800),
        orientation:{
          heading:Cesium.Math.toRadians(-12),
          pitch:Cesium.Math.toRadians(-48),
          roll:0
        }
      });
      info.innerHTML='<b>3D Realistic Map</b><span>Photorealistic 3D Tiles connected through Cesium ion.</span>';
    }catch(err){
      showDiagnostic('3D load error', err);
    }
  }else{
    viewer.resize();
    const c=lastUserLocation ? {lng:lastUserLocation.lng,lat:lastUserLocation.lat} : map.getCenter();
    viewer.camera.flyTo({
      destination:Cesium.Cartesian3.fromDegrees(c.lng,c.lat,lastUserLocation?900:1800),
      orientation:{
        heading:Cesium.Math.toRadians(-12),
        pitch:Cesium.Math.toRadians(-48),
        roll:0
      },duration:.7
    });
  }
}
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.mode==='3d')show3D();else{document.querySelector('#threeMap').style.display='none';document.querySelector('#navMap').style.display='block'}});
function demoVoice(text){title.textContent=text;let t=text.toLowerCase();if(t.includes('cctv')){toggleMarkers('cctv',true);document.querySelector('[data-layer=cctv]').classList.add('on');info.innerHTML='<b>Public CCTV around you</b><span>Camera layer shown. Production version will query approved live UK sources.</span>'}else if(t.includes('m5')||t.includes('traffic')){map.flyTo({center:[-2.25,51.86],zoom:10.5});info.innerHTML='<b>M5 Traffic</b><span>Traffic layer displayed. Live provider connection comes next.</span>'}else if(t.includes('birmingham')){map.flyTo({center:[-1.89,52.486],zoom:12});info.innerHTML='<b>Birmingham</b><span>Map moved to Birmingham.</span>'}else info.innerHTML='<b>AI command understood</b><span>This demo is ready for the live AI tool-calling backend.</span>'}
function listen(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){demoVoice('Show me CCTV near me');return}let r=new SR();r.lang='en-GB';title.textContent='Listening…';r.onresult=e=>demoVoice(e.results[0][0].transcript);r.onend=()=>setTimeout(()=>title.textContent='Tap to speak',3000);r.start()}
document.querySelector('#mic').onclick=listen;
document.querySelector('#askTop').onclick=listen;

let userNavMarker=null,user3DEntity=null,lastUserLocation=null;

function showUserLocation(lng,lat,accuracy){
  lastUserLocation={lng,lat,accuracy};

  if(!userNavMarker){
    const el=document.createElement('div');
    el.style.cssText='width:20px;height:20px;border-radius:50%;background:#2f7cff;border:4px solid white;box-shadow:0 0 0 7px #2f7cff55,0 3px 12px #0009';
    userNavMarker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(map);
  }else userNavMarker.setLngLat([lng,lat]);

  if(viewer){
    if(user3DEntity) viewer.entities.remove(user3DEntity);
    user3DEntity=viewer.entities.add({
      position:Cesium.Cartesian3.fromDegrees(lng,lat,8),
      point:{
        pixelSize:16,
        color:Cesium.Color.DODGERBLUE,
        outlineColor:Cesium.Color.WHITE,
        outlineWidth:4,
        disableDepthTestDistance:Number.POSITIVE_INFINITY
      }
    });
  }
}

function goToUserLocation(){
  if(!navigator.geolocation){
    info.innerHTML='<b>Location unavailable</b><span>This browser does not provide GPS location.</span>';
    return;
  }
  info.innerHTML='<b>Finding your location…</b><span>Waiting for your iPhone GPS.</span>';
  navigator.geolocation.getCurrentPosition(async p=>{
    const lng=p.coords.longitude,lat=p.coords.latitude,accuracy=Math.round(p.coords.accuracy||0);
    showUserLocation(lng,lat,accuracy);

    const is3D=document.querySelector('#threeMap').style.display==='block';
    if(is3D){
      if(!viewer) await show3D();
      showUserLocation(lng,lat,accuracy);
      if(viewer && !viewer.isDestroyed()){
        viewer.camera.cancelFlight();
        viewer.camera.flyTo({
          destination:Cesium.Cartesian3.fromDegrees(lng,lat,650),
          orientation:{
            heading:Cesium.Math.toRadians(0),
            pitch:Cesium.Math.toRadians(-70),
            roll:0
          },
          duration:1.5,
          complete:()=>viewer.scene.requestRender()
        });
        viewer.scene.requestRender();
      }
    }else{
      map.flyTo({center:[lng,lat],zoom:16,pitch:45,duration:1200});
    }
    info.innerHTML='<b>📍 Your location</b><span>GPS found'+(accuracy?' — accuracy about '+accuracy+' m':'')+'.</span>';
  },err=>{
    const messages={1:'Location permission was denied. Allow Location for this website in Safari settings.',2:'Your iPhone could not determine its current location.',3:'Location request timed out. Try again outside or with a stronger GPS signal.'};
    info.innerHTML='<b>⚠️ Location error</b><span>'+(messages[err.code]||err.message||'Could not get your location.')+'</span>';
  },{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
}

document.querySelector('#locate').onclick=goToUserLocation;
document.querySelector('#zoomIn').onclick=()=>{
  const is3D=document.querySelector('#threeMap').style.display==='block';
  if(is3D&&viewer) viewer.camera.zoomIn(viewer.camera.positionCartographic.height*.35);
  else map.zoomIn();
};
document.querySelector('#zoomOut').onclick=()=>{
  const is3D=document.querySelector('#threeMap').style.display==='block';
  if(is3D&&viewer) viewer.camera.zoomOut(viewer.camera.positionCartographic.height*.35);
  else map.zoomOut();
};
document.querySelector('#search').addEventListener('keydown',e=>{if(e.key==='Enter')demoVoice(e.target.value)});
