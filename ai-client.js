/* UK Intelligent Map — Gemini 3.8 Live, one-tap continuous voice
   Map stays visible. Browser connects only to your own Render server.
*/
(()=>{
  const $=q=>document.querySelector(q);
  const MODEL='gemini-3.8-live';
  let ws=null,stream=null,inputCtx=null,processor=null,inputSource=null;
  let outputCtx=null,nextPlayTime=0,playing=new Set();
  let active=false,connecting=false,answerText='';

  injectCSS();
  const ui=buildUI();

  function injectCSS(){
    if($('#gemini-live-css'))return;
    const s=document.createElement('style');s.id='gemini-live-css';
    s.textContent=`
      #geminiLive{position:absolute;z-index:78;left:50%;bottom:max(92px,calc(env(safe-area-inset-bottom) + 76px));transform:translate(-50%,18px);width:min(92vw,430px);opacity:0;pointer-events:none;transition:.22s}
      #geminiLive.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
      .gl-card{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:24px;border:1px solid rgba(216,255,47,.28);background:rgba(5,11,12,.82);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 18px 45px #0008}
      .gl-orb{width:57px;height:57px;flex:0 0 57px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#efff9c,#d8ff2f 32%,#83a90e 65%,#132006);box-shadow:0 0 28px #d8ff2f44}
      .gl-orb svg{width:25px;height:25px;fill:#071007}.gl-orb.listening{animation:glPulse 1.15s infinite}.gl-orb.speaking{box-shadow:0 0 40px #4fcaff88}.gl-orb.connecting{animation:glSpin 1s linear infinite}
      @keyframes glPulse{50%{transform:scale(1.09);box-shadow:0 0 48px #d8ff2f99}}@keyframes glSpin{to{transform:rotate(360deg)}}
      .gl-copy{flex:1;min-width:0}.gl-copy b{display:block;font-size:14px}.gl-copy span{display:block;color:#aab5b1;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gl-bars{display:flex;align-items:center;gap:3px;height:13px;margin-top:4px}.gl-bars i{width:3px;height:4px;border-radius:3px;background:#d8ff2f66}.gl-listening .gl-bars i{animation:glBar .75s infinite}.gl-listening .gl-bars i:nth-child(2){animation-delay:.08s}.gl-listening .gl-bars i:nth-child(3){animation-delay:.16s}.gl-listening .gl-bars i:nth-child(4){animation-delay:.24s}.gl-listening .gl-bars i:nth-child(5){animation-delay:.32s}
      @keyframes glBar{50%{height:12px;background:#d8ff2f}}
      .gl-stop,.gl-close{width:39px;height:39px;border-radius:50%;border:1px solid #ffffff20;background:#161d1e;color:#fff;font-weight:900}.gl-stop{font-size:11px}.gl-close{font-size:18px}
    `;
    document.head.appendChild(s);
  }

  function buildUI(){
    const w=document.createElement('div');w.id='geminiLive';
    w.innerHTML=`<div class="gl-card"><div class="gl-orb" id="glOrb"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z"/></svg></div><div class="gl-copy"><b id="glStatus">Connecting…</b><span id="glText">Starting live voice</span><div class="gl-bars">${'<i></i>'.repeat(5)}</div></div><button class="gl-stop" type="button">Stop</button><button class="gl-close" type="button">×</button></div>`;
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

  const systemInstruction=`You are UK Map AI, a natural spoken voice assistant inside a live UK transport map.
Speak naturally and briefly, like a helpful human assistant. Do not sound formal or robotic.
This is one continuous conversation: after you reply, stay ready for the user's next sentence.
Use the map tools when the user asks to change the map.
Never invent live traffic, flight, CCTV, train, bus, or parking facts.
Do not mention JSON, APIs, tools, or implementation details aloud.`;

  const tools=[{functionDeclarations:[
    {name:'set_layer',description:'Turn a live map layer on or off.',behavior:'BLOCKING',parameters:{type:'OBJECT',properties:{layer:{type:'STRING',enum:['traffic','flights','cctv','speed','trains','buses','parking']},enabled:{type:'BOOLEAN'}},required:['layer','enabled']}},
    {name:'set_mode',description:'Switch map mode.',behavior:'BLOCKING',parameters:{type:'OBJECT',properties:{mode:{type:'STRING',enum:['nav','3d']}},required:['mode']}},
    {name:'search_place',description:'Move the map to a UK place, road, address or postcode.',behavior:'BLOCKING',parameters:{type:'OBJECT',properties:{query:{type:'STRING'}},required:['query']}},
    {name:'navigate',description:'Prepare driving navigation to a UK destination.',behavior:'BLOCKING',parameters:{type:'OBJECT',properties:{destination:{type:'STRING'}},required:['destination']}},
    {name:'locate',description:'Show the user current location.',behavior:'BLOCKING'},
    {name:'zoom',description:'Zoom the map.',behavior:'BLOCKING',parameters:{type:'OBJECT',properties:{direction:{type:'STRING',enum:['in','out']}},required:['direction']}}
  ]}];

  async function start(){
    if(active||connecting)return;
    connecting=true;ui.wrap.classList.add('show');state('connecting','Connecting…','Starting Gemini Live');
    try{
      outputCtx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000});
      await outputCtx.resume();

      const proto=location.protocol==='https:'?'wss:':'ws:';
      ws=new WebSocket(`${proto}//${location.host}/live`);
      ws.binaryType='arraybuffer';

      ws.onopen=()=>{
        ws.send(JSON.stringify({setup:{
          model:`models/${MODEL}`,
          generationConfig:{
            responseModalities:['AUDIO'],
            speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Puck'}}}
          },
          systemInstruction:{parts:[{text:systemInstruction}]},
          tools,
          inputAudioTranscription:{},
          outputAudioTranscription:{}
        }}));
      };
      ws.onmessage=handle;
      ws.onerror=()=>state('','Connection error','Tap Ask AI to try again');
      ws.onclose=e=>{
        cleanupAudio();
        active=false;connecting=false;
        if(ui.wrap.classList.contains('show'))state('','Disconnected',e.reason||'Tap Ask AI to reconnect');
      };
    }catch(e){
      connecting=false;state('','Could not connect',e.message||'Live AI unavailable');
    }
  }

  async function handle(ev){
    let msg;
    try{
      const text=typeof ev.data==='string'?ev.data:new TextDecoder().decode(ev.data);
      msg=JSON.parse(text);
    }catch(_){return}

    if(msg.proxyError){state('','Connection error',msg.proxyError);return}

    if(msg.setupComplete){
      connecting=false;active=true;
      try{
        await startMic();
        state('listening','Listening…','Keep talking — no need to tap again');
      }catch(e){
        state('','Microphone blocked',e.message||'Allow microphone access');
      }
      return;
    }

    if(msg.toolCall){await handleTools(msg.toolCall);return}
    const sc=msg.serverContent;if(!sc)return;

    if(sc.interrupted){stopPlayback();state('listening','Listening…','Go ahead')}

    const inText=sc.inputTranscription?.text||sc.interimInputTranscription?.text;
    if(inText)state('listening','Listening…',inText);

    const outText=sc.outputTranscription?.text;
    if(outText){answerText+=outText;state('speaking','Speaking…',answerText.trim())}

    for(const p of sc.modelTurn?.parts||[]){
      if(p.inlineData?.data)playAudio(p.inlineData.data);
    }

    if(sc.turnComplete){
      answerText='';
      setTimeout(()=>{if(active)state('listening','Listening…','Keep talking — no need to tap again')},150);
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
      if(!active||!ws||ws.readyState!==WebSocket.OPEN)return;
      const pcm=resample(e.inputBuffer.getChannelData(0),inputCtx.sampleRate);
      if(!pcm.length)return;
      ws.send(JSON.stringify({realtimeInput:{audio:{data:toB64(pcm),mimeType:'audio/pcm;rate=16000'}}}));
    };
    inputSource.connect(processor);processor.connect(silent);silent.connect(inputCtx.destination);
  }

  function resample(input,rate){
    const ratio=rate/16000,len=Math.floor(input.length/ratio),out=new Int16Array(len);
    for(let i=0;i<len;i++){
      const p=i*ratio,n=Math.floor(p),f=p-n;
      const v=Math.max(-1,Math.min(1,(input[n]||0)+((input[Math.min(n+1,input.length-1)]||0)-(input[n]||0))*f));
      out[i]=v<0?v*32768:v*32767;
    }
    return out;
  }
  function toB64(arr){
    const b=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);let s='';
    for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));
    return btoa(s);
  }

  function playAudio(b64){
    if(!outputCtx)return;
    const bin=atob(b64),samples=new Int16Array(bin.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=(bin.charCodeAt(i*2)&255)|((bin.charCodeAt(i*2+1)&255)<<8);
    const buf=outputCtx.createBuffer(1,samples.length,24000),ch=buf.getChannelData(0);
    for(let i=0;i<samples.length;i++)ch[i]=samples[i]/32768;
    const src=outputCtx.createBufferSource();src.buffer=buf;src.connect(outputCtx.destination);
    const when=Math.max(outputCtx.currentTime+.02,nextPlayTime||0);
    src.start(when);nextPlayTime=when+buf.duration;playing.add(src);src.onended=()=>playing.delete(src);
    state('speaking','Speaking…',answerText.trim()||'Gemini is answering');
  }
  function stopPlayback(){
    for(const s of playing){try{s.stop()}catch(_){}}playing.clear();nextPlayTime=outputCtx?.currentTime||0;
  }

  async function handleTools(call){
    const responses=[];
    for(const fc of call.functionCalls||[]){
      let result;
      try{result=await runTool(fc.name,fc.args||{})}catch(e){result={ok:false,error:e.message}}
      responses.push({name:fc.name,id:fc.id,response:{result}});
    }
    if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({toolResponse:{functionResponses:responses}}));
  }

  async function runTool(name,args){
    if(name==='set_layer'){
      const b=$(`.layers button[data-layer="${String(args.layer||'').replace(/[^a-z]/g,'')}"]`);
      if(!b)return {ok:false};const wanted=args.enabled!==false;if(b.classList.contains('on')!==wanted)b.click();return {ok:true};
    }
    if(name==='set_mode'){
      const mode=args.mode==='3d'?'3d':'nav',b=$(`.mode[data-mode="${mode}"]`);if(b&&!b.classList.contains('active'))b.click();return {ok:!!b};
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
    if(navigate){const input=$('#search');if(input){input.value=q;input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}))}}
    return {ok:true,name:h.address?.freeformAddress||h.poi?.name||q};
  }

  function cleanupAudio(){
    try{processor?.disconnect()}catch(_){}
    try{inputSource?.disconnect()}catch(_){}
    try{stream?.getTracks().forEach(t=>t.stop())}catch(_){}
    try{inputCtx?.close()}catch(_){}
    stopPlayback();
    processor=inputSource=stream=inputCtx=null;
  }

  function stop(){
    active=false;connecting=false;cleanupAudio();
    try{ws?.close()}catch(_){}
    ws=null;ui.wrap.classList.remove('show');
  }

  const a=$('#askTop'),m=$('#mic');
  if(a)a.onclick=e=>{e.preventDefault();start()};
  if(m)m.onclick=e=>{e.preventDefault();start()};
  window.UKMapAI={start,stop};
})();