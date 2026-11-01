// Lit la fiche UQAM de chaque cours (onglet Horaire - Hiver 2027, avec le code de programme pour les places).
// Usage : node scrape.js <sortie.json> <code_programme> <SIGLE> [SIGLE...]
// Les cours demandés sont fusionnés dans la sortie existante. Une seule page à la fois, avec pause.
const {chromium}=require('playwright');const fs=require('fs');
const out=process.argv[2],prog=process.argv[3],sigles=process.argv.slice(4);
let data={};try{data=JSON.parse(fs.readFileSync(out,'utf8'));}catch(e){}
const MOIS={'janv':1,'févr':2,'mars':3,'avr':4,'mai':5,'juin':6,'juil':7,'août':8,'sept':9,'oct':10,'nov':11,'déc':12};
const JOURS={Lundi:'Lun',Mardi:'Mar',Mercredi:'Mer',Jeudi:'Jeu',Vendredi:'Ven',Samedi:'Sam',Dimanche:'Dim'};
function hm(s){return s.replace('h',':');}
let errors=0;
(async()=>{
  const b=await chromium.launch();
  for(const sig of sigles){
    const p=await b.newPage();
    try{
      await p.goto('https://etudier.uqam.ca/cours?sigle='+sig,{waitUntil:'networkidle',timeout:45000});
      const info=await p.evaluate(()=>{
        const t=document.title.replace(/^Cours\s+\S+\s*\|\s*/,'').replace(/\s*\|\s*UQAM$/,'');
        const body=document.body.innerText;
        const cr=(body.match(/Nombre de crédits\s*:\s*(\d+)/)||[])[1]||null;
        let pre='';const m=body.match(/Préalables académiques\s*\n+([\s\S]{0,700}?)(?=\n\s*(?:Programmes associés|Corequis|Co-?requis|Concomitant|Description|Objectif|Cible|Modalité)|\nEN SAVOIR PLUS|$)/i);
        if(m)pre=('Préalables académiques '+m[1]).replace(/\s+/g,' ').trim();
        const rep=(body.match(/[A-Z]{3}\d{4}\s+remplace\s+[A-Z]{3}\d{4}(?:\s*,\s*[A-Z]{3}\d{4})*/)||[])[0]||'';
        const tab=[...document.querySelectorAll('a')].find(a=>/Horaire\s*-\s*Hiver 2027/.test(a.textContent)&&a.getAttribute('href')&&a.getAttribute('href').startsWith('#'));
        return {title:t,credits:cr,pre:pre,replaces:rep,tab:tab?tab.getAttribute('href'):null};
      });
      const rec={title:info.title,credits:info.credits?+info.credits:null,prereq:info.pre,prereqSigles:[...new Set((info.pre.match(/[A-Z]{3}\d{4}/g)||[]))].filter(x=>x!==sig),replaces:info.replaces,groups:[],fetched:new Date().toISOString()};
      if(info.tab){
        await p.click('a[href="'+info.tab+'"]').catch(()=>{});
        const hasForm=await p.$(info.tab+' input[name=pc_code_prog]');
        if(hasForm){await p.fill(info.tab+' input[name=pc_code_prog]',prog);await p.click(info.tab+' input[type=submit]');await p.waitForTimeout(4500);}
        const groups=await p.evaluate((tab)=>{
          const root=document.querySelector(tab);if(!root)return [];
          return [...root.querySelectorAll('.groupe')].map(g=>{
            const id=((g.querySelector('.no_groupe')||{}).textContent||'').trim().replace(/^Groupe\s*/,'');
            const pl=((g.querySelector('.places')||{}).textContent||'').replace(/\s+/g,' ').trim();
            const teacher=[...g.querySelectorAll('ul li')].map(l=>l.textContent.trim()).filter(x=>x)[0]||'';
            const av=((g.querySelector('.avertissement')||{}).textContent||'').replace(/\s+/g,' ').trim();
            const rows=[...g.querySelectorAll('table:not(.alignement) tr')].slice(1).map(r=>[...r.querySelectorAll('td')].map(td=>td.textContent.replace(/ /g,' ').replace(/\s+/g,' ').trim()));
            const lis=[...g.querySelectorAll('.ligne')].filter(l=>/Remarque/.test(l.textContent)).flatMap(l=>[...l.querySelectorAll('li')].map(x=>x.textContent.trim()));
            return {id,pl,teacher,av,rows,rem:lis,textAll:g.innerText.replace(/\s+/g,' ').slice(0,60)};
          });
        },info.tab);
        for(const g of groups){
          let places=null;
          if(/Aucune place/i.test(g.pl))places=0;else{const m=g.pl.match(/(\d+)\s+place/);if(m)places=+m[1];}
          const avl=g.av.toLowerCase();
          let mode=/distance/.test(avl)?'dist':/hybride|comodal|bimodal/.test(avl)?'hyb':/présentiel/.test(avl)?'pres':'pres';
          const remU=g.rem.join(' | ').toUpperCase();
          const slots=[];
          for(const r of g.rows){
            if(r.length<5)continue;
            const [jour,dates,heure,lieu,type]=r;
            const m=heure.match(/(\d{1,2})h(\d{2})\s*à\s*(\d{1,2})h(\d{2})/);
            if(!m||!JOURS[jour])continue;
            const ex=/exercice|travaux|laboratoire/i.test(type);
            let sm=mode;
            if(ex){if(/EXERCICES?\s+(À|A)\s+DISTANCE/.test(remU))sm='dist';else if(/EXERCICES?\s+EN\s+PR(É|E)SEN/.test(remU))sm='pres';}
            const campus=lieu.replace(/^UQAM\s*/,'').replace(/^Campus\s+(de\s+)?/,'').replace(/\(Terrebonne\)/,'').trim();
            const dm=dates.match(/(\d+)\s+(\S+)\s+(\d{4})\s*au\s*(\d+)\s+(\S+)\s+(\d{4})/);
            slots.push({d:JOURS[jour],s:m[1].padStart(2,'0')+':'+m[2],e:m[3].padStart(2,'0')+':'+m[4],t:ex?'Exercices':'Cours',m:sm,l:campus||null,dates:dates});
          }
          const exams=[];
          for(const r of g.rem){
            const mm=r.match(/Examens?\s*:/i);if(!mm)continue;
            const re=/(\d{1,2})\s+([a-zéûè]+)\.?\s+(\d{1,2}):(\d{2})\s*à\s*(\d{1,2}):(\d{2})/gi;let x;
            while((x=re.exec(r))){const mo=MOIS[x[2].toLowerCase().replace('.','')];if(!mo)continue;
              exams.push({date:'2027-'+String(mo).padStart(2,'0')+'-'+x[1].padStart(2,'0'),s:x[3].padStart(2,'0')+':'+x[4],e:x[5].padStart(2,'0')+':'+x[6]});}
          }
          const notes=g.rem.filter(x=>!/^Examens?\s*:/i.test(x));
          const isEn=/anglais|english/i.test(g.rem.join(' '));
          if(!slots.length&&!notes.length)continue;
          rec.groups.push({id:g.id,teacher:/Non disponible/i.test(g.teacher)?'':g.teacher,mode:mode,places:places,slots:slots,exams:exams,notes:notes,en:isEn});
        }
      }
      data[sig]=rec;
      console.log(sig,rec.title,'| gr:',rec.groups.length,'| préalables:',rec.prereqSigles.join(',')||'-');
    }catch(e){errors++;console.log(sig,'ERREUR',e.message.slice(0,120));}
    await p.close();
    await new Promise(r=>setTimeout(r,1500));
  }
  await b.close();
  fs.writeFileSync(out,JSON.stringify(data));
  if(errors>sigles.length/2){console.log('Trop d\'erreurs, abandon');process.exit(1);}
})();
