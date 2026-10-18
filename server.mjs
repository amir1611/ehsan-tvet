import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {initialContent} from './seed.mjs';
const root=dirname(fileURLToPath(import.meta.url)),publicRoot=resolve(root,'public'),data=process.env.DATA_DIR||resolve(root,'data');
const uploads=resolve(data,'uploads');await mkdir(uploads,{recursive:true});
const read=async(name,fallback)=>{try{return JSON.parse(await readFile(resolve(data,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const writes=new Map();
const save=(name,value)=>{const snapshot=JSON.stringify(value,null,2),previous=writes.get(name)||Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{const p=resolve(data,name),t=p+'.tmp';await writeFile(t,snapshot,{mode:0o600});await rename(t,p)});writes.set(name,next);return next};
let content=await read('content.json',initialContent),enquiries=await read('enquiries.json',[]);
let credentials=await read('credentials.json',null);
if(!credentials){const password=process.env.ADMIN_PASSWORD||randomBytes(12).toString('base64url'),salt=randomBytes(16).toString('hex');credentials={salt,hash:scryptSync(password,salt,64).toString('hex')};await save('credentials.json',credentials);console.log('Initial admin password:',password)}
const sessions=new Map(),attempts=new Map();
const session=req=>sessions.get((req.headers.cookie||'').match(/(?:^|; )ehsan_session=([^;]+)/)?.[1]);
const valid=req=>{const s=session(req);return s&&s>Date.now()};
const send=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value))};
async function rawBody(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Fail terlalu besar');chunks.push(chunk)}return Buffer.concat(chunks)}
const imageType=b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'jpg':b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?'png':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'webp':null;
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw Error('Permintaan terlalu besar')}return JSON.parse(text||'{}')}
const limit=(key,max)=>{const now=Date.now(),a=(attempts.get(key)||[]).filter(t=>now-t<900000);if(a.length>=max)return false;a.push(now);attempts.set(key,a);return true};
const fields=['heroTitle','heroText','phone','email','address'];
export const server=http.createServer(async(req,res)=>{try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
const url=new URL(req.url,'http://localhost'),path=url.pathname;
if(['POST','PUT','DELETE','PATCH'].includes(req.method)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Origin tidak dibenarkan'});
if(path==='/api/content'&&req.method==='GET')return send(res,200,content);
if(path==='/api/login'&&req.method==='POST'){
if(!limit('login:'+req.socket.remoteAddress,10))return send(res,429,{error:'Terlalu banyak percubaan. Cuba lagi dalam 15 minit.'});
const {password}=await body(req);if(typeof password!=='string'||password.length>200||!timingSafeEqual(scryptSync(password,credentials.salt,64),Buffer.from(credentials.hash,'hex')))return send(res,401,{error:'Kata laluan tidak sah.'});
const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);return send(res,200,{ok:true},{'Set-Cookie':`ehsan_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`});}
if(path==='/api/logout'&&req.method==='POST'){sessions.delete((req.headers.cookie||'').match(/ehsan_session=([^;]+)/)?.[1]);return send(res,200,{ok:true},{'Set-Cookie':'ehsan_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
if(path==='/api/session')return send(res,valid(req)?200:401,{authenticated:!!valid(req)});
if(path==='/api/enquiries'&&req.method==='POST'){
if(!limit('enquiry:'+req.socket.remoteAddress,8))return send(res,429,{error:'Sila cuba lagi kemudian.'});
const b=await body(req);if(!b.consent||!b.name?.trim()||!b.phone?.trim()||!b.email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||[b.name,b.phone,b.email,b.message||''].some(v=>typeof v!=='string'||v.length>3000))return send(res,400,{error:'Lengkapkan maklumat dan persetujuan anda.'});
const item={id:randomBytes(8).toString('hex'),name:b.name,phone:b.phone,email:b.email,course:String(b.course||''),message:b.message||'',status:'Baharu',createdAt:new Date().toISOString(),consentAt:new Date().toISOString()};enquiries=[item,...enquiries];await save('enquiries.json',enquiries);return send(res,201,{ok:true});}
if(path.startsWith('/api/')){
if(!valid(req))return send(res,401,{error:'Sila log masuk.'});
if(path==='/api/upload'&&req.method==='POST'){let buf;try{buf=await rawBody(req,5*1024*1024)}catch{return send(res,413,{error:'Imej terlalu besar (maksimum 5MB).'})}const ext=imageType(buf);if(!ext)return send(res,400,{error:'Format imej tidak sah. Gunakan JPG, PNG atau WebP.'});const name=randomBytes(12).toString('hex')+'.'+ext;await writeFile(resolve(uploads,name),buf,{mode:0o600});return send(res,201,{name})}
if(path==='/api/content'&&req.method==='PUT'){const b=await body(req);if(fields.some(k=>typeof b[k]!=='string'||!b[k].trim()||b[k].length>5000)||!Array.isArray(b.courses)||b.courses.length>30||b.courses.some(c=>['id','title','category','level','description','code','fee','duration','requirements','image','pdf'].some(k=>typeof c[k]!=='string'||c[k].length>5000)||!c.title.trim()||!c.id.match(/^[a-z0-9-]+$/)))return send(res,400,{error:'Kandungan tidak sah.'});content=b;await save('content.json',content);return send(res,200,{ok:true})}
if(path==='/api/enquiries'&&req.method==='GET')return send(res,200,enquiries);
if(path.startsWith('/api/enquiries/')&&req.method==='PATCH'){const b=await body(req),item=enquiries.find(e=>e.id===path.split('/').pop());if(!item)return send(res,404,{error:'Tidak ditemui'});if(!['Baharu','Dihubungi','Selesai'].includes(b.status))return send(res,400,{error:'Status tidak sah'});item.status=b.status;await save('enquiries.json',enquiries);return send(res,200,{ok:true})}
return send(res,404,{error:'Tidak ditemui'});}
const requested=path==='/admin'||path==='/admin/'?'/admin.html':path==='/'?'/index.html':decodeURIComponent(path);const file=resolve(publicRoot,'.'+requested);if(!file.startsWith(publicRoot+'/'))return send(res,403,{error:'Dilarang'});
try{let buf;try{buf=await readFile(file)}catch(e){if(!requested.startsWith('/assets/'))throw e;const u=resolve(uploads,requested.slice(8));if(!u.startsWith(uploads+'/'))throw e;buf=await readFile(u)}const type={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(buf)}catch{return send(res,404,{error:'Halaman tidak ditemui'})}
}catch(e){send(res,400,{error:'Permintaan tidak dapat diproses.'})}});
server.listen(Number(process.env.PORT||4180),'127.0.0.1',()=>console.log('Ehsan TVET: http://localhost:'+(process.env.PORT||4180)));
