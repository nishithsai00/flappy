const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PUB=path.join(__dirname,'public'),BUCKET='assets';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/aac':'aac','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/webm':'webm'};
const parse=v=>{const m=/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(v);return m&&EXT[m[1]]?{mime:m[1],buf:Buffer.from(m[2],'base64')}:null};
const envSb=process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_KEY?{url:process.env.SUPABASE_URL.replace(/\/$/,''),key:process.env.SUPABASE_SERVICE_KEY}:null;

function createApp(opts={}){
  const sb=opts.supabase===undefined?envSb:opts.supabase,limit=opts.rateLimit||20;
  const dataFile=opts.dataFile||path.join(process.env.DATA_DIR||path.join(__dirname,'data'),'shares.json');
  const pubBase=sb?`${sb.url}/storage/v1/object/public/${BUCKET}/`:null;
  const H=sb?{apikey:sb.key,Authorization:'Bearer '+sb.key}:{};
  let db={};if(!sb)try{db=JSON.parse(fs.readFileSync(dataFile,'utf8'))}catch{}
  const saveLocal=()=>{try{fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.writeFileSync(dataFile,JSON.stringify(db))}catch{}};
  const valid=v=>v==null||(typeof v==='string'&&v.length<=3e6&&(!!parse(v)||(!!pubBase&&v.startsWith(pubBase)&&v.length<400)));
  const hits=new Map();
  const limited=ip=>{const now=Date.now(),a=(hits.get(ip)||[]).filter(t=>now-t<36e5);a.push(now);hits.set(ip,a);return a.length>limit};

  async function upload(id,key,v){
    if(v==null)return null;if(!v.startsWith('data:'))return v;
    const p=parse(v),name=`${id}/${key}.${EXT[p.mime]}`;
    const r=await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${name}`,{method:'POST',headers:{...H,'Content-Type':p.mime},body:p.buf});
    if(!r.ok)throw new Error('upload '+r.status);return pubBase+name}
  async function create(id,c){
    if(!sb){db[id]={image:c.image||null,bgm:c.bgm||null,death:c.death||null};saveLocal();return}
    const row={id,image:await upload(id,'image',c.image),bgm:await upload(id,'bgm',c.bgm),death:await upload(id,'death',c.death)};
    const r=await fetch(`${sb.url}/rest/v1/shares`,{method:'POST',headers:{...H,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)});
    if(!r.ok)throw new Error('insert '+r.status)}
  async function get(id){
    if(!sb)return db[id]||null;
    const r=await fetch(`${sb.url}/rest/v1/shares?id=eq.${id}&select=image,bgm,death`,{headers:H});
    if(!r.ok)throw new Error('read '+r.status);return (await r.json())[0]||null}

  return http.createServer((req,res)=>{
    const send=(c,o,t='application/json')=>{if(res.writableEnded)return;res.writeHead(c,{'Content-Type':t,'X-Content-Type-Options':'nosniff'});res.end(typeof o==='string'||Buffer.isBuffer(o)?o:JSON.stringify(o))};
    let u;try{u=new URL(req.url,'http://x');decodeURIComponent(u.pathname)}catch{return send(400,{error:'bad url'})}
    if(req.method==='GET'&&u.pathname==='/healthz')return (async()=>{try{if(sb){const r=await fetch(`${sb.url}/rest/v1/shares?select=id&limit=1`,{headers:H});if(!r.ok)throw 0}send(200,{ok:true,mode:sb?'supabase':'local'})}catch{send(503,{ok:false})}})();
    if(req.method==='POST'&&u.pathname==='/api/share'){
      let b='',n=0,dead=false;
      req.on('data',c=>{if(dead)return;n+=c.length;if(n>9e6){dead=true;send(413,{error:'too large'})}else b+=c});
      req.on('end',async()=>{if(dead)return;let j;try{j=JSON.parse(b)}catch{return send(400,{error:'bad json'})}
        if(!j||typeof j!=='object'||!valid(j.image)||!valid(j.bgm)||!valid(j.death))return send(400,{error:'invalid config (use png/jpg/webp images and mp3/m4a/wav/ogg audio)'});
        const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
        if(limited(ip))return send(429,{error:'too many shares, try later'});
        const id=crypto.randomBytes(5).toString('hex');
        try{await create(id,j);send(201,{id})}catch(e){send(502,{error:'storage error'})}});
      return}
    const m=u.pathname.match(/^\/api\/share\/([a-f0-9]{10})$/);
    if(req.method==='GET'&&m)return get(m[1]).then(v=>v?send(200,v):send(404,{error:'not found'}),()=>send(502,{error:'storage error'}));
    if(req.method==='GET'){
      let p=path.normalize(decodeURIComponent(u.pathname));if(p==='/'||p==='\\')p='/index.html';
      const f=path.join(PUB,p);if(!f.startsWith(PUB+path.sep))return send(403,{error:'forbidden'});
      return fs.readFile(f,(e,d)=>e?send(404,{error:'not found'}):send(200,d,MIME[path.extname(f)]||'application/octet-stream'))}
    send(405,{error:'method not allowed'});
  });
}
module.exports={createApp};
if(require.main===module)createApp().listen(process.env.PORT||3000,()=>console.log('Flappy Studio up, storage:',envSb?'supabase':'local file'));
