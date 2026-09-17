(()=>{
const cfg=()=>window.APP_CONFIG||{}, key=()=>cfg().TOMTOM_API_KEY||'';
let destMarker=null, routeReady=false, lastFix=null, heading=0, watchId=null;
const search=document.querySelector('#search'), infoEl=document.querySelector('#info');

function mobileSearch(){
  if(!search) return;
  const box=search.closest('.search');
  if(box) box.classList.add('nav-search-visible');
}
mobileSearch();

function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function bearing(a,b){
 const r=Math.PI/180, p1=a.lat*r,p2=b.lat*r,dl=(b.lng-a.lng)*r;
 return (Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl))*180/Math.PI+360)%360;
}
function arrowEl(){
 const el=document.createElement('div'); el.className='live-nav-arrow';
 el.innerHTML='<div class="heading-cone"></div><div class="heading-dot"></div>';
 return el;
}
let navArrow=null;
function updateArrow(lng,lat,h){
 if(!navArrow) navArrow=new maplibregl.Marker({element:arrowEl(),rotationAlignment:'map',pitchAlignment:'map'}).setLngLat([lng,lat]).addTo(map);
 navArrow.setLngLat([lng,lat]);
 const cone=navArrow.getElement().querySelector('.heading-cone');
 if(cone) cone.style.transform=`translate(-50%,-88%) rotate(${h||0}deg)`;
}

function fix(p, follow=false){
 const n={lng:p.coords.longitude,lat:p.coords.latitude,accuracy:p.coords.accuracy||0};
 let h=Number.isFinite(p.coords.heading)?p.coords.heading:null;
 if(h===null && lastFix && p.coords.speed>0.8) h=bearing(lastFix,n);
 if(h!==null) heading=h;
 lastFix=n; updateArrow(n.lng,n.lat,heading);
 if(follow) map.easeTo({center:[n.lng,n.lat],bearing:heading,pitch:55,zoom:17,duration:500});
}
function startTracking(){
 if(watchId!==null||!navigator.geolocation)return;
 watchId=navigator.geolocation.watchPosition(p=>fix(p,routeReady),()=>{}, {enableHighAccuracy:true,maximumAge:1000,timeout:15000});
}
startTracking();

async function getFix(){
 return new Promise((resolve,reject)=>{
  if(lastFix)return resolve(lastFix);
  navigator.geolocation.getCurrentPosition(p=>{fix(p);resolve(lastFix)},reject,{enableHighAccuracy:true,timeout:15000,maximumAge:2000});
 });
}
async function searchPlace(q){
 const url=`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?limit=5&countrySet=GB&language=en-GB&key=${encodeURIComponent(key())}`;
 const r=await fetch(url); if(!r.ok)throw new Error('TomTom search failed ('+r.status+')');
 const j=await r.json(); if(!j.results?.length)throw new Error('No UK address or place found.');
 return j.results[0];
}
async function route(origin,dest){
 const url=`https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${dest.lat},${dest.lng}/json?traffic=true&travelMode=car&routeType=fastest&key=${encodeURIComponent(key())}`;
 const r=await fetch(url); if(!r.ok)throw new Error('TomTom routing failed ('+r.status+')');
 const j=await r.json(); if(!j.routes?.length)throw new Error('No driving route found.');
 return j.routes[0];
}
function drawRoute(rt){
 const coords=[];
 rt.legs.forEach(l=>l.points.forEach(p=>coords.push([p.longitude,p.latitude])));
 const data={type:'Feature',geometry:{type:'LineString',coordinates:coords}};
 if(map.getSource('nav-route'))map.getSource('nav-route').setData(data);
 else{
  map.addSource('nav-route',{type:'geojson',data});
  map.addLayer({id:'nav-route-outline',type:'line',source:'nav-route',paint:{'line-color':'#ffffff','line-width':9,'line-opacity':.9}});
  map.addLayer({id:'nav-route',type:'line',source:'nav-route',paint:{'line-color':'#1976ff','line-width':6}});
 }
 const b=coords.reduce((x,c)=>x.extend(c),new maplibregl.LngLatBounds(coords[0],coords[0]));
 map.fitBounds(b,{padding:{top:160,bottom:180,left:90,right:35},duration:900,maxZoom:16});
}
async function navigate(q){
 if(!q.trim())return;
 if(!key()){infoEl.innerHTML='<b>Navigation unavailable</b><span>TomTom key is missing.</span>';return;}
 try{
  infoEl.innerHTML='<b>🔎 Finding destination…</b><span>'+esc(q)+'</span>';
  const [o,res]=await Promise.all([getFix(),searchPlace(q)]);
  const d={lng:res.position.lon,lat:res.position.lat};
  const rt=await route(o,d); drawRoute(rt); routeReady=true;
  if(destMarker)destMarker.remove();
  destMarker=new maplibregl.Marker({color:'#e53935'}).setLngLat([d.lng,d.lat]).addTo(map);
  const s=rt.summary, miles=(s.lengthInMeters/1609.344).toFixed(1), mins=Math.round(s.travelTimeInSeconds/60);
  const label=res.address?.freeformAddress||res.poi?.name||q;
  infoEl.innerHTML=`<b>🚗 ${esc(label)}</b><span>${miles} miles • about ${mins} min with current traffic</span>`;
 }catch(e){infoEl.innerHTML='<b>⚠️ Navigation error</b><span>'+esc(e.message)+'</span>';}
}
if(search){
 search.placeholder='Search postcode, address or place…';
 search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();navigate(search.value)}},true);
}
const locate=document.querySelector('#locate');
if(locate)locate.addEventListener('click',()=>setTimeout(async()=>{try{const p=await getFix();map.easeTo({center:[p.lng,p.lat],zoom:17,pitch:55,bearing:heading,duration:700})}catch(e){}},50),true);

window.addEventListener('deviceorientationabsolute',e=>{if(Number.isFinite(e.alpha)){heading=(360-e.alpha)%360;if(lastFix)updateArrow(lastFix.lng,lastFix.lat,heading)}});
})();