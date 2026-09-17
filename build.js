const fs=require('fs'),path=require('path');
const out='dist';fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const f of ['index.html','style.css','app.js','map-theme.js','traffic-live.js','navigation.js','navigation.css','luxury-ui.js','flights-live.js']){
 if(!fs.existsSync(f)){console.error('Missing required file: '+f);process.exit(1);}
 fs.copyFileSync(f,path.join(out,f));
}
const key=process.env.TOMTOM_API_KEY||'';
if(!key){console.error('TOMTOM_API_KEY is missing in Render Environment Variables');process.exit(1);}
fs.writeFileSync(path.join(out,'config.js'),'window.APP_CONFIG='+JSON.stringify({TOMTOM_API_KEY:key})+';\n');
console.log('Built UK Intelligent Map with live flights.');
