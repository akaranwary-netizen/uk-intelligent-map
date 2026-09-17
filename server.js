const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=process.env.PORT||10000;
const GEMINI_KEY=process.env.GEMINI_API_KEY||'';
const MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash-lite';
const DIST=path.join(__dirname,'dist');

function json(res,status,obj){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',c=>{
      body+=c;
      if(body.length>20000){reject(new Error('Request too large'));req.destroy();}
    });
    req.on('end',()=>resolve(body));
    req.on('error',reject);
  });
}
function cleanJSON(s){
  const t=String(s||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(t);
}
function extractText(g){
  return g?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
}
const system=`You are the command brain for UK INTELLIGENT MAP, a UK-only live transport and navigation map.
Return ONLY valid JSON:
{"reply":"short natural reply","actions":[...]}

Allowed actions:
{"type":"set_layer","layer":"traffic|flights|cctv|speed|trains|buses|parking","enabled":true}
{"type":"set_mode","mode":"nav|3d"}
{"type":"search_place","query":"UK place/address/postcode"}
{"type":"navigate","destination":"UK place/address/postcode"}
{"type":"locate"}
{"type":"zoom","direction":"in|out"}
{"type":"zoom","level":12}

Rules:
- Never invent live traffic, flight, CCTV, bus, train, parking or incident facts.
- Use actions to make the map display real provider data instead of claiming facts you cannot see.
- UK locations only.
- For "show flights over Bristol", use search_place Bristol + set_layer flights true.
- For traffic requests, enable traffic and search the named place/road when useful.
- For navigation requests use navigate.
- For realistic/3D/satellite view, use set_mode 3d.
- Keep reply concise.
- No markdown or text outside JSON.`;

async function handleAI(req,res){
  if(!GEMINI_KEY)return json(res,500,{error:'GEMINI_API_KEY is not configured in Render.'});
  try{
    const body=JSON.parse(await readBody(req)||'{}');
    const message=String(body.message||'').trim().slice(0,2000);
    if(!message)return json(res,400,{error:'Message is required.'});
    const payload={
      system_instruction:{parts:[{text:system}]},
      contents:[{role:'user',parts:[{text:`User request: ${message}\nMap context: ${JSON.stringify(body.context||{})}`}]}],
      generationConfig:{temperature:.1,responseMimeType:'application/json',maxOutputTokens:700}
    };
    const gr=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_KEY},
      body:JSON.stringify(payload)
    });
    const gd=await gr.json();
    if(!gr.ok)throw new Error(gd?.error?.message||`Gemini HTTP ${gr.status}`);
    const parsed=cleanJSON(extractText(gd));
    return json(res,200,{
      reply:String(parsed.reply||'Done.').slice(0,500),
      actions:Array.isArray(parsed.actions)?parsed.actions.slice(0,8):[]
    });
  }catch(e){
    console.error(e);
    return json(res,500,{error:e.message||'AI request failed'});
  }
}
function mime(p){
  const e=path.extname(p).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'}[e]||'application/octet-stream');
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='POST'&&req.url==='/ai')return handleAI(req,res);
  if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,ai:!!GEMINI_KEY,model:MODEL});

  let urlPath=decodeURIComponent((req.url||'/').split('?')[0]);
  if(urlPath==='/')urlPath='/index.html';
  const safe=path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let file=path.join(DIST,safe);
  if(!file.startsWith(DIST))return json(res,403,{error:'Forbidden'});
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){
      file=path.join(DIST,'index.html');
    }
    fs.readFile(file,(e,data)=>{
      if(e){res.statusCode=404;return res.end('Not found')}
      res.statusCode=200;res.setHeader('Content-Type',mime(file));res.end(data);
    });
  });
});
server.listen(PORT,()=>console.log(`UK Intelligent Map running on ${PORT} with Gemini ${MODEL}`));
