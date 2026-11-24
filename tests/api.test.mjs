import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
const dir=await mkdtemp(join(tmpdir(),'ehsan-test-')),port=4198,base=`http://127.0.0.1:${port}`;
let child;
async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:'test-only-password'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{if(b.toString().includes('http://localhost'))resolve()});child.on('error',reject);child.on('exit',code=>reject(Error('Server exited '+code)))});}
async function stop(){child.kill();await once(child,'exit')}
await start();after(async()=>{await stop();await rm(dir,{recursive:true,force:true})});
const call=(path,method='GET',body,cookie)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('protected editing, enquiry flow, persistence and logout',async()=>{
assert.equal((await call('/')).status,200);assert.equal((await call('/admin')).status,200);
const adminPage=await call('/admin');assert.match(adminPage.headers.get('cache-control'),/no-store/);assert.match(adminPage.headers.get('content-security-policy'),/object-src 'none'/);
const css=await call('/style.css');assert.equal(css.status,200);const cached=await fetch(base+'/style.css',{headers:{'If-None-Match':css.headers.get('etag')}});assert.equal(cached.status,304);
const head=await fetch(base+'/style.css',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
const partial=await fetch(base+'/assets/video.mp4',{headers:{Range:'bytes=0-15'}});assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,16);
assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).status,400);
const memberId='0123456789abcdef';
const restricted=[
  ['GET','session'],['POST','logout'],['PATCH','me/password'],['GET','enquiries'],
  ['PATCH','enquiries/'+memberId],['POST','upload'],['PUT','content'],['GET','users'],
  ['POST','users'],['PATCH','users/'+memberId],['DELETE','users/'+memberId],['GET','audit']
];
for(const [method,path] of restricted){
  assert.equal((await call('/api/'+path,method)).status,401,method+' '+path);
}
assert.equal((await call('/api/content','DELETE')).status,405);
assert.equal((await call('/api/missing')).status,404);
assert.equal((await fetch(base+'/api/enquiries',{method:'POST',body:'example'})).status,415);
for(const headers of [{Origin:base.replace('http:','https:')},{'Sec-Fetch-Site':'cross-site'}]){
  const res=await fetch(base+'/api/enquiries',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
  assert.equal(res.status,403);
}
assert.equal((await call('/api/enquiries')).status,401);
assert.equal((await call('/api/content','PUT',{})).status,401);
assert.equal((await call('/api/login','POST',{username:'admin',password:'wrong'})).status,401);
const login=await call('/api/login','POST',{username:'admin',password:'test-only-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
let content=await(await call('/api/content')).json();content.heroTitle='Tajuk ujian\nBaris kedua';content.courses[0].fee='RM 9,400';assert.equal((await call('/api/content','PUT',content,cookie)).status,200);
assert.equal((await call('/api/content','PUT',{},cookie)).status,400);
assert.equal((await call('/api/enquiries','POST',{name:'Test'})).status,400);
const input={name:'Ujian sistem',email:'test@example.com',phone:'0100000000',course:'Satu Fasa',message:'Ujian borang',consent:true};
const results=await Promise.all(Array.from({length:3},()=>call('/api/enquiries','POST',input)));assert.ok(results.every(r=>r.status===201));
let enquiries=await(await call('/api/enquiries','GET',null,cookie)).json();assert.equal(enquiries.length,3);
assert.equal((await call('/api/enquiries/'+enquiries[0].id,'PATCH',{status:'Dihubungi'},cookie)).status,200);
const cross=await fetch(base+'/api/content',{method:'PUT',headers:{Origin:'https://other.example','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(content)});assert.equal(cross.status,403);
const mk=await call('/api/users','POST',{username:'penyunting',name:'Penyunting',role:'editor',password:'editor-pass-1'},cookie);assert.equal(mk.status,201);const staffMk=await call('/api/users','POST',{username:'staf',name:'Staf',role:'staff',password:'staff-pass-12'},cookie);assert.equal(staffMk.status,201);
const ed=(await call('/api/login','POST',{username:'penyunting',password:'editor-pass-1'})).headers.get('set-cookie').split(';')[0],st=(await call('/api/login','POST',{username:'staf',password:'staff-pass-12'})).headers.get('set-cookie').split(';')[0];
for(const [method,path] of restricted.filter(([,path])=>path.startsWith('users')||path==='audit')){
  for(const session of [ed,st])assert.equal((await call('/api/'+path,method,null,session)).status,403,method+' '+path);
}
assert.equal((await call('/api/enquiries/'+memberId,'PATCH',{},ed)).status,403);
assert.equal((await call('/api/upload','POST',null,st)).status,403);
assert.equal((await call('/api/content','PUT',content,ed)).status,200);assert.equal((await call('/api/enquiries','GET',null,ed)).status,403);assert.equal((await call('/api/users','GET',null,ed)).status,403);assert.equal((await call('/api/audit','GET',null,ed)).status,403);
assert.equal((await call('/api/enquiries','GET',null,st)).status,200);assert.equal((await call('/api/content','PUT',content,st)).status,403);
const me=(await(await call('/api/users','GET',null,cookie)).json()).find(u=>u.username==='admin');assert.equal((await call('/api/users/'+me.id,'DELETE',null,cookie)).status,400);assert.equal((await call('/api/users/'+me.id,'PATCH',{role:'editor'},cookie)).status,400);
assert.equal((await call('/api/users/'+me.id,'PATCH',{name:'Should not persist',password:'short'},cookie)).status,400);
const unchanged=(await(await call('/api/users','GET',null,cookie)).json()).find(u=>u.id===me.id);assert.equal(unchanged.name,me.name);
assert.equal((await call('/api/users','POST',{username:'prototype-test',name:'Fixture',role:'toString',password:'fixture-pass-12'},cookie)).status,400);
assert.equal((await call('/api/users','POST',{username:'fixture@example',name:'Fixture',role:'staff',password:'fixture-pass-12'},cookie)).status,201);
assert.equal((await call('/api/login','POST',{username:'admin',password:'nope'})).status,401);
for(const action of ['login','login_failed','user_create','content_update']){const log=await(await call('/api/audit?action='+action,'GET',null,cookie)).json();assert.ok(log.items.some(e=>e.action===action));assert.ok(!JSON.stringify(log).includes('test-only-password'))}
await stop();await start();const logged=await call('/api/login','POST',{username:'admin',password:'test-only-password'}),newCookie=logged.headers.get('set-cookie').split(';')[0];
assert.equal((await(await call('/api/content')).json()).heroTitle,content.heroTitle);enquiries=await(await call('/api/enquiries','GET',null,newCookie)).json();assert.equal(enquiries.length,3);assert.equal(enquiries[0].status,'Dihubungi');
assert.equal((await call('/api/logout','POST',{},newCookie)).status,200);assert.equal((await call('/api/enquiries','GET',null,newCookie)).status,401);
});
