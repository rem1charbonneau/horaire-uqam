// Relevé horaire des places de tous les cours offerts (Hiver 2027).
// Usage : node scan.js <dossier_historique> <catalogue.json> [nb_découvertes]
// Dossier : idx.json {off:[sigles offerts], checked:{sigle:ms}} + h/<SIGLE>.json {t:[ms...], g:{groupe:[places...]}}
const fs=require('fs'),cp=require('child_process'),path=require('path');
const [,,dir,catF,nd,seedF]=process.argv;
const NEW=+nd||120,KEEP=50*36e5,RECHECK=7*864e5;
fs.mkdirSync(path.join(dir,'h'),{recursive:true});
let idx={off:[],checked:{}};try{idx=JSON.parse(fs.readFileSync(path.join(dir,'idx.json'),'utf8'));}catch(e){}
idx.off=idx.off||[];idx.checked=idx.checked||{};
const cat=Object.keys(JSON.parse(fs.readFileSync(catF,'utf8')));
const now=Date.now(),off=new Set(idx.off);
try{const sd=JSON.parse(fs.readFileSync(seedF,'utf8'));for(const [k,v] of Object.entries(sd))if(v&&Array.isArray(v.groups)&&v.groups.length)off.add(k);}catch(e){}
const unknown=cat.filter(s=>!off.has(s)&&!(idx.checked[s]>now-RECHECK)).sort((a,b)=>(idx.checked[a]||0)-(idx.checked[b]||0)).slice(0,NEW);
const list=[...off,...unknown];
console.log('À lire : '+off.size+' offerts + '+unknown.length+' à découvrir');
const tmp=path.join(dir,'.scan.json');try{fs.unlinkSync(tmp);}catch(e){}
const r=cp.spawnSync('node',[path.join(__dirname,'scrape.js'),tmp,'7111',...list],{stdio:'inherit',env:{...process.env,PAR:process.env.PAR||'3',PAUSE:process.env.PAUSE||'800'}});
let d={};try{d=JSON.parse(fs.readFileSync(tmp,'utf8'));}catch(e){console.log('Aucune sortie');process.exit(1);}
fs.unlinkSync(tmp);
let upd=0;
for(const s of list){
  const c=d[s];if(!c||!Array.isArray(c.groups))continue; // lecture échouée : on réessaie plus tard
  idx.checked[s]=now;
  if(!c.groups.length){off.delete(s);continue;}
  off.add(s);
  const f=path.join(dir,'h',s+'.json');let h={t:[],g:{}};try{h=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}
  const t=c.fetched?Date.parse(c.fetched):now,T=isNaN(t)?now:t,n=h.t.length;
  h.t.push(T);
  for(const g of c.groups){const a=h.g[g.id]=h.g[g.id]||new Array(n).fill(null);a.push(typeof g.places==='number'?g.places:null);}
  for(const id of Object.keys(h.g))if(h.g[id].length<h.t.length)h.g[id].push(null);
  while(h.t.length>2&&h.t[0]<now-KEEP){h.t.shift();for(const id of Object.keys(h.g))h.g[id].shift();}
  fs.writeFileSync(f,JSON.stringify(h));upd++;
}
idx.off=[...off].sort();idx.u=new Date().toISOString();
fs.writeFileSync(path.join(dir,'idx.json'),JSON.stringify(idx));
console.log('Historique mis à jour : '+upd+' cours offerts, '+idx.off.length+' au total, '+Object.keys(idx.checked).length+'/'+cat.length+' vérifiés');
