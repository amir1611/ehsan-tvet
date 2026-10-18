import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {initialContent,siteDefaults} from './seed.mjs';
const root=dirname(fileURLToPath(import.meta.url)),publicRoot=resolve(root,'public'),data=process.env.DATA_DIR||resolve(root,'data');
const uploads=resolve(data,'uploads');await mkdir(uploads,{recursive:true});
const read=async(name,fallback)=>{try{return JSON.parse(await readFile(resolve(data,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const writes=new Map();
// Fills missing keys from the defaults and rejects values of the wrong shape.
function conform(d,v,key=''){if(typeof d==='string'){if(v===undefined)return d;if(typeof v!=='string'||v.length>5000||(key==='image'&&!/^[\w. -]*$/.test(v)))throw Error('site');return v}
if(v!==undefined&&(v===null||typeof v!=='object'||Array.isArray(v)!==Array.isArray(d)))throw Error('site');
if(Array.isArray(d))return d.map((x,i)=>conform(x,v?.[i]));return Object.fromEntries(Object.keys(d).map(k=>[k,conform(d[k],v?.[k],k)]))}
const save=(name,value)=>{const snapshot=JSON.stringify(value,null,2),previous=writes.get(name)||Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{const p=resolve(data,name),t=p+'.tmp';await writeFile(t,snapshot,{mode:0o600});await rename(t,p)});writes.set(name,next);return next};
let content=await read('content.json',initialContent),enquiries=await read('enquiries.json',[]);
content.site=conform(siteDefaults,content.site);
const ROLES={admin:['content','enquiries','users','audit'],editor:['content'],staff:['enquiries']};
const hashPassword=(password,salt=randomBytes(16).toString('hex'))=>({salt,hash:scryptSync(password,salt,64).toString('hex')});
const checkPassword=(user,password)=>{const dummy=user||{salt:'0'.repeat(32),hash:'0'.repeat(128)};return timingSafeEqual(scryptSync(password,dummy.salt,64),Buffer.from(dummy.hash,'hex'))&&!!user};
let users=await read('users.json',null);
if(!users){const legacy=process.env.ADMIN_PASSWORD?null:await read('credentials.json',null);let creds=legacy;if(!creds){const password=process.env.ADMIN_PASSWORD||randomBytes(12).toString('base64url');creds=hashPassword(password);if(!process.env.ADMIN_PASSWORD)console.log('Initial admin password:',password)}
users=[{id:randomBytes(8).toString('hex'),username:process.env.ADMIN_USERNAME||'admin',name:'Pentadbir',role:'admin',active:true,createdAt:new Date().toISOString(),lastLoginAt:null,...creds}];await save('users.json',users);console.log('Admin username:',users[0].username)}
let auditLog=await read('audit.json',[]);
const publicUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,active:u.active,createdAt:u.createdAt,lastLoginAt:u.lastLoginAt});
function audit(req,actor,action,target='',detail=''){auditLog.unshift({id:randomBytes(6).toString('hex'),at:new Date().toISOString(),userId:actor?.id||null,username:actor?.username||'—',role:actor?.role||'',action,target:String(target).slice(0,200),detail:String(detail).slice(0,1000),ip:req.socket.remoteAddress||''});if(auditLog.length>5000)auditLog.length=5000;return save('audit.json',auditLog)}
const sessions=new Map(),attempts=new Map();
const tokenOf=req=>(req.headers.cookie||'').match(/(?:^|; )ehsan_session=([^;]+)/)?.[1];
const revoke=(userId,except)=>{for(const [t,s] of sessions)if(s.userId===userId&&t!==except)sessions.delete(t)};
const current=req=>{const t=tokenOf(req),s=t&&sessions.get(t);if(!s||s.exp<=Date.now())return null;const u=users.find(x=>x.id===s.userId);return u?.active?u:null};
const can=(u,perm)=>!!u&&ROLES[u.role]?.includes(perm);
const send=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value))};
async function rawBody(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Fail terlalu besar');chunks.push(chunk)}return Buffer.concat(chunks)}
const imageType=b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'jpg':b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?'png':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>400000)throw Error('Permintaan terlalu besar')}return JSON.parse(text||'{}')}
const limit=(key,max)=>{const now=Date.now(),a=(attempts.get(key)||[]).filter(t=>now-t<900000);if(a.length>=max)return false;a.push(now);attempts.set(key,a);return true};
const fields=['heroTitle','heroText','phone','email','address'];
function diffContent(a,b){const out=[],changed=[];for(const k of fields)if(a[k]!==b[k])changed.push(k);for(const k of Object.keys(siteDefaults))if(JSON.stringify(a.site?.[k])!==JSON.stringify(b.site[k]))changed.push('seksyen '+k);if(changed.length)out.push({action:'content_update',target:'Kandungan Laman',detail:'Diubah: '+changed.join(', ')});
const old=new Map(a.courses.map(c=>[c.id,c])),seen=new Set();for(const c of b.courses){seen.add(c.id);const o=old.get(c.id);if(!o)out.push({action:'course_create',target:c.title,detail:`Kod ${c.code}`});else{const f=Object.keys(c).filter(k=>c[k]!==o[k]);if(f.length)out.push({action:'course_update',target:c.title,detail:'Diubah: '+f.join(', ')})}}
for(const o of a.courses)if(!seen.has(o.id))out.push({action:'course_delete',target:o.title,detail:`Kod ${o.code}`});return out}
export const server=http.createServer(async(req,res)=>{try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
const url=new URL(req.url,'http://localhost'),path=url.pathname;
if(['POST','PUT','DELETE','PATCH'].includes(req.method)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Origin tidak dibenarkan'});
if(path==='/api/content'&&req.method==='GET')return send(res,200,content);
if(path==='/api/login'&&req.method==='POST'){
if(!limit('login:'+req.socket.remoteAddress,10))return send(res,429,{error:'Terlalu banyak percubaan. Cuba lagi dalam 15 minit.'});
const {username,password}=await body(req);if(typeof username!=='string'||typeof password!=='string'||username.length>60||password.length>200)return send(res,400,{error:'Maklumat tidak sah.'});
const user=users.find(u=>u.username===username.trim().toLowerCase()&&u.active);if(!checkPassword(user,password)){await audit(req,null,'login_failed',username.trim().slice(0,60),'Nama pengguna atau kata laluan salah');return send(res,401,{error:'Nama pengguna atau kata laluan tidak sah.'})}
const token=randomBytes(32).toString('hex');sessions.set(token,{userId:user.id,exp:Date.now()+8*3600000});user.lastLoginAt=new Date().toISOString();await save('users.json',users);await audit(req,user,'login');return send(res,200,{ok:true,user:publicUser(user),can:ROLES[user.role]},{'Set-Cookie':`ehsan_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`})}
if(path==='/api/logout'&&req.method==='POST'){const u=current(req);if(u)await audit(req,u,'logout');sessions.delete(tokenOf(req));return send(res,200,{ok:true},{'Set-Cookie':'ehsan_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
if(path==='/api/session'){const u=current(req);return send(res,u?200:401,u?{authenticated:true,user:publicUser(u),can:ROLES[u.role]}:{authenticated:false})}
if(path==='/api/enquiries'&&req.method==='POST'){
if(!limit('enquiry:'+req.socket.remoteAddress,8))return send(res,429,{error:'Sila cuba lagi kemudian.'});
const b=await body(req);if(!b.consent||!b.name?.trim()||!b.phone?.trim()||!b.email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||[b.name,b.phone,b.email,b.message||''].some(v=>typeof v!=='string'||v.length>3000))return send(res,400,{error:'Lengkapkan maklumat dan persetujuan anda.'});
const item={id:randomBytes(8).toString('hex'),name:b.name,phone:b.phone,email:b.email,course:String(b.course||''),message:b.message||'',status:'Baharu',createdAt:new Date().toISOString(),consentAt:new Date().toISOString()};enquiries=[item,...enquiries];await save('enquiries.json',enquiries);return send(res,201,{ok:true});}
if(path.startsWith('/api/')){
const me=current(req);if(!me)return send(res,401,{error:'Sila log masuk.'});
const need=perm=>can(me,perm)?false:(send(res,403,{error:'Anda tidak mempunyai kebenaran untuk tindakan ini.'}),true);
if(path==='/api/upload'&&req.method==='POST'){if(need('content'))return;let buf;try{buf=await rawBody(req,5*1024*1024)}catch{return send(res,413,{error:'Imej terlalu besar (maksimum 5MB).'})}const ext=imageType(buf);if(!ext)return send(res,400,{error:'Format imej tidak sah. Gunakan JPG, PNG atau WebP.'});const name=randomBytes(12).toString('hex')+'.'+ext;await writeFile(resolve(uploads,name),buf,{mode:0o600});await audit(req,me,'upload',name,`Imej dimuat naik (${Math.round(buf.length/1024)} KB)`);return send(res,201,{name})}
if(path==='/api/content'&&req.method==='PUT'){if(need('content'))return;const b=await body(req);if(fields.some(k=>typeof b[k]!=='string'||!b[k].trim()||b[k].length>5000)||!Array.isArray(b.courses)||b.courses.length>30||b.courses.some(c=>['id','title','category','level','description','code','fee','duration','requirements','image','pdf'].some(k=>typeof c[k]!=='string'||c[k].length>5000)||!c.title.trim()||!c.id.match(/^[a-z0-9-]+$/)))return send(res,400,{error:'Kandungan tidak sah.'});try{b.site=conform(siteDefaults,b.site)}catch{return send(res,400,{error:'Kandungan laman tidak sah.'})}const events=diffContent(content,b);content=b;await save('content.json',content);for(const e of events)await audit(req,me,e.action,e.target,e.detail);return send(res,200,{ok:true})}
if(path==='/api/enquiries'&&req.method==='GET')return need('enquiries')||send(res,200,enquiries);
if(path.startsWith('/api/enquiries/')&&req.method==='PATCH'){if(need('enquiries'))return;const b=await body(req),item=enquiries.find(e=>e.id===path.split('/').pop());if(!item)return send(res,404,{error:'Tidak ditemui'});if(!['Baharu','Dihubungi','Selesai'].includes(b.status))return send(res,400,{error:'Status tidak sah'});const before=item.status;item.status=b.status;await save('enquiries.json',enquiries);await audit(req,me,'enquiry_status',item.name,`${before} → ${b.status}`);return send(res,200,{ok:true})}
if(path==='/api/me/password'&&req.method==='PATCH'){const b=await body(req);if(typeof b.current!=='string'||typeof b.password!=='string'||b.password.length<8||b.password.length>200)return send(res,400,{error:'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.'});if(!limit('pw:'+me.id,10))return send(res,429,{error:'Terlalu banyak percubaan.'});if(!checkPassword(me,b.current))return send(res,400,{error:'Kata laluan semasa tidak betul.'});Object.assign(me,hashPassword(b.password));await save('users.json',users);revoke(me.id,tokenOf(req));await audit(req,me,'password_change',me.username);return send(res,200,{ok:true})}
if(path==='/api/users'&&req.method==='GET')return need('users')||send(res,200,users.map(publicUser));
if(path==='/api/users'&&req.method==='POST'){if(need('users'))return;const b=await body(req),username=String(b.username||'').trim().toLowerCase();
if(!/^[a-z0-9._-]{3,30}$/.test(username))return send(res,400,{error:'Nama pengguna 3–30 aksara (huruf kecil, nombor, . _ -).'});if(users.some(u=>u.username===username))return send(res,400,{error:'Nama pengguna sudah digunakan.'});
if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!ROLES[b.role]||typeof b.password!=='string'||b.password.length<8||b.password.length>200)return send(res,400,{error:'Lengkapkan nama, peranan dan kata laluan (sekurang-kurangnya 8 aksara).'});
const u={id:randomBytes(8).toString('hex'),username,name:b.name.trim(),role:b.role,active:true,createdAt:new Date().toISOString(),lastLoginAt:null,...hashPassword(b.password)};users.push(u);await save('users.json',users);await audit(req,me,'user_create',username,`Peranan: ${u.role}`);return send(res,201,publicUser(u))}
if(path.startsWith('/api/users/')&&['PATCH','DELETE'].includes(req.method)){if(need('users'))return;const target=users.find(u=>u.id===path.split('/').pop());if(!target)return send(res,404,{error:'Pengguna tidak ditemui.'});const others=users.filter(u=>u!==target&&u.active&&u.role==='admin').length;
if(req.method==='DELETE'){if(target===me)return send(res,400,{error:'Anda tidak boleh memadam akaun sendiri.'});if(target.role==='admin'&&target.active&&!others)return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});users=users.filter(u=>u!==target);revoke(target.id);await save('users.json',users);await audit(req,me,'user_delete',target.username);return send(res,200,{ok:true})}
const b=await body(req),notes=[];
if(b.name!==undefined){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80)return send(res,400,{error:'Nama tidak sah.'});if(b.name.trim()!==target.name){notes.push('nama');target.name=b.name.trim()}}
if(b.role!==undefined&&b.role!==target.role){if(!ROLES[b.role])return send(res,400,{error:'Peranan tidak sah.'});if(target===me)return send(res,400,{error:'Anda tidak boleh menukar peranan sendiri.'});if(target.role==='admin'&&target.active&&!others)return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});notes.push(`peranan ${target.role} → ${b.role}`);target.role=b.role;revoke(target.id)}
if(b.active!==undefined&&b.active!==target.active){if(typeof b.active!=='boolean')return send(res,400,{error:'Status tidak sah.'});if(target===me)return send(res,400,{error:'Anda tidak boleh menyahaktifkan akaun sendiri.'});if(!b.active&&target.role==='admin'&&!others)return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});target.active=b.active;notes.push(b.active?'diaktifkan':'dinyahaktifkan');if(!b.active)revoke(target.id)}
let reset=false;if(b.password!==undefined){if(typeof b.password!=='string'||b.password.length<8||b.password.length>200)return send(res,400,{error:'Kata laluan mesti sekurang-kurangnya 8 aksara.'});Object.assign(target,hashPassword(b.password));revoke(target.id,target===me?tokenOf(req):undefined);reset=true}
await save('users.json',users);if(notes.length)await audit(req,me,'user_update',target.username,notes.join(', '));if(reset)await audit(req,me,'password_reset',target.username);return send(res,200,publicUser(target))}
if(path==='/api/audit'&&req.method==='GET'){if(need('audit'))return;const q=(url.searchParams.get('q')||'').toLowerCase().trim(),action=url.searchParams.get('action')||'',size=15;let items=auditLog.filter(e=>(!action||e.action===action)&&(!q||[e.username,e.target,e.detail,e.action].some(x=>String(x).toLowerCase().includes(q))));const total=items.length,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(Math.max(1,Number(url.searchParams.get('page'))||1),pages);return send(res,200,{items:items.slice((page-1)*size,page*size),total,page,pages})}
return send(res,404,{error:'Tidak ditemui'});}
const requested=path==='/admin'||path==='/admin/'?'/admin.html':path==='/'?'/index.html':decodeURIComponent(path);const file=resolve(publicRoot,'.'+requested);if(!file.startsWith(publicRoot+'/'))return send(res,403,{error:'Dilarang'});
try{let buf;try{buf=await readFile(file)}catch(e){if(!requested.startsWith('/assets/'))throw e;const u=resolve(uploads,requested.slice(8));if(!u.startsWith(uploads+'/'))throw e;buf=await readFile(u)}const type={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(buf)}catch{return send(res,404,{error:'Halaman tidak ditemui'})}
}catch(e){send(res,400,{error:'Permintaan tidak dapat diproses.'})}});
server.listen(Number(process.env.PORT||4180),'127.0.0.1',()=>console.log('Ehsan TVET: http://localhost:'+(process.env.PORT||4180)));
