import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {hashPassword,checkPassword,jsonBody,validRole,validEnquiry,rateLimiter,USERNAME,byteRange} from '../security.mjs';

test('password hashes remain compatible and reject incorrect passwords',async()=>{
  const hash=await hashPassword('fixture-password');
  assert.equal(await checkPassword(hash,'fixture-password'),true);
  assert.equal(await checkPassword(hash,'wrong'),false);
  assert.equal(await checkPassword(null,'fixture-password'),false);
});
test('JSON boundaries enforce byte size and object shape',async()=>{
  assert.deepEqual(await jsonBody(Readable.from([Buffer.from('{"ok":true}')])) ,{ok:true});
  for(const input of ['null','[]','"string"','1'])await assert.rejects(()=>jsonBody(Readable.from([Buffer.from(input)])));
  await assert.rejects(()=>jsonBody(Readable.from([Buffer.from('{"name":"ééé"}')]),12),{status:413});
});
test('roles reject inherited object properties; usernames accept the requested format',()=>{
  assert.equal(validRole('editor'),true);
  for(const role of ['toString','__proto__','constructor',null,{}])assert.equal(validRole(role),false);
  assert.equal(USERNAME.test('admin@example'),true);
  assert.equal(USERNAME.test('<script>'),false);
});
test('enquiries require explicit consent and bounded fields',()=>{
  const input={name:'Fixture',phone:'0100000000',email:'fixture@example.com',consent:true};
  assert.equal(validEnquiry(input),true);
  for(const invalid of [{consent:'true'},{name:{}},{course:'x'.repeat(3001)},{email:'invalid'},{message:[]}])assert.equal(validEnquiry({...input,...invalid}),false);
});
test('rate-limit expiry recovers capacity without dropping active limits',()=>{
  let time=0;const limit=rateLimiter({maxKeys:1,windowMs:10,now:()=>time});
  assert.equal(limit('a',2),true);assert.equal(limit('a',2),true);assert.equal(limit('a',2),false);
  assert.equal(limit('b',2),false);time=11;assert.equal(limit('b',2),true);
});
test('video ranges support seeking and reject invalid bounds',()=>{
  assert.deepEqual(byteRange('bytes=10-19',100),{start:10,end:19});
  assert.deepEqual(byteRange('bytes=-20',100),{start:80,end:99});
  assert.deepEqual(byteRange('bytes=10-',100),{start:10,end:99});
  assert.equal(byteRange('bytes=200-300',100),false);
  assert.equal(byteRange('bytes=0-1,4-5',100),false);
  assert.equal(byteRange('bytes=-0',100),false);
  assert.equal(byteRange(undefined,100),null);
});
