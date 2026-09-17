const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=process.env.PORT||10000;
const GEMINI_KEY=String(process.env.GEMINI_API_KEY||'').trim();
const TEXT_MODEL=String(process.env.GEMINI_MODEL||'gemini-3.5-flash-lite').trim();
const LIVE_MODEL='gemini-3.8-live';
const DIST=path.join(__dirname,'dist');

function sendJSON(res,status,obj){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',c=>{body+=c;if(body.length>30000){reject(new Error('Request too large'));req.destroy();}});
    req.on('end',()=>resolve(body));req.on('error',reject);
  });
}
function extractText(data){
  return data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
}
function parseModelJSON(raw){
  let t=String(raw||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim();
  const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a)t=t.slice(a,b+1);
  return JSON.parse(t);
}

const TEXT_SYSTEM=`You are the command brain for UK INTELLIGENT MAP.
Return ONLY JSON: {"reply":"short natural reply","actions":[]}.
Never invent live facts. UK map only.`;

async function handleTextAI(req,res){
  if(!GEMINI_KEY)return sendJSON(res,500,{error:'GEMINI_API_KEY is missing.'});
  try{
    const body=JSON.parse(await readBody(req)||'{}');
    const message=String(body.message||'').trim();
    const payload={
      system_instruction:{parts:[{text:TEXT_SYSTEM}]},
      contents:[{parts:[{text:`User request: ${message}\nContext: ${JSON.stringify(body.context||{})}`}]}],
      generationConfig:{temperature:.1,responseMimeType:'application/json',maxOutputTokens:700}
    };
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(TEXT_MODEL)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY},body:JSON.stringify(payload)
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d?.error?.message||`Gemini ${r.status}`);
    const p=parseModelJSON(extractText(d));
    sendJSON(res,200,{reply:String(p.reply||'Done.'),actions:Array.isArray(p.actions)?p.actions:[]});
  }catch(e){sendJSON(res,500,{error:e.message||'AI request failed'});}
}

async function handleLiveToken(res){
  if(!GEMINI_KEY)return sendJSON(res,500,{error:'GEMINI_API_KEY is missing.'});
  try{
    const now=Date.now();
    const payload={
      uses:1,
      expireTime:new Date(now+30*60*1000).toISOString(),
      newSessionExpireTime:new Date(now+60*1000).toISOString(),
      liveConnectConstraints:{
        model:`models/${LIVE_MODEL}`,
        config:{
          sessionResumption:{},
          responseModalities:['AUDIO']
        }
      }
    };
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY},
      body:JSON.stringify(payload)
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d?.error?.message||`Token service ${r.status}`);
    sendJSON(res,200,{token:d.name,model:LIVE_MODEL,expires:d.expireTime||payload.expireTime});
  }catch(e){
    console.error('Live token error',e);
    sendJSON(res,500,{error:e.message||'Could not create Live token'});
  }
}

function mime(file){
  return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[path.extname(file).toLowerCase()]||'application/octet-stream');
}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&pathname==='/live-token')return handleLiveToken(res);
  if(req.method==='POST'&&pathname==='/ai')return handleTextAI(req,res);
  if(req.method==='GET'&&pathname==='/health')return sendJSON(res,200,{ok:true,gemini_key:!!GEMINI_KEY,text_model:TEXT_MODEL,live_model:LIVE_MODEL});

  let rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');
  rel=path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file=path.join(DIST,rel);
  if(!file.startsWith(DIST))return sendJSON(res,403,{error:'Forbidden'});
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile())file=path.join(DIST,'index.html');
    fs.readFile(file,(e,data)=>{
      if(e){res.statusCode=404;return res.end('Not found');}
      res.statusCode=200;res.setHeader('Content-Type',mime(file));res.end(data);
    });
  });
});
server.listen(PORT,()=>console.log(`UK Intelligent Map on ${PORT}; Live=${LIVE_MODEL}; key=${GEMINI_KEY?'yes':'no'}`));
