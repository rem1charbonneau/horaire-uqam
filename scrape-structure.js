// Lit la structure (blocs de cours, concentrations) de chaque programme.
// Usage : node scrape-structure.js programmes.json sortie.json [domaine=Gestion] [codes...]
const {chromium}=require('playwright');
const fs=require('fs');
const [,, progFile, out, domaine='Gestion', ...only]=process.argv;
const progs=JSON.parse(fs.readFileSync(progFile)).programmes.filter(p=>p.domaines.includes(domaine)&&(!only.length||only.includes(p.code)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let prev={};try{prev=JSON.parse(fs.readFileSync(out)).programmes||{};}catch(e){}
(async()=>{
  const b=await chromium.launch();
  const res={};let errors=0;
  for(const pr of progs){
    const p=await b.newPage();
    try{
      await p.goto(pr.url,{waitUntil:'networkidle',timeout:60000});
      const d=await p.evaluate(()=>{
        const root=document.querySelector('#bloc_cours');
        if(!root)return null;
        const conc=[...root.querySelectorAll('select option')].map(o=>o.textContent.replace(/\s+/g,' ').trim()).filter(Boolean);
        const sections=[];let cur=null;
        let grp='',sub='';
        const LEG=/^(trimestres|préalables|prealables|enseignement en ligne)$/i;
        root.querySelectorAll('h3.titre_bloc, h4, div.bloc_cours').forEach(n=>{
          if(n.matches('h4')){
            const t=n.innerText.replace(/\s+/g,' ').trim();
            if(!cur||!t||LEG.test(t)||/^ou$/i.test(t))return;
            if(/^(profil|concentration|cheminement)/i.test(t)){grp=t.replace(/\s*:\s*$/,'');sub='';}else sub=t.replace(/\s*:\s*$/,'');
            return;
          }
          if(n.matches('h3')){grp='';sub='';cur={heading:n.innerText.replace(/\s+/g,' ').trim(),courses:[]};sections.push(cur);}
          else{
            if(!cur){cur={heading:'',courses:[]};sections.push(cur);}
            const l=n.querySelector('.ligne_cours');if(!l)return;
            const sig=l.getAttribute('data-sigle')||l.id.replace(/_\d+$/,'');
            const txt=(l.querySelector('.texte')||l).textContent.replace(/\s+/g,' ').trim();
            const tri={};l.querySelectorAll('.trimestres span').forEach(s=>{tri[s.textContent.trim()]=s.classList.contains('actif');});
            cur.courses.push(Object.assign({sigle:sig,title:txt.replace(/^[A-Z]{3}\d{3}[0-9A-Z]\s*-\s*/,''),
              pre:!!l.querySelector('.prealables'),online:!!l.querySelector('.enLigne'),offered:tri},grp?{grp}:{},sub?{sub}:{}));
          }
        });
        const intro=(document.querySelector('#bloc_presentation')||{innerText:''}).innerText.replace(/\s+/g,' ').trim().slice(0,600);
        return {concentrations:conc,sections,intro};
      });
      if(!d||!d.sections.length)res[pr.code]={code:pr.code,title:pr.title,type:pr.type,cycle:pr.cycle,url:pr.url,sections:[],note:'aucune liste de cours sur la page'};
      else res[pr.code]={code:pr.code,title:pr.title,type:pr.type,cycle:pr.cycle,url:pr.url,fetched:new Date().toISOString(),...d};
      console.log(pr.code,pr.type,pr.title,'|',(res[pr.code].sections||[]).reduce((a,s)=>a+s.courses.length,0),'cours');
    }catch(e){errors++;console.log('ERREUR',pr.code,e.message.slice(0,80));if(prev[pr.code])res[pr.code]=prev[pr.code];}
    await p.close();await sleep(1200);
  }
  await b.close();
  fs.writeFileSync(out,JSON.stringify({fetched:new Date().toISOString(),programmes:res},null,0));
  console.log('Terminé :',Object.keys(res).length,'programmes,',errors,'erreurs');
  if(Object.keys(res).length<progs.length*0.8)process.exit(1);
})();
