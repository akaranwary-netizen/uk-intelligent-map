(()=>{
  const key=(window.APP_CONFIG&&window.APP_CONFIG.TOMTOM_API_KEY)||'';
  if(!key || typeof map==='undefined') return;

  const styleUrl=`https://api.tomtom.com/maps/orbis/assets/styles/0.*/style?apiVersion=1&map=basic_street-dark-driving&hillshade=hillshade_dark&key=${encodeURIComponent(key)}`;

  function brandStyle(style){
    style.name='UK Intelligent Map — Night Navigation';
    const navy='#07111f', water='#061a2d', land='#0b1726', building='#172b40';
    (style.layers||[]).forEach(layer=>{
      const id=(layer.id||'').toLowerCase();
      const src=(layer['source-layer']||'').toLowerCase();
      layer.paint=layer.paint||{};

      if(layer.type==='background') layer.paint['background-color']=navy;
      if(layer.type==='fill' && (id.includes('water')||src.includes('water'))) layer.paint['fill-color']=water;
      if(layer.type==='fill' && (id.includes('land')||id.includes('earth')||src.includes('landcover')) &&
         typeof layer.paint['fill-color']==='string') layer.paint['fill-color']=land;

      // Branded 3D city effect from TomTom building footprints.
      if(layer.type==='fill' && (id.includes('building')||src.includes('building'))){
        layer.type='fill-extrusion';
        const oldOpacity=layer.paint['fill-opacity'];
        layer.paint={
          'fill-extrusion-color':building,
          'fill-extrusion-height':['interpolate',['linear'],['zoom'],14,0,15.5,8,17,16,19,24],
          'fill-extrusion-base':0,
          'fill-extrusion-opacity':typeof oldOpacity==='number'?Math.max(.55,oldOpacity):.78
        };
        layer.minzoom=Math.max(14,layer.minzoom||0);
      }
    });
    return style;
  }

  async function install(){
    try{
      const r=await fetch(styleUrl);
      if(!r.ok) throw new Error('TomTom map style '+r.status);
      const style=brandStyle(await r.json());
      map.setStyle(style,{diff:false});
      map.once('style.load',()=>{
        map.setPitch(Math.max(map.getPitch(),42));
        window.dispatchEvent(new Event('uk-map-theme-ready'));
      });
    }catch(e){
      console.error('TomTom branded map theme failed; keeping fallback map.',e);
      window.dispatchEvent(new Event('uk-map-theme-ready'));
    }
  }
  install();
})();