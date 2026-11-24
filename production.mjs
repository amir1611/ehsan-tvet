import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApplication} from './server.mjs';

let pool;
let schemaReady=false;
function database() {
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL || process.env.POSTGRES_URL);
    url.searchParams.set('sslmode', 'verify-full');
    pool = new pg.Pool({
      connectionString: url.toString(), max: 2, idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000, allowExitOnIdle: true,
    });
    pool.on('error', () => console.error('Database connection closed unexpectedly.'));
  }
  return pool;
}

// Buffer the response until its state and audit records have committed together.
function bufferedResponse() {
  const headers = new Map();
  return {
    statusCode: 200, body: undefined,
    setHeader(name,value) { headers.set(name,value); },
    writeHead(status,values={}) {
      this.statusCode=status;
      for (const [name,value] of Object.entries(values)) headers.set(name,value);
    },
    end(body) { this.body=body; },
    flush(res) {
      for (const [name,value] of headers) res.setHeader(name,value);
      res.statusCode=this.statusCode;
      res.end(this.body);
    },
  };
}

export default async function production(req,res) {
  let client;
  try {
    client=await database().connect();
    // A transaction lock serializes this small CMS across serverless instances.
    await client.query(`BEGIN;
      SET LOCAL lock_timeout = '15s';
      SET LOCAL statement_timeout = '20s';
      SELECT pg_advisory_xact_lock(41804180)`);
    if(!schemaReady)await client.query(`CREATE TABLE IF NOT EXISTS ehsan_state (
      id integer PRIMARY KEY CHECK (id=1), payload jsonb NOT NULL
    )`);
    if(!schemaReady)await client.query(`CREATE TABLE IF NOT EXISTS ehsan_images (
      name text PRIMARY KEY, type text NOT NULL, body bytea NOT NULL
    )`);
    const result=await client.query('SELECT payload FROM ehsan_state WHERE id=1 FOR UPDATE');
    const documents=result.rows[0]?.payload || {};
    const baseline=JSON.parse(await readFile(new URL('./public/content.json',import.meta.url),'utf8'));
    const now=Date.now();
    const buckets=documents['limits.json'] || {};
    for(const [key,value] of Object.entries(buckets))if(value.expires<=now)delete buckets[key];
    const storage={
      clientIP(req) {
        // Vercel overwrites this header at its trusted edge.
        return String(req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      },
      async read(name,fallback) {
        return documents[name] ?? (name==='content.json'?baseline:structuredClone(fallback));
      },
      async save(name,value) { documents[name]=value; },
      limit(key,max) {
        const digest=createHash('sha256').update(key).digest('hex');
        if(!buckets[digest]){
          if(Object.keys(buckets).length>=10000)return false;
          buckets[digest]={count:0,expires:now+900000};
        }
        if(buckets[digest].count>=max)return false;
        buckets[digest].count++;
        return true;
      },
      async saveImage(name,body,ext) {
        await client.query('INSERT INTO ehsan_images(name,type,body) VALUES ($1,$2,$3)',
          [name,ext==='jpg'?'image/jpeg':'image/'+ext,body]);
      },
      async readImage(name) {
        return (await client.query('SELECT type,body FROM ehsan_images WHERE name=$1',[name])).rows[0];
      },
    };
    const response=bufferedResponse();
    const handle=await createApplication(storage);
    await handle(req,response);
    documents['sessions.json']=[...storage.sessions].filter(([,session])=>session.exp>now);
    documents['limits.json']=buckets;
    await client.query(`INSERT INTO ehsan_state(id,payload) VALUES (1,$1)
      ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload`,[JSON.stringify(documents)]);
    await client.query('COMMIT');
    schemaReady=true;
    response.flush(res);
  } catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    console.error('Admin backend request failed.',error.code || error.name);
    res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'The admin service is temporarily unavailable. Please try again later.'}));
  } finally {
    client?.release();
  }
}
