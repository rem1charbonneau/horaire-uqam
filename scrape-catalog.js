// Lit seulement la fiche de chaque cours (titre, crédits, préalables) pour le catalogue des programmes.
// Usage : node scrape-catalog.js <catalogue.json> <structure.json>  — fusionne dans le catalogue existant, lent et poli.
const {chromium}=require('playwright');const fs=require('fs');
const out=process.argv[2],struct=process.argv[3];
let cat={};try{cat=JSON.parse(fs.readFileSync(out,'utf8'));}catch(e){}
const st=JSON.parse(fs.readFileSync(struct,'utf8'));
const all=new Set();
Object.values(st.programmes).forEach(p=>(p.sections||[]).forEach(s=>(s.courses||[]).forEach(c=>{if(/^[A-Z]{3}\d{4}$/.test(c.sigle))all.add(c.sigle);})));
const week=Date.now()-6*864e5;
const queue=[...all].filter(s=>!cat[s]||!cat[s].fetched||new Date(cat[s].fetched).getTime()<week).sort();
console.log('Cours à lire :',queue.length,'sur',all.size);
let errors=0,done=0;
(async()=>{
  const b=await chromium.launch();
  async function worker(){
    while(queue.length){
      const sig=queue.shift();const p=await b.newPage();
      try{
        await p.goto('https://etudier.uqam.ca/cours?sigle='+sig,{waitUntil:'networkidle',timeout:45000});
        const info=await p.evaluate(()=>{
          const t=document.title.replace(/^Cours\s+\S+\s*\|\s*/,'').replace(/\s*\|\s*UQAM$/,'');
          const body=document.body.innerText;
          const cr=(body.match(/Nombre de crédits\s*:\s*(\d+)/)||[])[1]||null;
          let pre='';const m=body.match(/Préalables académiques\s*\n+([\s\S]{0,700}?)(?=\n\s*(?:Programmes associés|Corequis|Co-?requis|Concomitant|Description|Objectif|Cible|Modalité)|\nEN SAVOIR PLUS|$)/i);
          if(m)pre=('Préalables académiques '+m[1]).replace(/\s+/g,' ').trim();
          const rep=(body.match(/[A-Z]{3}\d{4}\s+remplace\s+[A-Z]{3}\d{4}(?:\s*,\s*[A-Z]{3}\d{4})*/)||[])[0]||'';
          return {title:t,credits:cr,pre:pre,replaces:rep};
        });
        cat[sig]={title:info.title,credits:info.credits?+info.credits:null,prereq:info.pre,prereqSigles:[...new Set((info.pre.match(/[A-Z]{3}\d{4}/g)||[]))].filter(x=>x!==sig),replaces:info.replaces,fetched:new Date().toISOString()};
        if(++done%50===0){console.log(done,'lus');fs.writeFileSync(out,JSON.stringify(cat));}
      }catch(e){errors++;console.log(sig,'ERREUR',e.message.slice(0,100));}
      await p.close();await new Promise(r=>setTimeout(r,1200));
    }
  }
  await Promise.all([worker(),worker()]);
  await b.close();
  fs.writeFileSync(out,JSON.stringify(cat));
  console.log('Terminé :',done,'lus,',errors,'erreurs');
  if(errors>done/3+5){console.log('Trop d\'erreurs');process.exit(1);}
})();
