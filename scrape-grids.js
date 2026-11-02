// Lit la « grille type de l'étudiant » (cheminement par trimestre) de la fiche officielle de chaque programme.
// Usage : node scrape-grids.js programmes.json sortie.json [--raw] [codes...]
const {chromium}=require('playwright');
const fs=require('fs');
const args=process.argv.slice(2);
const raw=args.includes('--raw');
const [progFile,out,...rest]=args.filter(a=>a!=='--raw');
const only=rest;
const progs=JSON.parse(fs.readFileSync(progFile)).programmes.filter(p=>p.domaines.includes('Gestion')&&(!only.length||only.includes(p.code)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch();const res={};let errors=0;
  for(const pr of progs){
    const p=await b.newPage();
    try{
      await p.goto(pr.url,{waitUntil:'networkidle',timeout:60000});
      const d=await p.evaluate((raw)=>{
        const ids=[...document.querySelectorAll('[id*="grille" i],[class*="grille" i]')];
        const tables=[...document.querySelectorAll('table')];
        const pick=tables.filter(t=>/trimestre/i.test(t.innerText)&&/[A-Z]{3}\d{4}/.test(t.innerText));
        const grids=pick.map(t=>{
          const title=(()=>{let n=t;for(let i=0;i<6&&n;i++){let s=n.previousElementSibling;while(s){if(/^H[1-6]$/.test(s.tagName)||s.matches('.titre_bloc,.titre'))return s.innerText.replace(/\s+/g,' ').trim();s=s.previousElementSibling;}n=n.parentElement;}return '';})();
          const rows=[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>({t:c.innerText.replace(/\s+/g,' ').trim(),s:(c.innerText.match(/[A-Z]{3}\d{4}/g)||[])})));
          return {title,rows};
        });
        return {grids,ids:ids.slice(0,8).map(e=>e.tagName+'#'+e.id+'.'+e.className),nTables:tables.length,
          raw:raw?ids.slice(0,3).map(e=>e.outerHTML.slice(0,12000)):undefined};
      },raw);
      res[pr.code]={code:pr.code,title:pr.title,type:pr.type,url:pr.url,fetched:new Date().toISOString(),...d};
      console.log(pr.code,pr.title,'|',d.grids.length,'grille(s)',d.nTables,'tables');
    }catch(e){errors++;console.log('ERREUR',pr.code,e.message.slice(0,80));}
    await p.close();await sleep(1200);
  }
  await b.close();
  fs.writeFileSync(out,JSON.stringify({fetched:new Date().toISOString(),programmes:res},null,raw?1:0));
  console.log('Terminé :',Object.keys(res).length,'programmes,',errors,'erreurs');
})();
