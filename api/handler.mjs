import production from '../production.mjs';

export default function handler(req,res) {
  const url=new URL(req.url,'https://ehsan-tvet.vercel.app');
  const route=req.query?.__route || url.searchParams.get('__route');
  if(typeof route==='string'){
    url.pathname='/api/'+route;
    url.searchParams.delete('__route');
    req.url=url.pathname+url.search;
  }
  return production(req,res);
}
