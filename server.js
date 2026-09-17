const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=process.env.PORT||10000;
const GEMINI_KEY=String(process.env.GEMINI_API_KEY||'').trim();
const DIST=path.join(__dirname,'dist');

function sendJSON(res,status,obj){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function mime(file){
  return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[path.extname(file).toLowerCase()]||'application/octet-stream');
}

async function makeLiveToken(res){
  if(!GEMINI_KEY)return sendJSON(res,500,{error:'GEMINI_API_KEY is missing in Render.'});
  try{
    const now=Date.now();
    const body={
      uses:1,
      expireTime:new Date(now+25*60*1000).toISOString(),
      newSessionExpireTime:new Date(now+60*1000).toISOString()
    };

    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':GEMINI_KEY
      },
      body:JSON.stringify(body)
    });

    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      console.error('Gemini token response',r.status,d);
      return sendJSON(res,r.status,{error:d?.error?.message||`Gemini token error ${r.status}`});
    }
    if(!d.name)return sendJSON(res,502,{error:'Gemini did not return a Live token.'});
    sendJSON(res,200,{token:d.name});
  }catch(e){
    console.error('Token error',e);
    sendJSON(res,500,{error:e.message||'Could not create Live token'});
  }
}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;

  if(req.method==='GET'&&pathname==='/live-token')return makeLiveToken(res);

  if(req.method==='GET'&&pathname==='/health'){
    return sendJSON(res,200,{
      ok:true,
      gemini_key:!!GEMINI_KEY,
      live_model:'gemini-3.8-live',
      live_auth:'ephemeral-token'
    });
  }

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

server.listen(PORT,()=>console.log(`UK Intelligent Map running on ${PORT}; Gemini key=${GEMINI_KEY?'yes':'no'}`));
