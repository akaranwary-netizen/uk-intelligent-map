(()=>{
  const key=(window.APP_CONFIG&&window.APP_CONFIG.TOMTOM_API_KEY)||'';
  const trafficBtn=document.querySelector('[data-layer="traffic"]');
  let wanted=true;

  function installTraffic(){
    if(!window.maplibregl || typeof map==='undefined' || !map || !map.isStyleLoaded()) return setTimeout(installTraffic,250);
    try{ if(map.getLayer('traffic')) map.removeLayer('traffic'); }catch(e){}
    try{ if(map.getSource('traffic')) map.removeSource('traffic'); }catch(e){}

    if(!key){
      if(trafficBtn) trafficBtn.classList.remove('on');
      if(info) info.innerHTML='<b>⚠️ Traffic key missing</b><span>Render did not inject TOMTOM_API_KEY during the build.</span>';
      return;
    }
    if(!map.getSource('tomtom-live-flow')){
      map.addSource('tomtom-live-flow',{
        type:'raster',
        tiles:[`https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&style=dark&tileSize=512&key=${encodeURIComponent(key)}`],
        tileSize:512,
        attribution:'Map & traffic © TomTom'
      });
      map.addLayer({id:'tomtom-live-traffic',type:'raster',source:'tomtom-live-flow',
        layout:{visibility:wanted?'visible':'none'},paint:{'raster-opacity':0.94}});
    }
    if(trafficBtn){
      trafficBtn.classList.toggle('on',wanted);
      trafficBtn.onclick=()=>{
        wanted=!trafficBtn.classList.contains('on');
        trafficBtn.classList.toggle('on',wanted);
        if(map.getLayer('tomtom-live-traffic')) map.setLayoutProperty('tomtom-live-traffic','visibility',wanted?'visible':'none');
        if(info) info.innerHTML=`<b>🚗 Live Traffic ${wanted?'ON':'OFF'}</b><span>${wanted?'TomTom live traffic flow is displayed on the navigation map.':'Live traffic hidden.'}</span>`;
      };
    }
  }
  window.addEventListener('uk-map-theme-ready',installTraffic);
  if(typeof map!=='undefined') map.on('style.load',()=>setTimeout(installTraffic,50));
  setTimeout(installTraffic,1500);
})();