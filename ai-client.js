/* UK Intelligent Map — Gemini 3.8 Live Voice
   Tap Ask AI once. Persistent audio session stays open until Stop/X.
   Map stays visible. Native Gemini audio replies. No chat UI.
*/
(()=>{
  const $=q=>document.querySelector(q);
  const LIVE_MODEL='gemini-3.8-live';
  let ws=null,stream=null,inputCtx=null,processor=null,inputSource=null;
  let outputCtx=null,nextPlayTime=0,playingSources=new Set();
  let sessionOpen=false,connecting=false;
  let inputText='',outputText='';

  injectCSS();
  const ui=buildUI();

  function injectCSS(){
    if($('#gemini-live-css'))return;
    const s=document.createElement('style');s.id='gemini-live-css';
    s.textContent=`
      #geminiLive{
        position:absolute;z-index:78;left:50%;bottom:max(92px,calc(env(safe-area-inset-bottom) + 76px));
        transform:translate(-50%,18px);width:min(92vw,430px);opacity:0;pointer-events:none;transition:.22s;
      }
      #geminiLive.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
      .gl-card{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:24px;border:1px solid rgba(216,255,47,.28);background:rgba(5,11,12,.82);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 18px 45px #0008}
      .gl-orb{width:57px;height:57px;flex:0 0 57px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#efff9c,#d8ff2f 32%,#83a90e 65%,#132006);box-shadow:0 0 28px #d8ff2f44}
      .gl-orb svg{width:25px;height:25px;fill:#071007}.gl-orb.listening{animation:glPulse 1.15s infinite}.gl-orb.speaking{box-shadow:0 0 40px #4fcaff88}.gl-orb.connecting{animation:glSpin 1s linear infinite}
      @keyframes glPulse{50%{transform:scale(1.09);box-shadow:0 0 48px #d8ff2f99}}@keyframes glSpin{to{transform:rotate(360deg)}}
      .gl-copy{flex:1;min-width:0}.gl-copy b{display:block;font-size:14px}.gl-copy span{display:block;color:#aab5b1;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gl-bars{display:flex;align-items:center;gap:3px;height:13px;margin-top:4px}.gl-bars i{width:3px;height:4px;border-radius:3px;background:#d8ff2f66}.gl-listening .gl-bars i{animation:glBar .75s infinite}.gl-listening .gl-bars i:nth-child(2){animation-delay:.08s}.gl-listening .gl-bars i:nth-child(3){animation-delay:.16s}.gl-listening .gl-bars i:nth-child(4){animation-delay:.24s}.gl-listening .gl-bars i:nth-child(5){animation-delay:.32s}
      @keyframes glBar{50%{height:12px;background:#d8ff2f}}
      .gl-stop,.gl-close{width:39px;height:39px;border-radius:50%;border:1px solid #ffffff20;background:#161d1e;color:#fff;font-weight:900}.gl-stop{font-size:12px}.gl-close{font-size:18px}
    `;
    document.head.appendChild(s);
  }

  function buildUI(){
    const w=document.createElement('div');w.id='geminiLive';
    w.innerHTML=`<div class="gl-card"><div class="gl-orb" id="glOrb"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z"/></svg></div><div class="gl-copy"><b id="glStatus">Connecting…</b><span id="glText">Starting live voice</span><div class="gl-bars">${'<i></i>'.repeat(5)}</div></div><button class="gl-stop" type="button">Stop</button><button class="gl-close" type="button">×</button></div>`;
    $('#app').appendChild(w);
    w.querySelector('.gl-stop').onclick=stopSession;
    w.querySelector('.gl-close').onclick=stopSession;
    return {wrap:w,card:w.querySelector('.gl-card'),orb:w.querySelector('#glOrb'),status:w.querySelector('#glStatus'),text:w.querySelector('#glText')};
  }

  function state(kind,status,text){
    ui.orb.classList.remove('listening','speaking','connecting');
    ui.card.classList.remove('gl-listening');
    if(kind==='listening'){ui.orb.classList.add('listening');ui.card.classList.add('gl-listening')}
    if(kind==='speaking')ui.orb.classList.add('speaking');
    if(kind==='connecting')ui.orb.classList.add('connecting');
    ui.status.textContent=status||'';
    ui.text.textContent=text||'';
  }

  const SYSTEM=`You are UK Map AI, a natural spoken voice assistant inside a live UK transport map.
Speak naturally, briefly and conversationally, like a helpful human assistant.
The user speaks continuously with you. After you reply, remain ready for the next thing they say.
Use the map tools whenever the user wants the map changed.
Never invent live traffic, flight, CCTV, train, bus or parking facts. If live data is not available to you, say that briefly and use the appropriate map layer or search tool.
UK locations only unless the user is discussing a flight destination.
Do not say JSON, tool names, or technical implementation details aloud.`;

  const tools=[{functionDeclarations:[
    {name:'set_layer',description:'Turn a map data layer on or off.',parameters:{type:'OBJECT',properties:{layer:{type:'STRING',enum:['traffic','flights','cctv','speed','trains','buses','parking']},enabled:{type:'BOOLEAN'}},required:['layer','enabled']}},
    {name:'set_mode',description:'Switch between normal navigation map and realistic 3D map.',parameters:{type:'OBJECT',properties:{mode:{type:'STRING',enum:['nav','3d']}},required:['mode']}},
    {name:'search_place',description:'Move the map to a UK place, road, address or postcode.',parameters:{type:'OBJECT',properties:{query:{type:'STRING'}},required:['query']}},
    {name:'navigate',description:'Prepare driving navigation to a UK destination.',parameters:{type:'OBJECT',properties:{destination:{type:'STRING'}},required:['destination']}},
    {name:'locate',description:'Show the user current location on the map.'},
    {name:'zoom',description:'Zoom the map.',parameters:{type:'OBJECT',properties:{direction:{type:'STRING',enum:['in','out']}},required:['direction']}}
  ]}];

  async function startSession(){
    if(sessionOpen||connecting)return;
    connecting=true;ui.wrap.classList.add('show');state('connecting','Connecting…','Starting Gemini Live');
    try{
      // This user tap also unlocks audio playback on iPhone.
      outputCtx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000});
      await outputCtx.resume();
      const tr=await fetch('/live-token',{cache:'no-store'}),td=await tr.json();
      if(!tr.ok)throw new Error(td.error||'Could not start Live AI');
      const url=`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(td.token)}`;
      ws=new WebSocket(url);

      ws.onopen=()=>{
        ws.send(JSON.stringify({setup:{
          model:`models/${LIVE_MODEL}`,
          generationConfig:{
            responseModalities:['AUDIO'],
            speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Sulafat'}}}
          },
          systemInstruction:{parts:[{text:SYSTEM}]},
          tools,
          inputAudioTranscription:{},
          outputAudioTranscription:{}
        }}));
      };
      ws.onmessage=handleMessage;
      ws.onerror=()=>{state('','Connection error','Tap Ask AI to try again')};
      ws.onclose=()=>{if(sessionOpen)state('','Disconnected','Tap Ask AI to reconnect');cleanupAudio();sessionOpen=false;connecting=false};
    }catch(e){
      connecting=false;state('', 'Could not connect', e.message||'Live AI unavailable');
    }
  }

  async function handleMessage(ev){
    const msg=JSON.parse(ev.data);
    if(msg.setupComplete){
      connecting=false;sessionOpen=true;
      await startMicrophone();
      state('listening','Listening…','You can keep talking');
      return;
    }
    if(msg.toolCall){await handleToolCall(msg.toolCall);return}
    const sc=msg.serverContent;
    if(!sc)return;

    if(sc.interrupted){
      stopPlayback();
      state('listening','Listening…','Go ahead');
    }
    if(sc.interimInputTranscription?.text){
      inputText=sc.interimInputTranscription.text;state('listening','Listening…',inputText);
    }
    if(sc.inputTranscription?.text){
      inputText=sc.inputTranscription.text;state('','Thinking…',inputText);
    }
    if(sc.outputTranscription?.text){
      outputText+=sc.outputTranscription.text;
      state('speaking','Speaking…',outputText.trim());
    }
    const parts=sc.modelTurn?.parts||[];
    for(const p of parts){
      if(p.inlineData?.data)playPCM24(p.inlineData.data);
    }
    if(sc.turnComplete){
      outputText='';
      setTimeout(()=>{if(sessionOpen)state('listening','Listening…','You can keep talking')},220);
    }
  }

  async function startMicrophone(){
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    inputCtx=new (window.AudioContext||window.webkitAudioContext)();
    await inputCtx.resume();
    inputSource=inputCtx.createMediaStreamSource(stream);
    processor=inputCtx.createScriptProcessor(4096,1,1);
    processor.onaudioprocess=e=>{
      if(!sessionOpen||!ws||ws.readyState!==WebSocket.OPEN)return;
      const floats=e.inputBuffer.getChannelData(0);
      const pcm=resampleTo16k(floats,inputCtx.sampleRate);
      if(!pcm.length)return;
      ws.send(JSON.stringify({realtimeInput:{audio:{data:int16ToB64(pcm),mimeType:'audio/pcm;rate=16000'}}}));
    };
    const silent=inputCtx.createGain();silent.gain.value=0;
    inputSource.connect(processor);processor.connect(silent);silent.connect(inputCtx.destination);
  }

  function resampleTo16k(input,rate){
    if(rate===16000)return floatToInt16(input);
    const ratio=rate/16000;
    const len=Math.floor(input.length/ratio),out=new Int16Array(len);
    for(let i=0;i<len;i++){
      const pos=i*ratio,idx=Math.floor(pos),frac=pos-idx;
      const a=input[idx]||0,b=input[Math.min(idx+1,input.length-1)]||0;
      const v=Math.max(-1,Math.min(1,a+(b-a)*frac));
      out[i]=v<0?v*32768:v*32767;
    }
    return out;
  }
  function floatToInt16(input){
    const out=new Int16Array(input.length);
    for(let i=0;i<input.length;i++){const v=Math.max(-1,Math.min(1,input[i]));out[i]=v<0?v*32768:v*32767}
    return out;
  }
  function int16ToB64(arr){
    const bytes=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);
    let s='';const step=0x8000;
    for(let i=0;i<bytes.length;i+=step)s+=String.fromCharCode(...bytes.subarray(i,i+step));
    return btoa(s);
  }

  function playPCM24(b64){
    if(!outputCtx)return;
    const bin=atob(b64),samples=new Int16Array(bin.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=(bin.charCodeAt(i*2)&255)|((bin.charCodeAt(i*2+1)&255)<<8);
    const buf=outputCtx.createBuffer(1,samples.length,24000),ch=buf.getChannelData(0);
    for(let i=0;i<samples.length;i++)ch[i]=samples[i]/32768;
    const src=outputCtx.createBufferSource();src.buffer=buf;src.connect(outputCtx.destination);
    const when=Math.max(outputCtx.currentTime+0.03,nextPlayTime||0);
    src.start(when);nextPlayTime=when+buf.duration;playingSources.add(src);
    src.onended=()=>playingSources.delete(src);
    state('speaking','Speaking…',outputText.trim()||'Gemini is answering');
  }
  function stopPlayback(){
    for(const s of playingSources){try{s.stop()}catch(_){}}playingSources.clear();
    nextPlayTime=outputCtx?.currentTime||0;
  }

  async function handleToolCall(tc){
    const responses=[];
    for(const fc of tc.functionCalls||[]){
      let result;
      try{result=await runTool(fc.name,fc.args||{})}
      catch(e){result={ok:false,error:e.message}}
      responses.push({name:fc.name,id:fc.id,response:{result}});
    }
    if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({toolResponse:{functionResponses:responses}}));
  }

  async function runTool(name,args){
    if(name==='set_layer'){
      const b=$(`.layers button[data-layer="${String(args.layer||'').replace(/[^a-z]/g,'')}"]`);
      if(!b)return {ok:false};
      const wanted=args.enabled!==false;if(b.classList.contains('on')!==wanted)b.click();
      return {ok:true,layer:args.layer,enabled:wanted};
    }
    if(name==='set_mode'){
      const mode=args.mode==='3d'?'3d':'nav',b=$(`.mode[data-mode="${mode}"]`);
      if(b&&!b.classList.contains('active'))b.click();
      return {ok:!!b,mode};
    }
    if(name==='locate'){$('#locate')?.click();return {ok:true}}
    if(name==='zoom'){(args.direction==='out'?$('#zoomOut'):$('#zoomIn'))?.click();return {ok:true}}
    if(name==='search_place')return await searchPlace(args.query,false);
    if(name==='navigate')return await searchPlace(args.destination,true);
    return {ok:false,error:'unknown tool'};
  }

  async function searchPlace(q,navigate){
    q=String(q||'').trim();const key=window.APP_CONFIG?.TOMTOM_API_KEY;
    if(!q||!key)return {ok:false};
    const u=`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&limit=1&countrySet=GB&language=en-GB`;
    const r=await fetch(u),d=await r.json(),h=d.results?.[0];
    if(!h?.position)return {ok:false,reason:'not found'};
    map.flyTo({center:[h.position.lon,h.position.lat],zoom:13.5,duration:1000});
    if(navigate){
      const input=$('#search');if(input){input.value=q;input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}))}
    }
    return {ok:true,name:h.address?.freeformAddress||h.poi?.name||q,lat:h.position.lat,lng:h.position.lon};
  }

  function cleanupAudio(){
    try{processor?.disconnect()}catch(_){}
    try{inputSource?.disconnect()}catch(_){}
    try{stream?.getTracks().forEach(t=>t.stop())}catch(_){}
    try{inputCtx?.close()}catch(_){}
    stopPlayback();
    processor=inputSource=stream=inputCtx=null;
  }

  function stopSession(){
    sessionOpen=false;connecting=false;
    cleanupAudio();
    try{ws?.close()}catch(_){}
    ws=null;
    ui.wrap.classList.remove('show');
    state('','Stopped','');
  }

  const ask=$('#askTop'),mic=$('#mic');
  if(ask)ask.onclick=e=>{e.preventDefault();startSession()};
  if(mic)mic.onclick=e=>{e.preventDefault();startSession()};

  window.UKMapAI={start:startSession,stop:stopSession};
})();