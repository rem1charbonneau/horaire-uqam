// Historique des places : ajoute l'état courant de data.json à history.json (changements seulement, 72 h).
const fs=require('fs');
const [,,dataF,histF]=process.argv;
const d=JSON.parse(fs.readFileSync(dataF,'utf8'));
let h={};try{h=JSON.parse(fs.readFileSync(histF,'utf8'));}catch(e){}
h.v=1;h.c=h.c&&typeof h.c==='object'?h.c:{};
const now=Date.now(),cut=now-72*36e5,asked=now-14*864e5;
for(const [code,c] of Object.entries(d)){
  if(!c||!Array.isArray(c.groups)||!c.fetched||!(c.asked>asked))continue;
  const t=Date.parse(c.fetched);if(isNaN(t))continue;
  const p={};c.groups.forEach(g=>{if(typeof g.places==='number')p[g.id]=g.places;});
  const arr=h.c[code]=Array.isArray(h.c[code])?h.c[code]:[];
  const last=arr[arr.length-1];
  if(!last)arr.push({t,l:t,p});
  else if(t>(last.l||last.t)){
    if(JSON.stringify(last.p)===JSON.stringify(p))last.l=t;else arr.push({t,l:t,p});
  }
  while(arr.length>1&&arr[1].t<cut)arr.shift();
}
Object.keys(h.c).forEach(k=>{if(!d[k]||!(d[k].asked>asked))delete h.c[k];});
h.u=new Date().toISOString();
fs.writeFileSync(histF,JSON.stringify(h));
console.log('Historique : '+Object.keys(h.c).length+' cours, '+Object.values(h.c).reduce((s,a)=>s+a.length,0)+' entrées');
