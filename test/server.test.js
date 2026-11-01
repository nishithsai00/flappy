const test=require('node:test'),assert=require('node:assert'),os=require('os'),path=require('path'),fs=require('fs'),http=require('http');
const {createApp}=require('../server');
const png='data:image/png;base64,iVBORw0KGgo=',mp3='data:audio/mpeg;base64,AAAA';
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
const tmp=()=>path.join(fs.mkdtempSync(path.join(os.tmpdir(),'f-')),'s.json');
const post=(base,b)=>fetch(base+'/api/share',{method:'POST',body:typeof b==='string'?b:JSON.stringify(b)});

// ---- fake Supabase ----
function fakeSupabase(){const files={},rows=[];const s=http.createServer((q,r)=>{
  let b=[];q.on('data',c=>b.push(c));q.on('end',()=>{b=Buffer.concat(b);const o=(c,x)=>{r.writeHead(c,{'Content-Type':'application/json'});r.end(JSON.stringify(x))};
  if(q.headers.apikey!=='KEY'||q.headers.authorization!=='Bearer KEY')return o(401,{});
  if(q.method==='POST'&&q.url.startsWith('/storage/v1/object/assets/')){files[q.url.split('/object/assets/')[1]]=b;return o(200,{})}
  if(q.method==='POST'&&q.url==='/rest/v1/shares'){rows.push(JSON.parse(b));return o(201,{})}
  if(q.method==='GET'&&q.url.startsWith('/rest/v1/shares')){const m=/id=eq\.(\w+)/.exec(q.url);return o(200,m?rows.filter(x=>x.id===m[1]):rows.slice(0,1))}
  o(404,{})})});return {s,files,rows}}

test('local mode',async t=>{
  const srv=createApp({supabase:null,dataFile:tmp()}),base=await listen(srv);t.after(()=>srv.close());
  await t.test('serves page',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/Flappy Studio/)});
  await t.test('round trip',async()=>{const r=await post(base,{image:png,bgm:mp3,death:mp3});assert.equal(r.status,201);const {id}=await r.json();assert.deepEqual(await (await fetch(base+'/api/share/'+id)).json(),{image:png,bgm:mp3,death:mp3})});
  await t.test('rejects bad payloads',async()=>{for(const b of [{image:'data:text/html;base64,PHNjcmlwdD4='},{bgm:'http://evil'},{image:'data:image/svg+xml;base64,AAAA'},'{nope'])assert.equal((await post(base,b)).status,400)});
  await t.test('404 unknown id',async()=>assert.equal((await fetch(base+'/api/share/abcdef0123')).status,404));
  await t.test('path traversal blocked',async()=>{const r=await fetch(base+'/%2e%2e/server.js');assert.ok([403,404].includes(r.status));assert.doesNotMatch(await r.text(),/createApp/)});
  await t.test('healthz',async()=>assert.equal((await fetch(base+'/healthz')).status,200));
});
test('rate limit',async t=>{const srv=createApp({supabase:null,dataFile:tmp(),rateLimit:2}),base=await listen(srv);t.after(()=>srv.close());
  assert.equal((await post(base,{image:png})).status,201);assert.equal((await post(base,{image:png})).status,201);assert.equal((await post(base,{image:png})).status,429)});
test('supabase mode',async t=>{
  const f=fakeSupabase(),sbUrl=await listen(f.s);t.after(()=>f.s.close());
  const srv=createApp({supabase:{url:sbUrl,key:'KEY'}}),base=await listen(srv);t.after(()=>srv.close());
  let id,pub=sbUrl+'/storage/v1/object/public/assets/';
  await t.test('uploads files, stores urls only',async()=>{const r=await post(base,{image:png,bgm:mp3});assert.equal(r.status,201);id=(await r.json()).id;
    assert.ok(f.files[id+'/image.png']&&f.files[id+'/bgm.mp3']);assert.equal(f.rows[0].image,pub+id+'/image.png');assert.equal(f.rows[0].death,null)});
  await t.test('reads back urls',async()=>{const j=await (await fetch(base+'/api/share/'+id)).json();assert.equal(j.bgm,pub+id+'/bgm.mp3')});
  await t.test('re-share of existing urls works',async()=>{const r=await post(base,{image:pub+id+'/image.png'});assert.equal(r.status,201)});
  await t.test('foreign url rejected',async()=>assert.equal((await post(base,{image:'https://evil.com/x.png'})).status,400));
  await t.test('healthz hits supabase',async()=>{const j=await (await fetch(base+'/healthz')).json();assert.equal(j.mode,'supabase')});
  await t.test('wrong key -> 502 not crash',async()=>{const bad=createApp({supabase:{url:sbUrl,key:'NOPE'}}),b=await listen(bad);const r=await post(b,{image:png});bad.close();assert.equal(r.status,502)});
});
test('client script parses',()=>{const h=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');new Function(h.match(/<script>([\s\S]*)<\/script>/)[1])});
