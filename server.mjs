import http from 'node:http';
import {readFile,writeFile,mkdir,rename,stat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {USERNAME,ROLES,validRole,isObject,hashPassword,checkPassword,jsonBody,validEnquiry,rateLimiter,contentSecurityPolicy,byteRange} from './security.mjs';
import {initialContent,siteDefaults} from './seed.mjs';
export async function createApplication(storage = null) {
const root=dirname(fileURLToPath(import.meta.url)),publicRoot=resolve(root,'public'),data=process.env.DATA_DIR||resolve(root,'data');
const uploads=resolve(data,'uploads');if(!storage)await mkdir(uploads,{recursive:true});
const read=async(name,fallback)=>{if(storage)return storage.read(name,fallback);try{return JSON.parse(await readFile(resolve(data,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const writes=new Map();
// Fills missing keys from the defaults and rejects values of the wrong shape.
function conform(d,v,key=''){if(typeof d==='string'){if(v===undefined)return d;if(typeof v!=='string'||v.length>5000||(key==='image'&&!/^[\w. -]*$/.test(v)))throw Error('site');return v}
if(v!==undefined&&(v===null||typeof v!=='object'||Array.isArray(v)!==Array.isArray(d)))throw Error('site');
if(Array.isArray(d))return d.map((x,i)=>conform(x,v?.[i]));return Object.fromEntries(Object.keys(d).map(k=>[k,conform(d[k],v?.[k],k)]))}
const save=(name,value)=>{if(storage)return storage.save(name,value);const snapshot=JSON.stringify(value,null,2),previous=writes.get(name)||Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{const p=resolve(data,name),t=p+'.tmp';await writeFile(t,snapshot,{mode:0o600});await rename(t,p)});writes.set(name,next);return next};
let content=await read('content.json',initialContent),enquiries=await read('enquiries.json',[]);
content.site=conform(siteDefaults,content.site);
let users=await read('users.json',null);
if(!users&&storage){const bootstrap=JSON.parse(process.env.ADMIN_BOOTSTRAP||'null');if(!bootstrap||!USERNAME.test(bootstrap.username)||!bootstrap.salt?.match(/^[a-f0-9]{32}$/)||!bootstrap.hash?.match(/^[a-f0-9]{128}$/))throw Error('Admin bootstrap is missing');users=[{id:randomBytes(8).toString('hex'),name:'Admin',role:'admin',active:true,createdAt:new Date().toISOString(),lastLoginAt:null,username:bootstrap.username,salt:bootstrap.salt,hash:bootstrap.hash}];await save('users.json',users)}
if(!users){const legacy=process.env.ADMIN_PASSWORD?null:await read('credentials.json',null);let creds=legacy;if(!creds){const password=process.env.ADMIN_PASSWORD||randomBytes(12).toString('base64url');creds=await hashPassword(password);if(!process.env.ADMIN_PASSWORD)console.log('Initial admin password:',password)}
users=[{id:randomBytes(8).toString('hex'),username:process.env.ADMIN_USERNAME||'admin',name:'Pentadbir',role:'admin',active:true,createdAt:new Date().toISOString(),lastLoginAt:null,...creds}];await save('users.json',users);console.log('Admin username:',users[0].username)}
let auditLog=await read('audit.json',[]);
const publicUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,active:u.active,createdAt:u.createdAt,lastLoginAt:u.lastLoginAt});
function audit(req,actor,action,target='',detail=''){auditLog.unshift({id:randomBytes(6).toString('hex'),at:new Date().toISOString(),userId:actor?.id||null,username:actor?.username||'—',role:actor?.role||'',action,target:String(target).slice(0,200),detail:String(detail).slice(0,1000),ip:req.socket.remoteAddress||''});if(auditLog.length>5000)auditLog.length=5000;return save('audit.json',auditLog)}
const sessions=new Map(await read('sessions.json',[]));
if(storage)storage.sessions=sessions;
const cleanup=!storage&&setInterval(()=>{for(const [key,s] of sessions)if(s.exp<=Date.now())sessions.delete(key)},60000);if(cleanup)cleanup.unref();
const tokenDigest=token=>createHash('sha256').update(token).digest('hex');
const tokenOf=req=>{const token=(req.headers.cookie||'').match(/(?:^|; )ehsan_session=([^;]+)/)?.[1];return token?tokenDigest(token):undefined};
const revoke=(userId,except)=>{for(const [t,s] of sessions)if(s.userId===userId&&t!==except)sessions.delete(t)};
const current=req=>{const t=tokenOf(req),s=t&&sessions.get(t);if(!s||s.exp<=Date.now())return null;const u=users.find(x=>x.id===s.userId);return u?.active?u:null};
const can=(u,perm)=>!!u&&validRole(u.role)&&ROLES[u.role].includes(perm);
const send=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value))};
async function rawBody(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Fail terlalu besar');chunks.push(chunk)}return Buffer.concat(chunks)}
const imageType=b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'jpg':b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?'png':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;
const body=jsonBody,limit=storage?storage.limit:rateLimiter();
const fields=['heroTitle','heroText','phone','email','address'];
function diffContent(a,b){const out=[],changed=[];for(const k of fields)if(a[k]!==b[k])changed.push(k);for(const k of Object.keys(siteDefaults))if(JSON.stringify(a.site?.[k])!==JSON.stringify(b.site[k]))changed.push('seksyen '+k);if(changed.length)out.push({action:'content_update',target:'Kandungan Laman',detail:'Diubah: '+changed.join(', ')});
const old=new Map(a.courses.map(c=>[c.id,c])),seen=new Set();for(const c of b.courses){seen.add(c.id);const o=old.get(c.id);if(!o)out.push({action:'course_create',target:c.title,detail:`Kod ${c.code}`});else{const f=Object.keys(c).filter(k=>c[k]!==o[k]);if(f.length)out.push({action:'course_update',target:c.title,detail:'Diubah: '+f.join(', ')})}}
for(const o of a.courses)if(!seen.has(o.id))out.push({action:'course_delete',target:o.title,detail:`Kod ${o.code}`});return out}
// Every API method must declare its access level before a handler can run.
const apiRoutes = new Map([
  ['/api/content', {GET:'public', PUT:'content'}],
  ['/api/login', {POST:'public'}],
  ['/api/enquiries', {POST:'public', GET:'enquiries'}],
  ['/api/enquiries/:id', {PATCH:'enquiries'}],
  ['/api/session', {GET:'session'}],
  ['/api/logout', {POST:'session'}],
  ['/api/me/password', {PATCH:'session'}],
  ['/api/upload', {POST:'content'}],
  ['/api/users', {GET:'users', POST:'users'}],
  ['/api/users/:id', {PATCH:'users', DELETE:'users'}],
  ['/api/audit', {GET:'audit'}],
]);
const configuredOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : null;
function authorizeApi(req,res,path,me) {
  const member = /^([/]api[/](?:users|enquiries))[/][a-f0-9]{16}$/.exec(path);
  const methods = !path.includes(':') && apiRoutes.get(member ? member[1] + '/:id' : path);
  if (!methods) return send(res,404,{error:'Tidak ditemui'});
  if (!Object.hasOwn(methods,req.method)) {
    return send(res,405,{error:'Kaedah tidak dibenarkan'},{Allow:Object.keys(methods).join(', ')});
  }
  const access = methods[req.method];
  if (access !== 'public') {
    if (!me || !validRole(me.role)) return send(res,401,{authenticated:false,error:'Sila log masuk.'});
    if (access !== 'session' && !can(me,access)) return send(res,403,{error:'Anda tidak mempunyai kebenaran untuk tindakan ini.'});
  }
  if (req.method !== 'GET') {
    const scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const origin = configuredOrigin || scheme + '://' + req.headers.host;
    if (req.headers['sec-fetch-site'] === 'cross-site' ||
        (req.headers.origin !== undefined && req.headers.origin !== origin)) {
      return send(res,403,{error:'Origin tidak dibenarkan'});
    }
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const allowed = path === '/api/upload'
      ? ['application/octet-stream','image/jpeg','image/png','image/webp']
      : ['application/json'];
    if (!allowed.includes(type)) return send(res,415,{error:'Format permintaan tidak disokong.'});
  }
  return true;
}
return async function handleRequest(req,res){try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
res.setHeader('Content-Security-Policy',contentSecurityPolicy);res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
const url=new URL(req.url,'http://localhost'),path=url.pathname;
if(storage&&/^\/api\/media\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(path)){
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Kaedah tidak dibenarkan'});
  const image=await storage.readImage(path.split('/').pop());
  if(!image)return send(res,404,{error:'Tidak ditemui'});
  res.writeHead(200,{'Content-Type':image.type,'Content-Length':image.body.length,'Cache-Control':'public, max-age=31536000, immutable'});
  return res.end(req.method==='HEAD'?undefined:image.body);
}
const me=path.startsWith('/api/')?current(req):null;
if((path==='/api'||path.startsWith('/api/'))&&authorizeApi(req,res,path,me)!==true)return;
if(path==='/api/content'&&req.method==='GET')return send(res,200,content);
if(path==='/api/login'&&req.method==='POST'){
if(!limit('login:'+req.socket.remoteAddress,10))return send(res,429,{error:'Terlalu banyak percubaan. Cuba lagi dalam 15 minit.'});
const {username,password}=await body(req);if(typeof username!=='string'||typeof password!=='string'||username.length>60||password.length>200)return send(res,400,{error:'Maklumat tidak sah.'});
const user=users.find(u=>u.username===username.trim().toLowerCase()&&u.active&&validRole(u.role));const originalHash=user?.hash;if(!await checkPassword(user,password)||!users.includes(user)||!user.active||user.hash!==originalHash){await audit(req,null,'login_failed',username.trim().slice(0,60),'Nama pengguna atau kata laluan salah');return send(res,401,{error:'Nama pengguna atau kata laluan tidak sah.'})}
const token=randomBytes(32).toString('hex');sessions.set(tokenDigest(token),{userId:user.id,exp:Date.now()+8*3600000});user.lastLoginAt=new Date().toISOString();await save('users.json',users);await audit(req,user,'login');return send(res,200,{ok:true,user:publicUser(user),can:ROLES[user.role]},{'Set-Cookie':`ehsan_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`})}
if(path==='/api/logout'&&req.method==='POST'){const u=current(req);if(u)await audit(req,u,'logout');sessions.delete(tokenOf(req));return send(res,200,{ok:true},{'Set-Cookie':'ehsan_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
if(path==='/api/session'&&req.method==='GET'){const u=current(req);return send(res,u?200:401,u?{authenticated:true,user:publicUser(u),can:ROLES[u.role]}:{authenticated:false})}
if(path==='/api/enquiries'&&req.method==='POST'){
if(!limit('enquiry:'+req.socket.remoteAddress,8))return send(res,429,{error:'Sila cuba lagi kemudian.'});
const b=await body(req);if(!validEnquiry(b))return send(res,400,{error:'Lengkapkan maklumat dan persetujuan anda.'});
const item={id:randomBytes(8).toString('hex'),name:b.name,phone:b.phone,email:b.email,course:String(b.course||''),message:b.message||'',status:'Baharu',createdAt:new Date().toISOString(),consentAt:new Date().toISOString()};enquiries=[item,...enquiries];await save('enquiries.json',enquiries);return send(res,201,{ok:true});}
if(path.startsWith('/api/')){
if(path==='/api/upload'&&req.method==='POST'){
if(!limit('upload:'+me.id,30))return send(res,429,{error:'Terlalu banyak muat naik. Cuba lagi kemudian.'});
let buf;try{buf=await rawBody(req,4*1024*1024)}catch{return send(res,413,{error:'Imej terlalu besar (maksimum 4MB).'})}const ext=imageType(buf);if(!ext)return send(res,400,{error:'Format imej tidak sah. Gunakan JPG, PNG atau WebP.'});const name=randomBytes(12).toString('hex')+'.'+ext;if(storage)await storage.saveImage(name,buf,ext);else await writeFile(resolve(uploads,name),buf,{mode:0o600});await audit(req,me,'upload',name,`Imej dimuat naik (${Math.round(buf.length/1024)} KB)`);return send(res,201,{name})}
if(path==='/api/content'&&req.method==='PUT'){const b=await body(req);if(fields.some(k=>typeof b[k]!=='string'||!b[k].trim()||b[k].length>5000)||!Array.isArray(b.courses)||b.courses.length>30||b.courses.some(c=>!isObject(c)||['id','title','category','level','description','code','fee','duration','requirements','image','pdf'].some(k=>typeof c[k]!=='string'||c[k].length>5000)||!c.title.trim()||!c.id.match(/^[a-z0-9-]+$/)))return send(res,400,{error:'Kandungan tidak sah.'});try{b.site=conform(siteDefaults,b.site)}catch{return send(res,400,{error:'Kandungan laman tidak sah.'})}const next={...Object.fromEntries(fields.map(k=>[k,b[k]])),courses:b.courses,site:b.site};const events=diffContent(content,next);await save('content.json',next);content=next;for(const e of events)await audit(req,me,e.action,e.target,e.detail);return send(res,200,{ok:true})}
if(path==='/api/enquiries'&&req.method==='GET')return send(res,200,enquiries);
if(path.startsWith('/api/enquiries/')&&req.method==='PATCH'){const b=await body(req),item=enquiries.find(e=>e.id===path.split('/').pop());if(!item)return send(res,404,{error:'Tidak ditemui'});if(!['Baharu','Dihubungi','Selesai'].includes(b.status))return send(res,400,{error:'Status tidak sah'});const before=item.status;item.status=b.status;await save('enquiries.json',enquiries);await audit(req,me,'enquiry_status',item.name,`${before} → ${b.status}`);return send(res,200,{ok:true})}
if(path==='/api/me/password'&&req.method==='PATCH'){const b=await body(req);if(typeof b.current!=='string'||typeof b.password!=='string'||b.password.length<8||b.password.length>200)return send(res,400,{error:'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.'});if(!limit('pw:'+me.id,10))return send(res,429,{error:'Terlalu banyak percubaan.'});if(!await checkPassword(me,b.current))return send(res,400,{error:'Kata laluan semasa tidak betul.'});Object.assign(me,await hashPassword(b.password));await save('users.json',users);revoke(me.id,tokenOf(req));await audit(req,me,'password_change',me.username);return send(res,200,{ok:true})}
if(path==='/api/users'&&req.method==='GET')return send(res,200,users.map(publicUser));
if(path==='/api/users'&&req.method==='POST'){const b=await body(req),username=String(b.username||'').trim().toLowerCase();
if(!USERNAME.test(username))return send(res,400,{error:'Nama pengguna 3–60 aksara (huruf kecil, nombor, . _ @ -).'});if(users.some(u=>u.username===username))return send(res,400,{error:'Nama pengguna sudah digunakan.'});
if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!validRole(b.role)||typeof b.password!=='string'||b.password.length<8||b.password.length>200)return send(res,400,{error:'Lengkapkan nama, peranan dan kata laluan (sekurang-kurangnya 8 aksara).'});
const u={id:randomBytes(8).toString('hex'),username,name:b.name.trim(),role:b.role,active:true,createdAt:new Date().toISOString(),lastLoginAt:null,...await hashPassword(b.password)};users.push(u);await save('users.json',users);await audit(req,me,'user_create',username,`Peranan: ${u.role}`);return send(res,201,publicUser(u))}
if(path.startsWith('/api/users/')&&['PATCH','DELETE'].includes(req.method)){const target=users.find(u=>u.id===path.split('/').pop());if(!target)return send(res,404,{error:'Pengguna tidak ditemui.'});const others=users.filter(u=>u!==target&&u.active&&u.role==='admin').length;
if(req.method==='DELETE'){if(target.role==='admin')return send(res,403,{error:'Administrator accounts cannot be deleted.'});if(target===me)return send(res,400,{error:'Anda tidak boleh memadam akaun sendiri.'});if(target.role==='admin'&&target.active&&!others)return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});users=users.filter(u=>u!==target);revoke(target.id);await save('users.json',users);await audit(req,me,'user_delete',target.username);return send(res,200,{ok:true})}
const b=await body(req),notes=[];
if(b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()||b.name.length>80))return send(res,400,{error:'Nama tidak sah.'});
if(b.role!==undefined&&!validRole(b.role))return send(res,400,{error:'Peranan tidak sah.'});
if(b.active!==undefined&&typeof b.active!=='boolean')return send(res,400,{error:'Status tidak sah.'});
if(b.password!==undefined&&(typeof b.password!=='string'||b.password.length<8||b.password.length>200))return send(res,400,{error:'Kata laluan mesti sekurang-kurangnya 8 aksara.'});
if(target===me&&((b.role!==undefined&&b.role!==target.role)||b.active===false))return send(res,400,{error:'Anda tidak boleh mengubah akses akaun sendiri.'});
if(target.role==='admin'&&target.active&&!others&&(b.active===false||(b.role!==undefined&&b.role!=='admin')))return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});
if(b.name!==undefined){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80)return send(res,400,{error:'Nama tidak sah.'});if(b.name.trim()!==target.name){notes.push('nama');target.name=b.name.trim()}}
if(b.role!==undefined&&b.role!==target.role){if(!validRole(b.role))return send(res,400,{error:'Peranan tidak sah.'});if(target===me)return send(res,400,{error:'Anda tidak boleh menukar peranan sendiri.'});if(target.role==='admin'&&target.active&&!others)return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});notes.push(`peranan ${target.role} → ${b.role}`);target.role=b.role;revoke(target.id)}
if(b.active!==undefined&&b.active!==target.active){if(typeof b.active!=='boolean')return send(res,400,{error:'Status tidak sah.'});if(target===me)return send(res,400,{error:'Anda tidak boleh menyahaktifkan akaun sendiri.'});if(!b.active&&target.role==='admin'&&!others)return send(res,400,{error:'Mesti ada sekurang-kurangnya satu pentadbir aktif.'});target.active=b.active;notes.push(b.active?'diaktifkan':'dinyahaktifkan');if(!b.active)revoke(target.id)}
let reset=false;if(b.password!==undefined){if(typeof b.password!=='string'||b.password.length<8||b.password.length>200)return send(res,400,{error:'Kata laluan mesti sekurang-kurangnya 8 aksara.'});Object.assign(target,await hashPassword(b.password));revoke(target.id,target===me?tokenOf(req):undefined);reset=true}
await save('users.json',users);if(notes.length)await audit(req,me,'user_update',target.username,notes.join(', '));if(reset)await audit(req,me,'password_reset',target.username);return send(res,200,publicUser(target))}
if(path==='/api/audit'&&req.method==='GET'){const q=(url.searchParams.get('q')||'').toLowerCase().trim(),action=url.searchParams.get('action')||'',size=15;let items=auditLog.filter(e=>(!action||e.action===action)&&(!q||[e.username,e.target,e.detail,e.action].some(x=>String(x).toLowerCase().includes(q))));const total=items.length,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(Math.max(1,Number(url.searchParams.get('page'))||1),pages);return send(res,200,{items:items.slice((page-1)*size,page*size),total,page,pages})}
return send(res,404,{error:'Tidak ditemui'});}
if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Kaedah tidak dibenarkan'},{Allow:'GET, HEAD'});
const programmeRoute=/^\/(?:program\/[a-z0-9-]+|banding-program)(?:\.html)?$/.test(path);
if(programmeRoute&&path.endsWith('.html')){
  res.writeHead(308,{Location:path.slice(0,-5)+url.search});
  return res.end();
}
const requested=programmeRoute?path+'.html':path==='/admin'||path==='/admin/'?'/admin.html':path==='/'?'/index.html':decodeURIComponent(path);const file=resolve(publicRoot,'.'+requested);if(!file.startsWith(publicRoot+'/'))return send(res,403,{error:'Dilarang'});
try{
let served=file,allowedRoot=publicRoot,info;
try{info=await stat(served)}catch(e){if(!requested.startsWith('/assets/'))throw e;served=resolve(uploads,requested.slice(8));allowedRoot=uploads;info=await stat(served)}
if(!info.isFile()||!(await realpath(served)).startsWith(allowedRoot+'/'))return send(res,404,{error:'Halaman tidak ditemui'});
const type={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.xml':'application/xml; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf'}[extname(served)]||'application/octet-stream';
const privatePage=requested==='/admin.html',etag='"'+info.size.toString(16)+'-'+Math.trunc(info.mtimeMs).toString(16)+'"';
res.setHeader('Content-Type',type);res.setHeader('Cache-Control',privatePage?'no-store':'public, max-age=0, must-revalidate');
if(privatePage)res.setHeader('X-Robots-Tag','noindex, nofollow');else{res.setHeader('ETag',etag);if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end()}}
res.setHeader('Accept-Ranges','bytes');
const range=byteRange(req.headers.range,info.size);
if(range===false){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end()}
if(range){res.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${info.size}`);res.setHeader('Content-Length',range.end-range.start+1)}else res.setHeader('Content-Length',info.size);
res.writeHead(range?206:200);if(req.method==='HEAD')return res.end();
const stream=createReadStream(served,range||{});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}catch{return send(res,404,{error:'Halaman tidak ditemui'})}
}catch(e){send(res,e.status===413?413:400,{error:e.status===413?'Permintaan terlalu besar.':'Permintaan tidak dapat diproses.'})}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=http.createServer(await createApplication());
  server.requestTimeout=30000;server.headersTimeout=10000;
  server.listen(Number(process.env.PORT||4180),'127.0.0.1',()=>console.log('Ehsan TVET: http://localhost:'+(process.env.PORT||4180)));
}
