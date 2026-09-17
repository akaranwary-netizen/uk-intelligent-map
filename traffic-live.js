(()=>{
  const key=(window.APP_CONFIG&&window.APP_CONFIG.TOMTOM_API_KEY)||'';
  const trafficBtn=document.querySelector('[data-layer="traffic"]');

  function installTraffic(){
    if(!window.maplibregl || typeof map==='undefined' || !map || !map.isStyleLoaded()) return setTimeout(installTraffic,250);

    // Remove the old prototype traffic line.
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
        tiles:[`https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?tileSize=512&key=${encodeURIComponent(key)}`],
        tileSize:512,
        attribution:'Traffic © TomTom'
      });
      map.addLayer({
        id:'tomtom-live-traffic',
        type:'raster',
        source:'tomtom-live-flow',
        paint:{'raster-opacity':0.94}
      });
    }

    if(trafficBtn){
      trafficBtn.classList.add('on');
      trafficBtn.onclick=()=>{
        const on=!trafficBtn.classList.contains('on');
        trafficBtn.classList.toggle('on',on);
        if(map.getLayer('tomtom-live-traffic')){
          map.setLayoutProperty('tomtom-live-traffic','visibility',on?'visible':'none');
        }
        if(info) info.innerHTML=`<b>🚗 Live Traffic ${on?'ON':'OFF'}</b><span>${on?'TomTom live traffic flow is displayed on the navigation map.':'Live traffic hidden.'}</span>`;
      };
    }
    if(info) info.innerHTML='<b>🚗 Live Traffic connected</b><span>TomTom real-time traffic flow is now active.</span>';
  }

  if(typeof map!=='undefined' && map.loaded()) installTraffic();
  else if(typeof map!=='undefined') map.once('load',installTraffic);
  else window.addEventListener('load',installTraffic);
})();