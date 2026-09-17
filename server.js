const http=require('http');
const fs=require('fs');
const path=require('path');
const WebSocket=require('ws');

const PORT=process.env.PORT||10000;
const GEMINI_KEY=String(process.env.GEMINI_API_KEY||'').trim();
const DIST=path.join(__dirname,'dist');

function json(res,status,obj){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function mime(file){
  return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[path.extname(file).toLowerCase()]||'application/octet-stream');
}

const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&pathname==='/health'){
    return json(res,200,{ok:true,gemini_key:!!GEMINI_KEY,live_model:'gemini-3.8-live',live_transport:'server-relay'});
  }

  let rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');
  rel=path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file=path.join(DIST,rel);
  if(!file.startsWith(DIST))return json(res,403,{error:'Forbidden'});
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile())file=path.join(DIST,'index.html');
    fs.readFile(file,(e,data)=>{
      if(e){res.statusCode=404;return res.end('Not found')}
      res.statusCode=200;res.setHeader('Content-Type',mime(file));res.end(data);
    });
  });
});

const wss=new WebSocket.Server({noServer:true});

server.on('upgrade',(req,socket,head)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname!=='/live'){socket.destroy();return}
  if(!GEMINI_KEY){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return}

  wss.handleUpgrade(req,socket,head,(client)=>{
    const google=new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(GEMINI_KEY)}`
    );

    let queue=[];
    google.on('open',()=>{
      for(const m of queue)google.send(m);
      queue=[];
    });

    client.on('message',data=>{
      if(google.readyState===WebSocket.OPEN)google.send(data);
      else if(google.readyState===WebSocket.CONNECTING)queue.push(data);
    });

    google.on('message',data=>{
      if(client.readyState===WebSocket.OPEN)client.send(data);
    });

    google.on('close',(code,reason)=>{
      if(client.readyState===WebSocket.OPEN)client.close(code||1000,String(reason||'Gemini closed'));
    });

    google.on('error',err=>{
      console.error('Gemini Live websocket:',err.message);
      if(client.readyState===WebSocket.OPEN){
        client.send(JSON.stringify({proxyError:err.message||'Gemini Live connection failed'}));
        client.close(1011,'Gemini Live error');
      }
    });

    client.on('close',()=>{
      if(google.readyState===WebSocket.OPEN||google.readyState===WebSocket.CONNECTING)google.close();
    });

    client.on('error',()=>{try{google.close()}catch(_){}});
  });
});

server.listen(PORT,()=>console.log(`UK Intelligent Map on ${PORT}; Gemini Live relay ready=${!!GEMINI_KEY}`));
