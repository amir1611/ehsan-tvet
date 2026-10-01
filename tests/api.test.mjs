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
assert.equal((await call('/api/enquiries')).status,401);
assert.equal((await call('/api/content','PUT',{})).status,401);
assert.equal((await call('/api/login','POST',{password:'wrong'})).status,401);
const login=await call('/api/login','POST',{password:'test-only-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
let content=await(await call('/api/content')).json();content.heroTitle='Tajuk ujian\nBaris kedua';content.courses[0].fee='RM 9,400';assert.equal((await call('/api/content','PUT',content,cookie)).status,200);
assert.equal((await call('/api/content','PUT',{},cookie)).status,400);
assert.equal((await call('/api/enquiries','POST',{name:'Test'})).status,400);
const input={name:'Ujian sistem',email:'test@example.com',phone:'0100000000',course:'Satu Fasa',message:'Ujian borang',consent:true};
const results=await Promise.all(Array.from({length:3},()=>call('/api/enquiries','POST',input)));assert.ok(results.every(r=>r.status===201));
let enquiries=await(await call('/api/enquiries','GET',null,cookie)).json();assert.equal(enquiries.length,3);
assert.equal((await call('/api/enquiries/'+enquiries[0].id,'PATCH',{status:'Dihubungi'},cookie)).status,200);
const cross=await fetch(base+'/api/content',{method:'PUT',headers:{Origin:'https://other.example','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(content)});assert.equal(cross.status,403);
await stop();await start();const logged=await call('/api/login','POST',{password:'test-only-password'}),newCookie=logged.headers.get('set-cookie').split(';')[0];
assert.equal((await(await call('/api/content')).json()).heroTitle,content.heroTitle);enquiries=await(await call('/api/enquiries','GET',null,newCookie)).json();assert.equal(enquiries.length,3);assert.equal(enquiries[0].status,'Dihubungi');
assert.equal((await call('/api/logout','POST',{},newCookie)).status,200);assert.equal((await call('/api/enquiries','GET',null,newCookie)).status,401);
});
