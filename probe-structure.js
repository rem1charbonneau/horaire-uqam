// Diagnostic : décrit les éléments de #bloc_cours (titres, sous-titres, classes) d'une fiche de programme.
const {chromium}=require('playwright');const fs=require('fs');
const [,,out,...codes]=process.argv;
(async()=>{
  const b=await chromium.launch();const res={};
  for(const c of codes){
    const p=await b.newPage();
    try{
      await p.goto('https://etudier.uqam.ca/programme?code='+c,{waitUntil:'networkidle',timeout:60000});
      res[c]=await p.evaluate(()=>{
        const root=document.querySelector('#bloc_cours');if(!root)return null;
        const out=[];
        root.querySelectorAll('*').forEach(n=>{
          const isCourse=n.classList.contains('ligne_cours');
          const own=[...n.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent.trim()).filter(Boolean).join(' ');
          if(isCourse){out.push('C '+(n.getAttribute('data-sigle')||n.id)+' | parents: '+(()=>{let a=[],e=n.parentElement;for(let i=0;i<4&&e&&e!==root;i++){a.push(e.tagName.toLowerCase()+(e.className?'.'+String(e.className).trim().replace(/\s+/g,'.'):'')+(e.id?'#'+e.id:''));e=e.parentElement;}return a.join(' < ');})());}
          else if(/^H[1-6]$/.test(n.tagName)||n.matches('.titre_bloc,.sous_titre,[class*=titre],[class*=concentration],[class*=profil]'))out.push('H '+n.tagName.toLowerCase()+'.'+String(n.className).trim().replace(/\s+/g,'.')+' : '+n.innerText.replace(/\s+/g,' ').trim().slice(0,100));
        });
        return {selects:[...root.querySelectorAll('select')].map(s=>s.id+'/'+s.name+':'+[...s.options].map(o=>o.textContent.trim().slice(0,50)).join(' ; ')),lines:out.slice(0,400)};
      });
    }catch(e){res[c]='ERREUR '+e.message.slice(0,100);}
    await p.close();
  }
  await b.close();fs.writeFileSync(out,JSON.stringify(res,null,1));
})();
