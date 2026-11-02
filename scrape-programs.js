// Lit la liste des programmes de l'UQAM (etudier.uqam.ca/programmes) et l'écrit en JSON.
// Usage : node scrape-programs.js sortie.json
const {chromium}=require('playwright');
const fs=require('fs');
const out=process.argv[2]||'programmes.json';
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage();
  await p.goto('https://etudier.uqam.ca/programmes',{waitUntil:'networkidle',timeout:60000});
  const rows=await p.evaluate(()=>[...document.querySelectorAll('table tbody tr')].map(tr=>{
    const t=c=>{const e=tr.querySelector('td.'+c);return e?e.textContent.replace(/\s+/g,' ').trim():'';};
    const a=tr.querySelector('td a');
    return {title:a?a.textContent.replace(/\s+/g,' ').trim():'',href:a?a.getAttribute('href'):'',type:t('types'),cycle:t('cycles'),
      domaines:t('domaine'),code:t('code'),campus:t('campus'),trimestres:t('trimestre'),
      contingent:t('contingent')==='1',nouveau:t('nouveau')==='1'};
  }).filter(r=>r.title&&r.code));
  await b.close();
  const norm=r=>({...r,
    url:new URL(r.href,'https://etudier.uqam.ca/').href,
    domaines:[...new Set(r.domaines.split(',').map(s=>s.replace(/#\d+/,'').trim()).filter(Boolean))],
    campus:r.campus.split(',').map(s=>s.replace(/^Campus (de |du |d')?/,'').trim()).filter(Boolean),
    trimestres:r.trimestres.split(',').map(s=>s.trim()).filter(Boolean)});
  const progs=rows.map(norm);
  if(progs.length<200){console.error('Trop peu de programmes lus : '+progs.length);process.exit(1);}
  fs.writeFileSync(out,JSON.stringify({fetched:new Date().toISOString(),programmes:progs},null,1));
  console.log(progs.length+' programmes');
})();
