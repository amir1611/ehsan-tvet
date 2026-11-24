import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const derive = promisify(scrypt);
export const USERNAME = /^[a-z0-9._@-]{3,60}$/;
export const ROLES = Object.freeze({admin:['content','enquiries','users','audit'],editor:['content'],staff:['enquiries']});
export const validRole = role => typeof role === 'string' && Object.hasOwn(ROLES,role);
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function byteRange(header,size){
  if(!header)return null;
  const m=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!m||(!m[1]&&!m[2])||size<1)return false;
  let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
  let end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
  return {start,end};
}
export async function hashPassword(password,salt=randomBytes(16).toString('hex')) {
  return {salt,hash:(await derive(password,salt,64)).toString('hex')};
}
export async function checkPassword(user,password) {
  const dummy=user||{salt:'0'.repeat(32),hash:'0'.repeat(128)};
  const expected=Buffer.from(dummy.hash,'hex');
  const actual=await derive(password,dummy.salt,64);
  return expected.length===actual.length && timingSafeEqual(actual,expected) && !!user;
}
export async function jsonBody(req,max=400000) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>max){const e=Error('Permintaan terlalu besar');e.status=413;throw e}chunks.push(chunk)}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
  if(!isObject(value))throw Error('Objek JSON diperlukan');
  return value;
}
export function validEnquiry(b) {
  return b.consent===true && ['name','phone','email'].every(k=>typeof b[k]==='string'&&b[k].trim().length>0&&b[k].length<=3000)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)
    && ['message','course'].every(k=>b[k]===undefined||(typeof b[k]==='string'&&b[k].length<=3000));
}
export function rateLimiter({windowMs=900000,maxKeys=10000,now=Date.now}={}) {
  const entries=new Map();
  return (key,max)=>{
    const time=now();
    for(const [k,v] of entries)if(v.expires<=time)entries.delete(k);
    let bucket=entries.get(key);
    if(!bucket){if(entries.size>=maxKeys)return false;bucket={count:0,expires:time+windowMs};entries.set(key,bucket)}
    if(bucket.count>=max)return false;
    bucket.count++;return true;
  };
}
export const contentSecurityPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self' https://maps.google.com https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
