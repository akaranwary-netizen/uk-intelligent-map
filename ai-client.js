/* UK Intelligent Map — Gemini Live SDK fix
   Uses Google's current GenAI SDK in the browser with a short-lived token.
   Tap Ask AI once. Map stays visible. Session keeps listening until Stop/X.
*/
(async()=>{
  const $=q=>document.querySelector(q);
  let GoogleGenAI,Modality;
  let session=null,stream=null,inputCtx=null,processor=null,inputSource=null;
  let outputCtx=null,nextPlay=0,playing=new Set();
  let active=false,connecting=false,replyText='';

  injectCSS();
  const ui=build();

  function injectCSS(){
    if($('#gemini-live-css'))return;
    const s=document.createElement('style');s.id='gemini-live-css';
    s.textContent=`
      #geminiLive{position:absolute;z-index:78;left:50%;bottom:max(92px,calc(env(safe-area-inset-bottom) + 76px));transform:translate(-50%,18px);width:min(92vw,430px);opacity:0;pointer-events:none;transition:.22s}
      #geminiLive.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
      .gl-card{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:24px;border:1px solid rgba(216,255,47,.28);background:rgba(5,11,12,.84);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 18px 45px #0008}
      .gl-orb{width:57px;height:57px;flex:0 0 57px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#efff9c,#d8ff2f 32%,#83a90e 65%,#132006);box-shadow:0 0 28px #d8ff2f44}
      .gl-orb svg{width:25px;height:25px;fill:#071007}.gl-orb.listening{animation:glPulse 1.15s infinite}.gl-orb.speaking{box-shadow:0 0 42px #4fcaff88}.gl-orb.connecting{animation:glSpin 1s linear infinite}
      @keyframes glPulse{50%{transform:scale(1.09);box-shadow:0 0 48px #d8ff2f99}}@keyframes glSpin{to{transform:rotate(360deg)}}
      .gl-copy{flex:1;min-width:0}.gl-copy b{display:block;font-size:14px}.gl-copy span{display:block;color:#aab5b1;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gl-bars{display:flex;align-items:center;gap:3px;height:13px;margin-top:4px}.gl-bars i{width:3px;height:4px;border-radius:3px;background:#d8ff2f66}.gl-listening .gl-bars i{animation:glBar .75s infinite}.gl-listening .gl-bars i:nth-child(2){animation-delay:.08s}.gl-listening .gl-bars i:nth-child(3){animation-delay:.16s}.gl-listening .gl-bars i:nth-child(4){animation-delay:.24s}.gl-listening .gl-bars i:nth-child(5){animation-delay:.32s}@keyframes glBar{50%{height:12px;background:#d8ff2f}}
      .gl-stop,.gl-close{width:39px;height:39px;border-radius:50%;border:1px solid #ffffff20;background:#161d1e;color:#fff;font-weight:900}.gl-stop{font-size:11px}.gl-close{font-size:18px}
    `;
    document.head.appendChild(s);
  }

  function build(){
    const w=document.createElement('div');w.id='geminiLive';
    w.innerHTML=`<div class="gl-card"><div class="gl-orb" id="glOrb"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z"/></svg></div><div class="gl-copy"><b id="glStatus">Connecting…</b><span id="glText">Starting Gemini Live</span><div class="gl-bars">${'<i></i>'.repeat(5)}</div></div><button class="gl-stop" type="button">Stop</button><button class="gl-close" type="button">×</button></div>`;
    $('#app').appendChild(w);
    w.querySelector('.gl-stop').onclick=stop;
    w.querySelector('.gl-close').onclick=stop;
    return {wrap:w,card:w.querySelector('.gl-card'),orb:w.querySelector('#glOrb'),status:w.querySelector('#glStatus'),text:w.querySelector('#glText')};
  }

  function state(kind,status,text){
    ui.orb.classList.remove('listening','speaking','connecting');
    ui.card.classList.remove('gl-listening');
    if(kind==='listening'){ui.orb.classList.add('listening');ui.card.classList.add('gl-listening')}
    if(kind==='speaking')ui.orb.classList.add('speaking');
    if(kind==='connecting')ui.orb.classList.add('connecting');
    ui.status.textContent=status||'';ui.text.textContent=text||'';
  }

  async function loadSDK(){
    if(GoogleGenAI)return;
    const mod=await import('https://esm.sh/@google/genai@1.20.0');
    GoogleGenAI=mod.GoogleGenAI;Modality=mod.Modality;
  }

  const tools=[{functionDeclarations:[
    {name:'set_layer',description:'Turn a map data layer on or off.',parameters:{type:'OBJECT',properties:{layer:{type:'STRING',enum:['traffic','flights','cctv','speed','trains','buses','parking']},enabled:{type:'BOOLEAN'}},required:['layer','enabled']}},
    {name:'set_mode',description:'Switch between normal navigation map and realistic 3D map.',parameters:{type:'OBJECT',properties:{mode:{type:'STRING',enum:['nav','3d']}},required:['mode']}},
    {name:'search_place',description:'Move the map to a UK place, road, address or postcode.',parameters:{type:'OBJECT',properties:{query:{type:'STRING'}},required:['query']}},
    {name:'navigate',description:'Prepare navigation to a UK destination.',parameters:{type:'OBJECT',properties:{destination:{type:'STRING'}},required:['destination']}},
    {name:'locate',description:'Show the user current location.'},
    {name:'zoom',description:'Zoom the map.',parameters:{type:'OBJECT',properties:{direction:{type:'STRING',enum:['in','out']}},required:['direction']}}
  ]}];

  async function start(){
    if(active||connecting)return;
    connecting=true;ui.wrap.classList.add('show');state('connecting','Connecting…','Starting Gemini Live');

    const watchdog=setTimeout(()=>{
      if(connecting)state('','Still connecting','If this stays here, reload once and try again');
    },10000);

    try{
      await loadSDK();

      outputCtx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000});
      await outputCtx.resume();

      const tr=await fetch('/live-token',{cache:'no-store'});
      const td=await tr.json().catch(()=>({}));
      if(!tr.ok)throw new Error(td.error||`Live token error ${tr.status}`);

      const ai=new GoogleGenAI({apiKey:td.token});

      session=await ai.live.connect({
        model:'gemini-3.8-live',
        config:{
          responseModalities:[Modality.AUDIO],
          speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Puck'}}},
          systemInstruction:`You are UK Map AI, a natural spoken voice assistant inside a live UK transport map. Speak naturally and briefly. Keep the conversation continuous. After answering, remain ready for the user's next sentence. Use map tools when the user asks you to change the map. Never invent live facts.`,
          tools
        },
        callbacks:{
          onopen:async()=>{
            clearTimeout(watchdog);
            connecting=false;active=true;
            try{
              await startMic();
              state('listening','Listening…','Keep talking — no need to tap again');
            }catch(e){state('','Microphone blocked',e.message||'Allow microphone access')}
          },
          onmessage:handleMessage,
          onerror:(e)=>{
            clearTimeout(watchdog);
            connecting=false;active=false;
            state('','Connection error',e?.message||'Gemini Live connection failed');
          },
          onclose:(e)=>{
            clearTimeout(watchdog);
            cleanup();
            active=false;connecting=false;
            if(ui.wrap.classList.contains('show'))state('','Disconnected',e?.reason||'Tap Ask AI to reconnect');
          }
        }
      });
    }catch(e){
      clearTimeout(watchdog);
      connecting=false;active=false;
      state('','Could not connect',e?.message||'Gemini Live unavailable');
    }
  }

  async function handleMessage(message){
    if(message.toolCall){
      const responses=[];
      for(const fc of message.toolCall.functionCalls||[]){
        let result;
        try{result=await runTool(fc.name,fc.args||{})}
        catch(e){result={ok:false,error:e.message}}
        responses.push({name:fc.name,id:fc.id,response:{result}});
      }
      session?.sendToolResponse({functionResponses:responses});
    }

    const sc=message.serverContent;
    if(!sc)return;

    if(sc.interrupted){
      stopPlayback();
      state('listening','Listening…','Go ahead');
    }

    if(sc.inputTranscription?.text)state('listening','Listening…',sc.inputTranscription.text);
    if(sc.outputTranscription?.text){
      replyText+=sc.outputTranscription.text;
      state('speaking','Speaking…',replyText.trim());
    }

    for(const p of sc.modelTurn?.parts||[]){
      if(p.inlineData?.data)playAudio(p.inlineData.data);
    }

    if(sc.turnComplete){
      replyText='';
      setTimeout(()=>{if(active)state('listening','Listening…','Keep talking — no need to tap again')},140);
    }
  }

  async function startMic(){
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    inputCtx=new (window.AudioContext||window.webkitAudioContext)();
    await inputCtx.resume();
    inputSource=inputCtx.createMediaStreamSource(stream);
    processor=inputCtx.createScriptProcessor(4096,1,1);
    const silent=inputCtx.createGain();silent.gain.value=0;

    processor.onaudioprocess=e=>{
      if(!active||!session)return;
      const pcm=resample(e.inputBuffer.getChannelData(0),inputCtx.sampleRate);
      session.sendRealtimeInput({
        audio:{data:toB64(pcm),mimeType:'audio/pcm;rate=16000'}
      });
    };

    inputSource.connect(processor);processor.connect(silent);silent.connect(inputCtx.destination);
  }

  function resample(input,rate){
    const ratio=rate/16000,len=Math.max(1,Math.floor(input.length/ratio)),out=new Int16Array(len);
    for(let i=0;i<len;i++){
      const p=i*ratio,n=Math.floor(p),f=p-n,a=input[n]||0,b=input[Math.min(n+1,input.length-1)]||0;
      const v=Math.max(-1,Math.min(1,a+(b-a)*f));
      out[i]=v<0?v*32768:v*32767;
    }
    return out;
  }
  function toB64(arr){
    const bytes=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);let s='';
    for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(s);
  }

  function playAudio(b64){
    if(!outputCtx)return;
    const bin=atob(b64),samples=new Int16Array(bin.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=(bin.charCodeAt(i*2)&255)|((bin.charCodeAt(i*2+1)&255)<<8);
    const buf=outputCtx.createBuffer(1,samples.length,24000),ch=buf.getChannelData(0);
    for(let i=0;i<samples.length;i++)ch[i]=samples[i]/32768;
    const src=outputCtx.createBufferSource();src.buffer=buf;src.connect(outputCtx.destination);
    const when=Math.max(outputCtx.currentTime+.02,nextPlay||0);
    src.start(when);nextPlay=when+buf.duration;playing.add(src);src.onended=()=>playing.delete(src);
    state('speaking','Speaking…',replyText.trim()||'Gemini is answering');
  }

  function stopPlayback(){
    for(const s of playing){try{s.stop()}catch(_){}}
    playing.clear();nextPlay=outputCtx?.currentTime||0;
  }

  async function runTool(name,args){
    if(name==='set_layer'){
      const b=$(`.layers button[data-layer="${String(args.layer||'').replace(/[^a-z]/g,'')}"]`);
      if(!b)return {ok:false};
      const wanted=args.enabled!==false;if(b.classList.contains('on')!==wanted)b.click();return {ok:true};
    }
    if(name==='set_mode'){
      const mode=args.mode==='3d'?'3d':'nav',b=$(`.mode[data-mode="${mode}"]`);
      if(b&&!b.classList.contains('active'))b.click();return {ok:!!b};
    }
    if(name==='locate'){$('#locate')?.click();return {ok:true}}
    if(name==='zoom'){(args.direction==='out'?$('#zoomOut'):$('#zoomIn'))?.click();return {ok:true}}
    if(name==='search_place')return search(args.query,false);
    if(name==='navigate')return search(args.destination,true);
    return {ok:false};
  }

  async function search(q,navigate){
    q=String(q||'').trim();const key=window.APP_CONFIG?.TOMTOM_API_KEY;if(!q||!key)return {ok:false};
    const u=`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&limit=1&countrySet=GB&language=en-GB`;
    const r=await fetch(u),d=await r.json(),h=d.results?.[0];if(!h?.position)return {ok:false};
    map.flyTo({center:[h.position.lon,h.position.lat],zoom:13.5,duration:1000});
    if(navigate){
      const input=$('#search');
      if(input){input.value=q;input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}))}
    }
    return {ok:true,name:h.address?.freeformAddress||h.poi?.name||q};
  }

  function cleanup(){
    try{processor?.disconnect()}catch(_){}
    try{inputSource?.disconnect()}catch(_){}
    try{stream?.getTracks().forEach(t=>t.stop())}catch(_){}
    try{inputCtx?.close()}catch(_){}
    stopPlayback();
    processor=inputSource=stream=inputCtx=null;
  }

  function stop(){
    active=false;connecting=false;cleanup();
    try{session?.close()}catch(_){}
    session=null;ui.wrap.classList.remove('show');
  }

  const ask=$('#askTop'),mic=$('#mic');
  if(ask)ask.onclick=e=>{e.preventDefault();start()};
  if(mic)mic.onclick=e=>{e.preventDefault();start()};
  window.UKMapAI={start,stop};
})();