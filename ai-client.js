/* UK Intelligent Map — Live Voice AI Screen
   Full-screen voice assistant feel. No chat, no message bubbles, no text input.
*/
(()=>{
  const $=q=>document.querySelector(q);
  let recognition=null,busy=false;

  injectCSS();
  const ui=build();

  function injectCSS(){
    if($('#uk-live-ai-css')) return;
    const s=document.createElement('style');
    s.id='uk-live-ai-css';
    s.textContent=`
      #liveAIBackdrop{
        position:absolute;inset:0;z-index:90;
        background:
          radial-gradient(circle at 50% 45%,rgba(216,255,47,.12),transparent 30%),
          linear-gradient(180deg,rgba(2,7,8,.90),rgba(1,5,6,.97));
        backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
        display:none;
      }
      #liveAIBackdrop.show{display:block}
      #liveAI{
        position:absolute;inset:0;z-index:91;display:none;color:#fff;pointer-events:none;
      }
      #liveAI.show{display:block}
      .lai-top{
        position:absolute;top:max(18px,env(safe-area-inset-top));left:18px;right:18px;
        display:flex;align-items:center;justify-content:space-between;pointer-events:auto;
      }
      .lai-brand{display:flex;align-items:center;gap:10px}
      .lai-dot{width:10px;height:10px;border-radius:50%;background:#d8ff2f;box-shadow:0 0 16px #d8ff2f}
      .lai-brand b{font-size:15px}.lai-brand small{display:block;color:#8f9a96;font-size:9px;margin-top:1px}
      .lai-close{
        width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.12);
        background:rgba(20,27,27,.88);color:#fff;font-size:21px
      }
      .lai-center{
        position:absolute;left:50%;top:49%;transform:translate(-50%,-50%);
        width:min(92vw,500px);text-align:center;pointer-events:auto;
      }
      .lai-status{
        min-height:28px;font-size:15px;font-weight:800;letter-spacing:.2px;margin-bottom:22px;
      }
      .lai-orb-wrap{
        position:relative;width:250px;height:250px;margin:0 auto;
        display:grid;place-items:center;
      }
      .lai-ring,.lai-ring2,.lai-ring3{
        position:absolute;border-radius:50%;border:1px solid rgba(216,255,47,.22);
        inset:0;transition:.2s;
      }
      .lai-ring2{inset:18px;border-color:rgba(216,255,47,.18)}
      .lai-ring3{inset:38px;border-color:rgba(216,255,47,.12)}
      .lai-orb{
        width:142px;height:142px;border-radius:50%;border:1px solid rgba(216,255,47,.55);
        background:
          radial-gradient(circle at 38% 30%,#f2ffad 0%,#dcff38 27%,#91b814 58%,#1a260b 100%);
        box-shadow:0 0 55px rgba(216,255,47,.30),0 20px 70px rgba(0,0,0,.65);
        display:grid;place-items:center;transition:.2s;
      }
      .lai-orb svg{width:46px;height:46px;fill:#081008}
      .lai-listening .lai-ring{animation:laiPulse 1.4s infinite}
      .lai-listening .lai-ring2{animation:laiPulse 1.4s .18s infinite}
      .lai-listening .lai-ring3{animation:laiPulse 1.4s .36s infinite}
      .lai-listening .lai-orb{transform:scale(1.05);box-shadow:0 0 90px rgba(216,255,47,.65),0 20px 70px rgba(0,0,0,.7)}
      .lai-thinking .lai-orb{animation:laiRotate 1.5s linear infinite}
      .lai-speaking .lai-orb{box-shadow:0 0 90px rgba(102,211,255,.55),0 20px 70px rgba(0,0,0,.7)}
      .lai-speaking .lai-ring{border-color:rgba(102,211,255,.26);animation:laiPulse 1s infinite}
      @keyframes laiPulse{0%{transform:scale(.92);opacity:.3}50%{opacity:1}100%{transform:scale(1.08);opacity:.15}}
      @keyframes laiRotate{to{transform:rotate(360deg)}}
      .lai-wave{
        height:44px;margin:24px auto 4px;width:210px;display:flex;align-items:center;justify-content:center;gap:5px;
      }
      .lai-wave i{
        width:4px;height:10px;border-radius:4px;background:#d8ff2f66;display:block;transition:.15s;
      }
      .lai-listening .lai-wave i{animation:laiWave .9s infinite ease-in-out}
      .lai-listening .lai-wave i:nth-child(2){animation-delay:.1s}.lai-listening .lai-wave i:nth-child(3){animation-delay:.2s}.lai-listening .lai-wave i:nth-child(4){animation-delay:.3s}.lai-listening .lai-wave i:nth-child(5){animation-delay:.4s}.lai-listening .lai-wave i:nth-child(6){animation-delay:.5s}.lai-listening .lai-wave i:nth-child(7){animation-delay:.6s}
      @keyframes laiWave{0%,100%{height:8px;opacity:.35}50%{height:38px;opacity:1}}
      .lai-transcript{
        min-height:44px;margin:6px auto 0;max-width:360px;color:#dce4e0;font-size:17px;line-height:1.35;
      }
      .lai-sub{margin-top:8px;color:#7f8a86;font-size:10px}
      .lai-bottom{
        position:absolute;left:0;right:0;bottom:max(24px,env(safe-area-inset-bottom));
        display:flex;justify-content:center;gap:14px;pointer-events:auto;
      }
      .lai-btn{
        height:50px;min-width:118px;padding:0 18px;border-radius:18px;
        border:1px solid rgba(255,255,255,.12);background:#141b1c;color:#fff;font-weight:900;
      }
      .lai-btn.primary{background:#d8ff2f;color:#081008;border-color:#d8ff2f}
    `;
    document.head.appendChild(s);
  }

  function build(){
    const back=document.createElement('div');back.id='liveAIBackdrop';
    const wrap=document.createElement('div');wrap.id='liveAI';
    wrap.innerHTML=`
      <div class="lai-top">
        <div class="lai-brand"><span class="lai-dot"></span><div><b>UK Map AI</b><small>Live voice assistant</small></div></div>
        <button class="lai-close" type="button">×</button>
      </div>
      <div class="lai-center">
        <div class="lai-status" id="laiStatus">Ready</div>
        <div class="lai-orb-wrap" id="laiOrbWrap">
          <div class="lai-ring"></div><div class="lai-ring2"></div><div class="lai-ring3"></div>
          <div class="lai-orb">
            <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>
          </div>
        </div>
        <div class="lai-wave">${'<i></i>'.repeat(7)}</div>
        <div class="lai-transcript" id="laiTranscript">Tap Start and speak</div>
        <div class="lai-sub">Your request controls the map directly</div>
      </div>
      <div class="lai-bottom">
        <button class="lai-btn primary" id="laiStart" type="button">Start</button>
        <button class="lai-btn" id="laiStop" type="button">Stop</button>
      </div>`;
    $('#app').append(back,wrap);
    wrap.querySelector('.lai-close').onclick=close;
    wrap.querySelector('#laiStart').onclick=startListening;
    wrap.querySelector('#laiStop').onclick=stopAll;
    back.onclick=close;
    return {
      back,wrap,status:wrap.querySelector('#laiStatus'),
      transcript:wrap.querySelector('#laiTranscript'),
      orbWrap:wrap.querySelector('#laiOrbWrap')
    };
  }

  function setMode(mode,status,transcript){
    ui.orbWrap.classList.remove('lai-listening','lai-thinking','lai-speaking');
    if(mode)ui.orbWrap.classList.add(mode);
    ui.status.textContent=status||'';
    if(transcript!==undefined)ui.transcript.textContent=transcript;
  }

  function open(){
    ui.back.classList.add('show');ui.wrap.classList.add('show');
    setMode('','Ready','Tap Start and speak');
  }
  function close(){
    stopAll();
    ui.back.classList.remove('show');ui.wrap.classList.remove('show');
  }
  function stopAll(){
    try{recognition?.abort()}catch(_){}
    if('speechSynthesis' in window)speechSynthesis.cancel();
    busy=false;
    setMode('','Ready','Tap Start and speak');
  }

  async function startListening(){
    if(busy)return;
    if('speechSynthesis' in window)speechSynthesis.cancel();
    try{
      if(navigator.mediaDevices?.getUserMedia){
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        stream.getTracks().forEach(t=>t.stop());
      }
    }catch(_){
      setMode('','Microphone blocked','Allow microphone access for this website');
      return;
    }

    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){
      setMode('','Voice unavailable','This browser does not support speech recognition');
      return;
    }

    try{recognition?.abort()}catch(_){}
    recognition=new SR();
    recognition.lang='en-GB';
    recognition.interimResults=true;
    recognition.continuous=false;
    recognition.maxAlternatives=1;

    recognition.onstart=()=>setMode('lai-listening','Listening…','Speak now');
    recognition.onresult=e=>{
      let finalText='',interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript;
        if(e.results[i].isFinal)finalText+=t; else interim+=t;
      }
      ui.transcript.textContent=finalText||interim||'Listening…';
      if(finalText.trim()) askAI(finalText.trim());
    };
    recognition.onerror=e=>{
      const m=e.error==='no-speech'?'I did not hear anything':e.error==='not-allowed'?'Microphone permission blocked':'Please try again';
      setMode('',m,'Tap Start and speak');
    };
    recognition.onend=()=>{
      if(!busy && ui.orbWrap.classList.contains('lai-listening'))setMode('','Ready','Tap Start and speak');
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
    setMode('lai-thinking','Thinking…',message);
    try{
      const r=await fetch(new URL('/ai',location.origin),{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message,context:context()})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`AI error ${r.status}`);
      for(const a of d.actions||[]) await action(a);
      await speak(d.reply||'Done.');
    }catch(e){
      await speak(e?.message||'The AI service is unavailable.');
    }finally{busy=false}
  }

  function speak(text){
    return new Promise(resolve=>{
      if(!('speechSynthesis' in window)){setMode('','Ready','Tap Start and speak');resolve();return}
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(String(text));
      u.lang='en-GB';u.rate=1.02;u.pitch=1;
      const voices=speechSynthesis.getVoices();
      const v=voices.find(v=>v.lang==='en-GB'&&/Daniel|Serena|Siri|Google|English/i.test(v.name))||
              voices.find(v=>v.lang==='en-GB')||voices.find(v=>/^en/.test(v.lang));
      if(v)u.voice=v;
      u.onstart=()=>setMode('lai-speaking','Speaking…',text);
      u.onend=()=>{setMode('','Ready','Tap Start and speak');resolve()};
      u.onerror=()=>{setMode('','Ready','Tap Start and speak');resolve()};
      speechSynthesis.speak(u);
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
        if(input){input.value=q;input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));}
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

  const top=$('#askTop'),bottom=$('#mic');
  if(top)top.onclick=e=>{e.preventDefault();open()};
  if(bottom)bottom.onclick=e=>{e.preventDefault();open()};

  if('speechSynthesis' in window){
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged=()=>speechSynthesis.getVoices();
  }

  window.UKMapAI={open,startListening,stop:stopAll};
})();