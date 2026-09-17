/* UK Intelligent Map — Map-visible Voice AI
   Keeps the map visible. Tap Ask AI -> listen immediately -> Gemini -> map action -> spoken reply.
   No chat screen, no text input, no conversation history.
*/
(()=>{
  const $=q=>document.querySelector(q);
  let recognition=null,busy=false,isOpen=false,lastTranscript='';

  injectCSS();
  const ui=buildUI();

  function injectCSS(){
    if($('#uk-map-voice-css')) return;
    const s=document.createElement('style');
    s.id='uk-map-voice-css';
    s.textContent=`
      #mapVoiceAI{
        position:absolute;z-index:75;left:50%;bottom:max(94px,calc(env(safe-area-inset-bottom) + 78px));
        transform:translate(-50%,24px);width:min(92vw,430px);
        opacity:0;pointer-events:none;transition:.2s ease;
      }
      #mapVoiceAI.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
      .mv-card{
        display:flex;align-items:center;gap:12px;padding:12px 13px;
        border-radius:24px;border:1px solid rgba(216,255,47,.28);
        background:rgba(6,12,13,.84);
        backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
        box-shadow:0 18px 50px rgba(0,0,0,.45);
      }
      .mv-orb{
        width:58px;height:58px;flex:0 0 58px;border-radius:50%;border:1px solid rgba(216,255,47,.55);
        background:radial-gradient(circle at 35% 28%,#efffa0 0%,#d8ff2f 30%,#7fa90d 62%,#142108 100%);
        display:grid;place-items:center;box-shadow:0 0 24px rgba(216,255,47,.25);
      }
      .mv-orb svg{width:25px;height:25px;fill:#091009}
      .mv-orb.listening{animation:mvPulse 1s infinite;box-shadow:0 0 42px rgba(216,255,47,.62)}
      .mv-orb.thinking{animation:mvSpin 1.1s linear infinite}
      .mv-orb.speaking{box-shadow:0 0 42px rgba(87,205,255,.58)}
      @keyframes mvPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}
      @keyframes mvSpin{to{transform:rotate(360deg)}}
      .mv-copy{flex:1;min-width:0}
      .mv-status{font-weight:900;font-size:14px;color:#fff}
      .mv-text{
        margin-top:3px;color:#aeb8b4;font-size:11px;line-height:1.3;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      .mv-bars{display:flex;align-items:center;gap:3px;height:18px;margin-top:5px}
      .mv-bars i{display:block;width:3px;height:5px;border-radius:3px;background:#d8ff2f66}
      .mv-listening .mv-bars i{animation:mvBar .8s infinite ease-in-out}
      .mv-listening .mv-bars i:nth-child(2){animation-delay:.1s}
      .mv-listening .mv-bars i:nth-child(3){animation-delay:.2s}
      .mv-listening .mv-bars i:nth-child(4){animation-delay:.3s}
      .mv-listening .mv-bars i:nth-child(5){animation-delay:.4s}
      @keyframes mvBar{0%,100%{height:5px;opacity:.35}50%{height:17px;opacity:1}}
      .mv-close{
        width:40px;height:40px;flex:0 0 40px;border-radius:50%;
        border:1px solid rgba(255,255,255,.12);background:#161d1e;color:#fff;font-size:19px
      }
      .mv-retry{
        position:absolute;left:50%;transform:translateX(-50%);top:-42px;
        height:34px;padding:0 13px;border-radius:14px;border:1px solid rgba(255,255,255,.12);
        background:rgba(13,19,20,.86);color:#fff;font-size:10px;font-weight:850;display:none
      }
      #mapVoiceAI.idle .mv-retry{display:block}
    `;
    document.head.appendChild(s);
  }

  function buildUI(){
    const w=document.createElement('div');
    w.id='mapVoiceAI';
    w.innerHTML=`
      <button class="mv-retry" type="button">Talk again</button>
      <div class="mv-card">
        <div class="mv-orb" id="mvOrb">
          <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>
        </div>
        <div class="mv-copy">
          <div class="mv-status" id="mvStatus">Listening…</div>
          <div class="mv-text" id="mvText">Speak naturally</div>
          <div class="mv-bars">${'<i></i>'.repeat(5)}</div>
        </div>
        <button class="mv-close" type="button">×</button>
      </div>`;
    $('#app').appendChild(w);
    w.querySelector('.mv-close').onclick=close;
    w.querySelector('.mv-retry').onclick=startListening;
    w.querySelector('#mvOrb').onclick=startListening;
    return {
      wrap:w,
      orb:w.querySelector('#mvOrb'),
      status:w.querySelector('#mvStatus'),
      text:w.querySelector('#mvText'),
      card:w.querySelector('.mv-card')
    };
  }

  function setState(mode,status,text){
    ui.wrap.classList.remove('mv-listening','idle');
    ui.orb.classList.remove('listening','thinking','speaking');
    if(mode==='listening'){ui.wrap.classList.add('mv-listening');ui.orb.classList.add('listening')}
    if(mode==='thinking')ui.orb.classList.add('thinking');
    if(mode==='speaking')ui.orb.classList.add('speaking');
    if(mode==='idle')ui.wrap.classList.add('idle');
    ui.status.textContent=status||'';
    ui.text.textContent=text||'';
  }

  function unlockSpeech(){
    if(!('speechSynthesis' in window)) return;
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(' ');
      u.volume=0;
      speechSynthesis.speak(u);
    }catch(_){}
  }

  function open(){
    isOpen=true;
    ui.wrap.classList.add('show');
    unlockSpeech();
    setTimeout(startListening,180);
  }

  function close(){
    isOpen=false;
    try{recognition?.abort()}catch(_){}
    if('speechSynthesis' in window) speechSynthesis.cancel();
    ui.wrap.classList.remove('show');
    busy=false;
  }

  async function startListening(){
    if(busy)return;
    if(!isOpen){isOpen=true;ui.wrap.classList.add('show')}
    if('speechSynthesis' in window)speechSynthesis.cancel();

    try{
      if(navigator.mediaDevices?.getUserMedia){
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        stream.getTracks().forEach(t=>t.stop());
      }
    }catch(_){
      setState('idle','Microphone blocked','Allow microphone access for this website');
      return;
    }

    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){
      setState('idle','Voice unavailable','Speech recognition is not supported here');
      return;
    }

    try{recognition?.abort()}catch(_){}
    recognition=new SR();
    recognition.lang='en-GB';
    recognition.continuous=false;
    recognition.interimResults=true;
    recognition.maxAlternatives=1;

    let sent=false;
    recognition.onstart=()=>setState('listening','Listening…','Speak naturally');
    recognition.onresult=e=>{
      let finalText='',interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript;
        if(e.results[i].isFinal)finalText+=t;else interim+=t;
      }
      const shown=(finalText||interim||'Speak naturally').trim();
      ui.text.textContent=shown;
      if(finalText.trim()&&!sent){
        sent=true;
        lastTranscript=finalText.trim();
        // Stop microphone before trying to speak back on iPhone.
        try{recognition.stop()}catch(_){}
        askAI(lastTranscript);
      }
    };
    recognition.onerror=e=>{
      if(busy)return;
      const message=e.error==='no-speech'?'I did not hear anything':
                    e.error==='not-allowed'?'Microphone permission blocked':
                    'Please try again';
      setState('idle',message,'Tap the orb or Talk again');
    };
    recognition.onend=()=>{
      if(!busy && !sent && isOpen)setState('idle','Ready','Tap the orb or Talk again');
    };
    recognition.start();
  }

  function context(){
    const c=map.getCenter();
    return {
      map_center:{lng:+c.lng.toFixed(5),lat:+c.lat.toFixed(5)},
      zoom:+map.getZoom().toFixed(2),
      mode:$('.mode.active')?.dataset.mode||'nav',
      layers:[...document.querySelectorAll('.layers button.on')].map(b=>b.dataset.layer)
    };
  }

  async function askAI(message){
    busy=true;
    setState('thinking','Thinking…',message);
    try{
      const r=await fetch(new URL('/ai',location.origin),{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message,context:context()})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`AI error ${r.status}`);
      for(const a of d.actions||[])await action(a);
      await speakReply(d.reply||'Done.');
    }catch(e){
      await speakReply(e?.message||'The AI service is unavailable right now.');
    }finally{
      busy=false;
    }
  }

  function speakReply(text){
    return new Promise(resolve=>{
      const answer=String(text||'').trim();
      if(!answer){setState('idle','Ready','Tap the orb to speak');resolve();return}
      if(!('speechSynthesis' in window)){
        setState('idle','Ready',answer);
        resolve();return;
      }

      try{
        speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(answer);
        u.lang='en-GB';
        u.rate=1.0;
        u.pitch=1.0;
        u.volume=1.0;

        const voices=speechSynthesis.getVoices();
        const preferred=
          voices.find(v=>v.lang==='en-GB'&&/Daniel|Serena|Siri|Google|English/i.test(v.name))||
          voices.find(v=>v.lang==='en-GB')||
          voices.find(v=>/^en/.test(v.lang));
        if(preferred)u.voice=preferred;

        u.onstart=()=>setState('speaking','Speaking…',answer);
        u.onend=()=>{
          if(isOpen)setState('idle','Ready','Tap the orb to speak again');
          resolve();
        };
        u.onerror=()=>{
          if(isOpen)setState('idle','Ready',answer);
          resolve();
        };

        // iOS Safari can occasionally pause speech synthesis after async work.
        speechSynthesis.speak(u);
        setTimeout(()=>{
          try{
            if(speechSynthesis.paused)speechSynthesis.resume();
          }catch(_){}
        },250);
      }catch(_){
        setState('idle','Ready',answer);
        resolve();
      }
    });
  }

  async function searchPlace(q,navigate=false){
    q=String(q||'').trim();if(!q)return;
    const key=window.APP_CONFIG?.TOMTOM_API_KEY;if(!key)return;
    try{
      const u=`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&limit=1&countrySet=GB&language=en-GB`;
      const r=await fetch(u),d=await r.json(),h=d.results?.[0];
      if(!h?.position)return;
      map.flyTo({center:[h.position.lon,h.position.lat],zoom:13.5,duration:1000});
      if(navigate){
        const input=$('#search');
        if(input){
          input.value=q;input.focus();
          input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
        }
      }
    }catch(_){}
  }

  async function action(a){
    if(!a||!a.type)return;
    if(a.type==='set_layer'){
      const layer=String(a.layer||'').replace(/[^a-z]/g,'');
      const b=$(`.layers button[data-layer="${layer}"]`);
      if(b&&b.classList.contains('on')!==(a.enabled!==false))b.click();
    }else if(a.type==='set_mode'){
      const mode=a.mode==='3d'?'3d':'nav',b=$(`.mode[data-mode="${mode}"]`);
      if(b&&!b.classList.contains('active'))b.click();
    }else if(a.type==='locate')$('#locate')?.click();
    else if(a.type==='zoom'){
      if(Number.isFinite(Number(a.level)))map.easeTo({zoom:Math.max(3,Math.min(19,Number(a.level))),duration:650});
      else (a.direction==='out'?$('#zoomOut'):$('#zoomIn'))?.click();
    }else if(a.type==='search_place')await searchPlace(a.query,false);
    else if(a.type==='navigate')await searchPlace(a.destination,true);
  }

  const ask=$('#askTop'),mic=$('#mic');
  if(ask)ask.onclick=e=>{e.preventDefault();open()};
  if(mic)mic.onclick=e=>{e.preventDefault();open()};

  if('speechSynthesis' in window){
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged=()=>speechSynthesis.getVoices();
  }

  window.UKMapAI={open,startListening,close};
})();