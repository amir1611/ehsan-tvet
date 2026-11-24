// Versioned public/content.json is the publishing source. Never read private data/.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const data=JSON.parse(await readFile(resolve(root,'content.json'),'utf8'));
const base='https://ehsan-tvet.vercel.app';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asset=name=>name?'/assets/'+encodeURIComponent(name):'/assets/favicon.svg';
const org={'@type':'EducationalOrganization','@id':base+'/#institute',name:'Ehsan TVET Institute',url:base+'/',telephone:data.phone,email:data.email,address:data.address,sameAs:['https://www.instagram.com/ehsantvet/']};
const schema=c=>({'@type':'Course','@id':`${base}/program/${c.id}#course`,name:c.title,description:c.description,courseCode:c.code,coursePrerequisites:c.requirements,educationalLevel:c.level,inLanguage:'ms-MY',url:`${base}/program/${c.id}`,provider:{'@id':org['@id']}});
const ld=graph=>`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c')}</script>`;
for(const c of data.courses)if(!/^[a-z0-9-]+$/.test(c.id))throw Error('Invalid public course ID');
if(new Set(data.courses.map(c=>c.id)).size!==data.courses.length)throw Error('Duplicate programme ID');
const font='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap">';
const courses=data.courses.map((c,i)=>`<article class="course-card" style="--card-index:${i}"><span class="course-number" aria-hidden="true">0${i+1}</span><div class="course-image"><img src="${asset(c.image)}" alt="${esc(c.title)}" width="1254" height="1254" loading="lazy" decoding="async"><span>${esc(c.level)}</span></div><div class="course-body"><div class="course-labels"><div class="course-code">${esc(c.code)}</div><span class="course-category">${esc(c.category)}</span></div><h3><a href="/program/${c.id}">${esc(c.title)}</a></h3><p>${esc(c.description)}</p><div class="course-bottom"><strong>${esc(c.fee)}</strong><a href="/program/${c.id}">Lihat program ↗</a></div></div></article>`).join('');
let home=await readFile(resolve(root,'index.html'),'utf8');
if(!home.includes('<!-- courses:start -->')||!home.includes('<!-- courses:end -->'))throw Error('Homepage course markers are missing');
home=home.replace(/<!-- courses:start -->[\s\S]*?<!-- courses:end -->/,()=>`<!-- courses:start -->${courses}<!-- courses:end -->`);
home=home.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,()=>ld([org,{'@type':'WebSite',url:base+'/',name:'Ehsan TVET Institute',inLanguage:'ms-MY'},{'@type':'FAQPage',mainEntity:data.site.faq.items.map(x=>({'@type':'Question',name:x.q,acceptedAnswer:{'@type':'Answer',text:x.a.replaceAll('{address}',data.address)}}))},...data.courses.map(schema)]));
home=home.replace(/(<p id="hero-text"[^>]*>)[\s\S]*?(<\/p>)/,(_,a,b)=>a+esc(data.heroText)+b);
for(const key of ['phone','email','address']){
 const tag=key==='address'?'p':'a';
 home=home.replace(new RegExp(`(<${tag} id="${key}"[^>]*>)[\\s\\S]*?(</${tag}>)`),(_,a,b)=>a+esc(data[key])+b);
}
for(const [index,item] of data.site.faq.items.entries()){
  for(const [key,tag] of [['q','summary'],['a','p']]){
    const start = `<${tag} data-t="site.faq.items.${index}.${key}">`;
    const offset = home.indexOf(start);
    const end = home.indexOf(`</${tag}>`,offset);
    if(offset<0 || end<0)throw Error('Missing FAQ field: '+index+'.'+key);
    home=home.slice(0,offset+start.length)+esc(item[key].replaceAll('{address}',data.address))+home.slice(end);
  }
}
const phoneDigits=data.phone.replace(/[^0-9]/g,'').replace(/^0/,'60');
for(const [id,href] of [['phone','tel:+'+phoneDigits],['email','mailto:'+data.email],['whatsapp','https://wa.me/'+phoneDigits]]){
  home=home.replace(new RegExp(`(<a id="${id}"[^>]*?href=")[^"]*`),(_,prefix)=>prefix+esc(href));
}
await writeFile(resolve(root,'index.html'),home);
await mkdir(resolve(root,'program'),{recursive:true});
for(const c of data.courses){
 const url=`${base}/program/${c.id}`;
 const related=data.courses.filter(x=>x.id!==c.id).map(x=>`<li><a href="/program/${x.id}">${esc(x.title)}</a></li>`).join('');
 const title = c.level+' · '+c.title+' | Ehsan TVET';
 const body=`<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(c.description)}"><link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(c.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${base}${asset(c.image)}"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/program.css">${font}${ld([org,schema(c)])}</head><body><main class="program-page"><nav aria-label="Navigasi program"><a href="/">Ehsan TVET Institute</a><a href="/#program">Semua program</a><a href="/#hubungi">Hubungi kami</a></nav><p>${esc(c.level)} · ${esc(c.category)}</p><h1>${esc(c.title)}</h1><p class="program-intro">${esc(c.description)}</p><div class="program-layout"><div><dl><dt>Kod program</dt><dd>${esc(c.code)}</dd><dt>Yuran</dt><dd>${esc(c.fee)}</dd><dt>Tempoh</dt><dd>${esc(c.duration)}</dd></dl><h2>Siapakah yang boleh memohon?</h2><p>${esc(c.requirements)}</p><p>Maklumat yuran, tempoh dan pengambilan tertakluk kepada pengesahan institusi.</p><a href="/?program=${c.id}#hubungi" class="button">Tanya tentang program ini ↗</a>${c.pdf?`<p><a href="/assets/${encodeURIComponent(c.pdf)}">Maklumat kursus (PDF)</a></p>`:''}<h2>Di manakah latihan dijalankan?</h2><p>Latihan dijalankan di Ehsan TVET Institute, ${esc(data.address)}.</p><h2>Bagaimanakah cara menyemak pengambilan?</h2><p>Hubungi penyelaras melalui <a href="tel:+${phoneDigits}">${esc(data.phone)}</a> atau <a href="mailto:${esc(data.email)}">${esc(data.email)}</a> untuk semakan kelayakan dan pengambilan.</p></div><img class="program-poster" src="${asset(c.image)}" alt="Poster ${esc(c.title)}" width="1254" height="1254" decoding="async"></div><p><a class="compare-link" href="/banding-program">Bandingkan yuran dan syarat semua program</a></p><h2>Program lain di Ehsan TVET</h2><ul class="related">${related}</ul><footer>© Ehsan TVET Institute · Port Dickson, Negeri Sembilan</footer></main></body></html>`;
 await writeFile(resolve(root,`program/${c.id}.html`),body);
}
const compareUrl=base+'/banding-program';
const compareTitle='Bandingkan Program Elektrik di Port Dickson | Ehsan TVET';
const compareDescription='Bandingkan tahap kelayakan, yuran dan syarat kemasukan bagi program elektrik di Ehsan TVET Institute, Port Dickson.';
const courseNames = new Intl.ListFormat('ms', {type:'conjunction'});
const pathways = [...new Set(data.courses.map(c=>c.category))].map(category=>{
  const levels = data.courses.filter(c=>c.category===category).map(c=>c.level);
  return `<strong>${esc(category)}</strong> merangkumi ${esc(courseNames.format([...new Set(levels)]))}.`;
});
const comparisonList = {
  '@type':'ItemList', url:compareUrl, name:'Perbandingan program elektrik Ehsan TVET',
  itemListElement:data.courses.map((course,index)=>({
    '@type':'ListItem', position:index+1, name:course.title, url:schema(course).url
  }))
};
const comparisonRows=data.courses.map(c=>`<tr>
  <th scope="row"><a href="/program/${c.id}">${esc(c.title)}</a><small>${esc(c.code)}</small>${c.pdf?`<small><a href="${asset(c.pdf)}" aria-label="Risalah ${esc(c.title)} (PDF)">Risalah program (PDF)</a></small>`:''}</th>
  <td>${esc(c.level)}<small>${esc(c.category)}</small></td>
  <td>${esc(c.fee)}</td><td>${esc(c.requirements)}</td>
</tr>`).join('');
const comparison=`<!doctype html><html lang="ms"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${compareTitle}</title><meta name="description" content="${compareDescription}">
<link rel="canonical" href="${compareUrl}"><meta property="og:url" content="${compareUrl}">
<meta property="og:type" content="website"><meta property="og:title" content="${compareTitle}">
<meta property="og:description" content="${compareDescription}">
<link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/program.css">${font}${ld([comparisonList])}</head>
<body><main class="program-page"><nav aria-label="Navigasi program"><a href="/">Ehsan TVET Institute</a><a href="/#program">Semua program</a></nav>
<h1>Bandingkan program elektrik</h1><h2>Apakah pilihan latihan elektrik di Port Dickson?</h2><p class="program-intro">Ehsan TVET Institute menawarkan ${data.courses.length} program elektrik di Port Dickson. ${pathways.join(' ')}</p>
<div class="compare-scroll" role="region" tabindex="0" aria-label="Perbandingan program"><table>
<caption>Yuran dan syarat kemasukan mengikut program di Ehsan TVET Institute</caption>
<thead><tr><th scope="col">Program</th><th scope="col">Kelayakan</th><th scope="col">Yuran</th><th scope="col">Syarat kemasukan</th></tr></thead>
<tbody>${comparisonRows}</tbody></table></div>
<h2>Bagaimanakah cara mengesahkan yuran dan pengambilan?</h2>
<p>Nyatakan nama atau kod program kepada penyelaras Ehsan TVET melalui <a href="tel:+${phoneDigits}">${esc(data.phone)}</a> untuk menyemak yuran semasa, tempoh latihan dan tarikh pengambilan.</p>
<a class="button" href="/#hubungi">Dapatkan panduan memilih program ↗</a></main></body></html>`;
await writeFile(resolve(root,'banding-program.html'),comparison);
const urls=[base+'/',compareUrl,...data.courses.map(c=>`${base}/program/${c.id}`)];
await writeFile(resolve(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${url}</loc></url>`).join('')+'</urlset>\n');
console.log(`Generated ${data.courses.length} program pages and matching public schema.`);
