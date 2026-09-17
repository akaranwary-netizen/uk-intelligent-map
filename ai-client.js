(()=>{
  let busy=false,recognition=null;
  const el=(q)=>document.querySelector(q);

  if(!el('#uk-ai-css')){
    const s=document.createElement('style');s.id='uk-ai-css';s.textContent=`
    #ukAIBackdrop{position:absolute;inset:0;z-index:70;background:#0006;display:none}
    #ukAIBackdrop.show{display:block}
    #ukAIPanel{position:absolute;z-index:71;left:12px;right:12px;bottom:max(14px,env(safe-area-inset-bottom));max-width:620px;margin:auto;background:rgba(7,12,13,.96);border:1px solid #d8ff2f55;border-radius:26px;box-shadow:0 24px 70px #0009;backdrop-filter:blur(24px);transform:translateY(120%);transition:.25s;overflow:hidden}
    #ukAIPanel.show{transform:translateY(0)}.ukai-grab{width:52px;height:5px;border-radius:5px;background:#69736f;margin:9px auto 4px}
    .ukai-head{display:flex;align-items:center;gap:10px;padding:8px 14px 10px}.ukai-orb{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#d8ff2f;color:#071007;font-weight:1000}
    .ukai-title{flex:1}.ukai-title b{display:block}.ukai-title small{display:block;color:#9ea9a5;font-size:10px;margin-top:2px}.ukai-close{width:36px;height:36px;border-radius:50%;border:1px solid #ffffff18;background:#161d1e;color:white;font-size:19px}
    .ukai-chat{max-height:42vh;min-height:120px;overflow:auto;padding:6px 14px 10px;display:flex;flex-direction:column;gap:8px}.ukai-msg{max-width:87%;padding:10px 12px;border-radius:16px;font-size:13px;line-height:1.38}.ukai-msg.ai{align-self:flex-start;background:#151d1d;color:#eef3ef}.ukai-msg.user{align-self:flex-end;background:#d8ff2f;color:#081008;font-weight:750}
    .ukai-chips{display:flex;gap:7px;overflow:auto;padding:2px 14px 9px}.ukai-chip{white-space:nowrap;border:1px solid #ffffff18;background:#141b1c;color:#c9d1ce;border-radius:15px;padding:8px 10px;font-size:10px;font-weight:750}
    .ukai-inputrow{display:flex;gap:8px;padding:10px 12px max(12px,env(safe-area-inset-bottom));border-top:1px solid #ffffff12}.ukai-inputrow input{flex:1;height:48px;border:1px solid #ffffff1c;border-radius:18px;background:#111718;color:#fff;padding:0 14px;font-size:14px;outline:none}
    .ukai-round{width:48px;height:48px;border-radius:50%;border:0;background:#1a2221;color:#fff;font-size:18px}#ukAISend{background:#d8ff2f;color:#081008;font-weight:1000}`;
    document.head.appendChild(s);
  }

  const back=document.createElement('div');back.id='ukAIBackdrop';
  const panel=document.createElement('section');panel.id='ukAIPanel';
  panel.innerHTML=`<div class="ukai-grab"></div><div class="ukai-head"><div class="ukai-orb">AI</div><div class="ukai-title"><b>UK Map AI</b><small>Ask, search and control the map</small></div><button class="ukai-close">×</button></div><div class="ukai-chat" id="ukAIChat"><div class="ukai-msg ai">Ask me to control the map, find places, switch layers or prepare navigation.</div></div><div class="ukai-chips"><button class="ukai-chip">Show flights over Bristol</button><button class="ukai-chip">Traffic on the M5</button><button class="ukai-chip">Open 3D map</button><button class="ukai-chip">Take me to Birmingham</button></div><div class="ukai-inputrow"><button class="ukai-round" id="ukAIVoice">🎙</button><input id="ukAIInput" placeholder="Ask anything about the map…"><button class="ukai-round" id="ukAISend">➜</button></div>`;
  el('#app').append(back,panel);

  function open(voice=false){back.classList.add('show');panel.classList.add('show');setTimeout(()=>el('#ukAIInput').focus(),220);if(voice)setTimeout(startVoice,300)}
  function close(){back.classList.remove('show');panel.classList.remove('show')}
  back.onclick=close;panel.querySelector('.ukai-close').onclick=close;
  function msg(t,who='ai'){const d=document.createElement('div');d.className=`ukai-msg ${who}`;d.textContent=t;el('#ukAIChat').append(d);el('#ukAIChat').scrollTop=el('#ukAIChat').scrollHeight;return d}
  function ctx(){const c=map.getCenter();return {map_center:{lng:+c.lng.toFixed(5),lat:+c.lat.toFixed(5)},zoom:map.getZoom(),mode:el('.mode.active')?.dataset.mode||'nav',layers:[...document.querySelectorAll('.layers button.on')].map(b=>b.dataset.layer)}}
  async function send(raw){
    const message=String(raw||'').trim();if(!message||busy)return;el('#ukAIInput').value='';msg(message,'user');const wait=msg('Thinking…');busy=true;
    try{
      const r=await fetch('/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,context:ctx()})});const d=await r.json();
      if(!r.ok)throw new Error(d.error||'AI request failed');wait.remove();if(d.reply)msg(d.reply);
      for(const a of d.actions||[])await act(a);
    }catch(e){wait.textContent=e.message||'AI request failed'}finally{busy=false}
  }
  async function search(q,navigate=false){
    const tt=window.APP_CONFIG?.TOMTOM_API_KEY;if(!tt)return;
    const r=await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(tt)}&limit=1&countrySet=GB&language=en-GB`);
    const d=await r.json(),h=d.results?.[0];if(!h?.position){msg(`I couldn't find ${q}.`);return}
    map.flyTo({center:[h.position.lon,h.position.lat],zoom:13.5,duration:1100});
    if(navigate){const i=el('#search');i.value=q;i.focus();i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}
  }
  async function act(a){
    if(a.type==='set_layer'){const b=el(`.layers button[data-layer="${a.layer}"]`);if(b&&b.classList.contains('on')!==(a.enabled!==false))b.click()}
    else if(a.type==='set_mode'){const b=el(`.mode[data-mode="${a.mode==='3d'?'3d':'nav'}"]`);if(b&&!b.classList.contains('active'))b.click()}
    else if(a.type==='locate')el('#locate')?.click();
    else if(a.type==='zoom'){if(Number.isFinite(Number(a.level)))map.easeTo({zoom:Math.max(3,Math.min(19,Number(a.level))),duration:650});else (a.direction==='out'?el('#zoomOut'):el('#zoomIn'))?.click()}
    else if(a.type==='search_place')await search(String(a.query||''),false);
    else if(a.type==='navigate')await search(String(a.destination||''),true);
  }
  function startVoice(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){msg('Voice recognition is not available here. Type your request instead.');return}
    try{recognition?.abort()}catch(_){}
    recognition=new SR();recognition.lang='en-GB';recognition.onresult=e=>{const t=e.results[0][0].transcript;el('#ukAIInput').value=t;send(t)};recognition.start();
  }
  el('#ukAISend').onclick=()=>send(el('#ukAIInput').value);el('#ukAIInput').addEventListener('keydown',e=>{if(e.key==='Enter')send(e.target.value)});
  el('#ukAIVoice').onclick=startVoice;panel.querySelectorAll('.ukai-chip').forEach(b=>b.onclick=()=>send(b.textContent));
  const ask=el('#askTop'),mic=el('#mic');if(ask)ask.onclick=e=>{e.preventDefault();open(false)};if(mic)mic.onclick=e=>{e.preventDefault();open(true)};
  window.UKMapAI={open,send};
})();