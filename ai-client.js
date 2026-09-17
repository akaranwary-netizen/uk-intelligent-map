/* UK Intelligent Map — Gemini Live one-tap voice
   Uses secure short-lived token from /live-token.
   No extra npm/websocket package required.
*/
(()=>{
  const $=q=>document.querySelector(q);
  const MODEL='gemini-3.8-live';

  let ws=null;
  let stream=null,inputCtx=null,processor=null,inputSource=null;
  let outputCtx=null,nextPlay=0,playing=new Set();
  let active=false,connecting=false,replyText='';

  injectCSS();
  const ui=build();

  function injectCSS(){
    if($('#gemini-live-css'))return;
    const s=document.createElement('style');
    s.id='gemini-live-css';
    s.textContent=`
      #geminiLive{position:absolute;z-index:78;left:50%;bottom:max(92px,calc(env(safe-area-inset-bottom) + 76px));transform:translate(-50%,18px);width:min(92vw,430px);opacity:0;pointer-events:none;transition:.22s}
      #geminiLive.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
      .gl-card{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:24px;border:1px solid rgba(216,255,47,.28);background:rgba(5,11,12,.84);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 18px 45px #0008}
      .gl-orb{width:57px;height:57px;flex:0 0 57px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#efff9c,#d8ff2f 32%,#83a90e 65%,#132006);box-shadow:0 0 28px #d8ff2f44}
      .gl-orb svg{width:25px;height:25px;fill:#071007}
      .gl-orb.listening{animation:glPulse 1.15s infinite}
      .gl-orb.speaking{box-shadow:0 0 42px #4fcaff88}
      .gl-orb.connecting{animation:glSpin 1s linear infinite}
      @keyframes glPulse{50%{transform:scale(1.09);box-shadow:0 0 48px #d8ff2f99}}
      @keyframes glSpin{to{transform:rotate(360deg)}}
      .gl-copy{flex:1;min-width:0}.gl-copy b{display:block;font-size:14px}.gl-copy span{display:block;color:#aab5b1;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gl-bars{display:flex;align-items:center;gap:3px;height:13px;margin-top:4px}.gl-bars i{width:3px;height:4px;border-radius:3px;background:#d8ff2f66}
      .gl-listening .gl-bars i{animation:glBar .75s infinite}.gl-listening .gl-bars i:nth-child(2){animation-delay:.08s}.gl-listening .gl-bars i:nth-child(3){animation-delay:.16s}.gl-listening .gl-bars i:nth-child(4){animation-delay:.24s}.gl-listening .gl-bars i:nth-child(5){animation-delay:.32s}
      @keyframes glBar{50%{height:12px;background:#d8ff2f}}
      .gl-stop,.gl-close{width:39px;height:39px;border-radius:50%;border:1px solid #ffffff20;background:#161d1e;color:#fff;font-weight:900}.gl-stop{font-size:11px}.gl-close{font-size:18px}
    `;
    document.head.appendChild(s);
  }

  function build(){
    const w=document.createElement('div');
    w.id='geminiLive';
    w.innerHTML=`<div class="gl-card">
      <div class="gl-orb" id="glOrb"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z"/></svg></div>
      <div class="gl-copy"><b id="glStatus">Connecting…</b><span id="glText">Starting live voice</span><div class="gl-bars">${'<i></i>'.repeat(5)}</div></div>
      <button class="gl-stop" type="button">Stop</button><button class="gl-close" type="button">×</button>
    </div>`;
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
    ui.status.textContent=status||'';
    ui.text.textContent=text||'';
  }

  const instructions=`You are UK Map AI, a natural spoken voice assistant inside a live UK transport map.
Speak naturally, briefly and conversationally.
This is a continuous voice session. After replying, stay ready for the next thing the user says.
Never invent live traffic, flight, CCTV, train, bus or parking facts.
Do not mention technical implementation details.`;

  async function start(){
    if(active||connecting)return;
    connecting=true;
    ui.wrap.classList.add('show');
    state('connecting','Connecting…','Starting Gemini Live');

    try{
      outputCtx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:24000});
      await outputCtx.resume();

      const tr=await fetch('/live-token',{cache:'no-store'});
      const td=await tr.json().catch(()=>({}));
      if(!tr.ok)throw new Error(td.error||`Live token error ${tr.status}`);

      const url=`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(td.token)}`;
      ws=new WebSocket(url);

      ws.onopen=()=>{
        ws.send(JSON.stringify({setup:{
          model:`models/${MODEL}`,
          generationConfig:{
            responseModalities:['AUDIO'],
            speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Puck'}}}
          },
          systemInstruction:{parts:[{text:instructions}]},
          inputAudioTranscription:{},
          outputAudioTranscription:{}
        }}));
      };

      ws.onmessage=handle;
      ws.onerror=()=>state('','Connection error','Tap Ask AI to try again');
      ws.onclose=e=>{
        cleanup();
        active=false;
        connecting=false;
        if(ui.wrap.classList.contains('show'))state('','Disconnected',e.reason||'Tap Ask AI to reconnect');
      };
    }catch(e){
      connecting=false;
      state('','Could not connect',e.message||'Live AI unavailable');
    }
  }

  async function handle(ev){
    let msg;
    try{msg=JSON.parse(ev.data)}catch(_){return}

    if(msg.setupComplete){
      connecting=false;
      active=true;
      try{
        await startMic();
        state('listening','Listening…','Keep talking — no need to tap again');
      }catch(e){
        state('','Microphone blocked',e.message||'Allow microphone access');
      }
      return;
    }

    const sc=msg.serverContent;
    if(!sc)return;

    if(sc.interrupted){
      stopPlayback();
      state('listening','Listening…','Go ahead');
    }

    const heard=sc.inputTranscription?.text||sc.interimInputTranscription?.text;
    if(heard)state('listening','Listening…',heard);

    const out=sc.outputTranscription?.text;
    if(out){
      replyText+=out;
      state('speaking','Speaking…',replyText.trim());
    }

    for(const p of sc.modelTurn?.parts||[]){
      if(p.inlineData?.data)playAudio(p.inlineData.data);
    }

    if(sc.turnComplete){
      replyText='';
      setTimeout(()=>{if(active)state('listening','Listening…','Keep talking — no need to tap again')},180);
    }
  }

  async function startMic(){
    stream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:false
    });

    inputCtx=new (window.AudioContext||window.webkitAudioContext)();
    await inputCtx.resume();
    inputSource=inputCtx.createMediaStreamSource(stream);
    processor=inputCtx.createScriptProcessor(4096,1,1);

    const silent=inputCtx.createGain();
    silent.gain.value=0;

    processor.onaudioprocess=e=>{
      if(!active||!ws||ws.readyState!==WebSocket.OPEN)return;
      const pcm=resample(e.inputBuffer.getChannelData(0),inputCtx.sampleRate);
      ws.send(JSON.stringify({
        realtimeInput:{
          audio:{data:toB64(pcm),mimeType:'audio/pcm;rate=16000'}
        }
      }));
    };

    inputSource.connect(processor);
    processor.connect(silent);
    silent.connect(inputCtx.destination);
  }

  function resample(input,rate){
    const ratio=rate/16000;
    const len=Math.max(1,Math.floor(input.length/ratio));
    const out=new Int16Array(len);
    for(let i=0;i<len;i++){
      const p=i*ratio,n=Math.floor(p),f=p-n;
      const a=input[n]||0,b=input[Math.min(n+1,input.length-1)]||0;
      const v=Math.max(-1,Math.min(1,a+(b-a)*f));
      out[i]=v<0?v*32768:v*32767;
    }
    return out;
  }

  function toB64(arr){
    const bytes=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);
    let s='';
    for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(s);
  }

  function playAudio(b64){
    if(!outputCtx)return;
    const bin=atob(b64);
    const samples=new Int16Array(bin.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=(bin.charCodeAt(i*2)&255)|((bin.charCodeAt(i*2+1)&255)<<8);

    const buf=outputCtx.createBuffer(1,samples.length,24000);
    const ch=buf.getChannelData(0);
    for(let i=0;i<samples.length;i++)ch[i]=samples[i]/32768;

    const src=outputCtx.createBufferSource();
    src.buffer=buf;
    src.connect(outputCtx.destination);

    const when=Math.max(outputCtx.currentTime+.02,nextPlay||0);
    src.start(when);
    nextPlay=when+buf.duration;
    playing.add(src);
    src.onended=()=>playing.delete(src);

    state('speaking','Speaking…',replyText.trim()||'Gemini is answering');
  }

  function stopPlayback(){
    for(const s of playing){try{s.stop()}catch(_){}}
    playing.clear();
    nextPlay=outputCtx?.currentTime||0;
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
    active=false;
    connecting=false;
    cleanup();
    try{ws?.close()}catch(_){}
    ws=null;
    ui.wrap.classList.remove('show');
  }

  const ask=$('#askTop'),mic=$('#mic');
  if(ask)ask.onclick=e=>{e.preventDefault();start()};
  if(mic)mic.onclick=e=>{e.preventDefault();start()};

  window.UKMapAI={start,stop};
})();