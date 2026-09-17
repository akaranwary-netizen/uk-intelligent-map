const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=process.env.PORT||10000;
const GEMINI_KEY=String(process.env.GEMINI_API_KEY||'').trim();
const MODEL=String(process.env.GEMINI_MODEL||'gemini-2.5-flash-lite').trim();
const DIST=path.join(__dirname,'dist');

function sendJSON(res,status,obj){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',chunk=>{
      body+=chunk;
      if(body.length>30000){reject(new Error('Request too large'));req.destroy();}
    });
    req.on('end',()=>resolve(body));
    req.on('error',reject);
  });
}
function extractText(data){
  return data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
}
function parseModelJSON(raw){
  let t=String(raw||'').trim();
  t=t.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```$/,'').trim();
  const first=t.indexOf('{'),last=t.lastIndexOf('}');
  if(first>=0&&last>first)t=t.slice(first,last+1);
  return JSON.parse(t);
}
const SYSTEM=`You are the command brain for UK INTELLIGENT MAP.
Return ONLY valid JSON:
{"reply":"short natural reply","actions":[]}

Allowed actions:
{"type":"set_layer","layer":"traffic|flights|cctv|speed|trains|buses|parking","enabled":true}
{"type":"set_mode","mode":"nav|3d"}
{"type":"search_place","query":"UK place/address/postcode"}
{"type":"navigate","destination":"UK place/address/postcode"}
{"type":"locate"}
{"type":"zoom","direction":"in|out"}
{"type":"zoom","level":12}

Rules:
- UK map only.
- Never invent live facts.
- For "show flights over Bristol": search Bristol and enable flights.
- For traffic requests: enable traffic and search the named road/place when useful.
- For navigation: use navigate.
- For realistic/3D/satellite: set_mode 3d.
- Keep reply short.
- No markdown and no text outside JSON.`;

async function handleAI(req,res){
  if(!GEMINI_KEY)return sendJSON(res,500,{error:'GEMINI_API_KEY is missing in Render Environment.'});
  try{
    const body=JSON.parse(await readBody(req)||'{}');
    const message=String(body.message||'').trim().slice(0,2000);
    if(!message)return sendJSON(res,400,{error:'Message is required.'});

    const payload={
      system_instruction:{parts:[{text:SYSTEM}]},
      contents:[{parts:[{text:`User request: ${message}\nMap context: ${JSON.stringify(body.context||{})}`}]}],
      generationConfig:{
        temperature:0.1,
        responseMimeType:'application/json',
        maxOutputTokens:700
      }
    };

    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':GEMINI_KEY
      },
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const m=data?.error?.message||`Gemini API error ${response.status}`;
      return sendJSON(res,response.status,{error:m});
    }

    const raw=extractText(data);
    if(!raw)return sendJSON(res,502,{error:'Gemini returned an empty response.'});
    const parsed=parseModelJSON(raw);
    return sendJSON(res,200,{
      reply:String(parsed.reply||'Done.').slice(0,500),
      actions:Array.isArray(parsed.actions)?parsed.actions.slice(0,8):[]
    });
  }catch(err){
    console.error('AI backend error:',err);
    return sendJSON(res,500,{error:`AI backend: ${err?.message||String(err)}`});
  }
}

function mime(file){
  return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[path.extname(file).toLowerCase()]||'application/octet-stream');
}
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='POST'&&pathname==='/ai')return handleAI(req,res);
  if(req.method==='GET'&&pathname==='/health')return sendJSON(res,200,{ok:true,gemini_key:!!GEMINI_KEY,model:MODEL});

  let rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');
  rel=path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file=path.join(DIST,rel);
  if(!file.startsWith(DIST))return sendJSON(res,403,{error:'Forbidden'});
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile())file=path.join(DIST,'index.html');
    fs.readFile(file,(e,data)=>{
      if(e){res.statusCode=404;return res.end('Not found');}
      res.statusCode=200;
      res.setHeader('Content-Type',mime(file));
      res.end(data);
    });
  });
});
server.listen(PORT,()=>console.log(`UK Intelligent Map running on ${PORT}; Gemini=${MODEL}; key=${GEMINI_KEY?'yes':'no'}`));
