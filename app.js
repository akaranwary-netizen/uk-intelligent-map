const info=document.querySelector('#info'), title=document.querySelector('#voiceTitle');
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
    viewer=new Cesium.Viewer('threeMap',{
      geocoder:Cesium.IonGeocodeProviderType.GOOGLE,homeButton:false,sceneModePicker:false,baseLayerPicker:false,
      navigationHelpButton:false,animation:false,timeline:false,fullscreenButton:false,
      infoBox:false,selectionIndicator:false,globe:false
    });

    try{
      googleTileset=viewer.scene.primitives.add(
        await Cesium.Cesium3DTileset.fromIonAssetId(2275207)
      );
      const c=map.getCenter();
      viewer.camera.setView({
        destination:Cesium.Cartesian3.fromDegrees(c.lng,c.lat,1800),
        orientation:{
          heading:Cesium.Math.toRadians(-12),
          pitch:Cesium.Math.toRadians(-48),
          roll:0
        }
      });
      info.innerHTML='<b>3D Realistic Map</b><span>Photorealistic 3D Tiles connected through Cesium ion.</span>';
    }catch(err){
      console.error('Photorealistic 3D Tiles error:',err);
      info.innerHTML='<b>3D could not load</b><span>Check the Cesium ion token permissions and Photorealistic 3D Tiles access.</span>';
    }
  }else{
    viewer.resize();
    const c=map.getCenter();
    viewer.camera.flyTo({
      destination:Cesium.Cartesian3.fromDegrees(c.lng,c.lat,1800),
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
document.querySelector('#mic').onclick=listen;document.querySelector('#askTop').onclick=listen;document.querySelector('#locate').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>map.flyTo({center:[p.coords.longitude,p.coords.latitude],zoom:14}));document.querySelector('#zoomIn').onclick=()=>map.zoomIn();document.querySelector('#zoomOut').onclick=()=>map.zoomOut();document.querySelector('#search').addEventListener('keydown',e=>{if(e.key==='Enter')demoVoice(e.target.value)});
