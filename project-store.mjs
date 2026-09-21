import {openWorkspaceDatabase,storeRequest} from './workspace-db.mjs?v=12';
export const PROJECT_FORMAT='MountainAnimatorProject',PROJECT_VERSION=1;
const copy=value=>structuredClone(value);
const id=()=>`project-${crypto.randomUUID()}`;
const nameOf=value=>String(value||'Nouveau récit').trim().slice(0,100)||'Nouveau récit';
export function projectMediaIds(snapshot){
  return [...new Set([...(snapshot.narrativePins||[]).map(p=>p.image),...Object.values(snapshot.blockSettings||{}).flatMap(c=>[c.bookCoverImage,...(c.bookPages||[]).map(p=>p.image)])].filter(Boolean))];
}
// Explicit schema/size checks before any imported data is written to the database.
export function validateSnapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Le projet ne contient pas de scène valide.');
  const stack=[value];while(stack.length){const item=stack.pop();if(!item||typeof item!=='object')continue;for(const [key,v] of Object.entries(item)){if(['__proto__','prototype','constructor'].includes(key))throw Error('Clé de projet non autorisée.');if(v&&typeof v==='object')stack.push(v);}}
  const s=copy(value);
  for(const field of ['selected','customPeaks','cameraShots','narrativePins','gpxTrack'])if(s[field]!==undefined&&!Array.isArray(s[field]))throw Error(`Champ de projet invalide : ${field}`);
  if((s.selected?.length||0)>3||(s.customPeaks?.length||0)>100||(s.cameraShots?.length||0)>100||(s.narrativePins?.length||0)>500||(s.gpxTrack?.length||0)>500000)throw Error('Ce projet dépasse les limites de taille.');
  for(const p of s.gpxTrack||[])if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)throw Error('Le projet contient des coordonnées GPX invalides.');
  for(const p of s.customPeaks||[])if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(p.id)||!Number.isFinite(p.lat)||Math.abs(p.lat)>85||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||!Number.isFinite(p.elevation)||p.elevation<0||p.elevation>9000)throw Error('Un sommet du projet est invalide.');
  for(const key of ['globalSettings','blockSettings'])if(s[key]!==undefined&&(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key])))throw Error(`Réglages invalides : ${key}`);
  if(Object.keys(s.blockSettings||{}).length>100)throw Error('Trop de blocs dans ce projet.');
  for(const c of Object.values(s.blockSettings||{}))if(!c||typeof c!=='object'||Array.isArray(c)||(c.bookPages!==undefined&&!Array.isArray(c.bookPages))||(c.bookPages?.length||0)>12)throw Error('Carnet invalide.');
  // Sanitize risky numerical settings to the same bounds as the interface.
  const ranges={exaggeration:[1,2.5],brightness:[.55,2.2],sunAzimuth:[0,360],sunElevation:[5,85],sunIntensity:[0,6],fillLight:[.05,2],cloudDensity:[1,20],cloudDetail:[1,3],cloudOpacity:[.15,1],cloudSize:[.4,2],cloudHeight:[100,8000],cloudSpread:[0,2500],terrainSmoothing:[0,1],gpxFollowDistance:[.6,4]};
  for(const [k,[lo,hi]] of Object.entries(ranges))if(s.globalSettings?.[k]!==undefined){const n=Number(s.globalSettings[k]);if(!Number.isFinite(n))throw Error(`Réglage invalide : ${k}`);s.globalSettings[k]=Math.max(lo,Math.min(hi,n));}
  for(const c of Object.values(s.blockSettings||{}))for(const [k,lo,hi] of [['diameter',6,22],['centerEast',-11,11],['centerNorth',-11,11],['rotation',-180,180],['statsX',-20,20],['statsY',-20,20],['statsZ',-20,20],['snowAltitude',0,6000],['snowCoverage',.15,1]])if(c[k]!==undefined){const n=Number(c[k]);if(!Number.isFinite(n))throw Error(`Réglage invalide : ${k}`);c[k]=Math.max(lo,Math.min(hi,n));}
  for(const media of projectMediaIds(s))if(!/^photo-[a-zA-Z0-9-]{1,80}$/.test(media))throw Error('Référence d’image invalide.');
  return s;
}
export const listProjects=()=>storeRequest('projects','readonly',s=>s.getAll()).then(rows=>rows.sort((a,b)=>b.updatedAt-a.updatedAt));
export const getProject=key=>storeRequest('projects','readonly',s=>s.get(key));
export async function createProject(name,snapshot={},options={}){
  const row={id:options.id||id(),name:nameOf(name),snapshot:validateSnapshot(snapshot),revision:1,createdAt:Date.now(),updatedAt:Date.now(),thumbnail:options.thumbnail||''};
  await storeRequest('projects','readwrite',s=>s.add(row,row.id));return row;
}
export async function updateProject(key,revision,snapshot,meta={}){
  const db=await openWorkspaceDatabase(),safe=validateSnapshot(snapshot);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');let result,error;
    const r=store.get(key);r.onsuccess=()=>{const old=r.result;if(!old||old.revision!==revision){error=Error('Ce projet a été modifié dans un autre onglet. Duplique ta version pour conserver tes changements.');error.code='CONFLICT';tx.abort();return;}
      result={...old,snapshot:safe,revision:old.revision+1,updatedAt:Date.now(),name:meta.name===undefined?old.name:nameOf(meta.name),thumbnail:meta.thumbnail??old.thumbnail};store.put(result,key);
    };tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||tx.error||Error('Sauvegarde interrompue.'));tx.onerror=()=>reject(error||tx.error);
  });
}
export async function duplicateProject(row,name){return createProject(name||row.name+' — copie',row.snapshot,{thumbnail:row.thumbnail});}
const blobToBase64=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);};
export async function exportProjectFile(row){
  const snapshot=validateSnapshot(row.snapshot),media=[];
  for(const key of projectMediaIds(snapshot)){const blob=await storeRequest('photos','readonly',s=>s.get(key));if(!blob)throw Error('Une photo du projet manque. Réimporte-la avant la sauvegarde complète.');media.push({id:key,type:blob.type,data:await blobToBase64(blob)});}
  return new Blob([JSON.stringify({format:PROJECT_FORMAT,version:PROJECT_VERSION,name:row.name,snapshot,media})],{type:'application/json'});
}
export async function importProjectFile(file){
  if(!file||file.size>200*1024*1024)throw Error('Fichier trop volumineux (maximum 200 Mo).');
  let data;try{data=JSON.parse(await file.text());}catch{throw Error('Ce fichier de projet est illisible.');}
  if(data?.format!==PROJECT_FORMAT||data.version!==PROJECT_VERSION)throw Error('Format de projet inconnu ou version non prise en charge.');
  const snapshot=validateSnapshot(data.snapshot),ids=projectMediaIds(snapshot);
  if(!Array.isArray(data.media)||data.media.length>600)throw Error('La liste des images est invalide.');
  const remap=new Map(),blobs=[];
  for(const m of data.media){if(!m||!ids.includes(m.id)||remap.has(m.id)||!['image/jpeg','image/png','image/webp'].includes(m.type)||typeof m.data!=='string'||m.data.length>35*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data))throw Error('Une image du fichier est invalide.');
    let bytes;try{bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0));}catch{throw Error('Image encodée incorrectement.');}
    const jpeg=bytes[0]===255&&bytes[1]===216,png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,webp=String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
    if(!(m.type==='image/jpeg'&&jpeg||m.type==='image/png'&&png||m.type==='image/webp'&&webp))throw Error('Le contenu d’une image ne correspond pas à son format.');
    const key=`photo-${crypto.randomUUID()}`;remap.set(m.id,key);blobs.push([key,new Blob([bytes],{type:m.type})]);
  }
  if(ids.some(key=>!remap.has(key)))throw Error('Le fichier ne contient pas toutes les photos du projet.');
  for(const pin of snapshot.narrativePins||[])if(pin.image)pin.image=remap.get(pin.image);
  for(const c of Object.values(snapshot.blockSettings||{})){if(c.bookCoverImage)c.bookCoverImage=remap.get(c.bookCoverImage);for(const p of c.bookPages||[])if(p.image)p.image=remap.get(p.image);}
  const row={id:id(),name:nameOf(data.name),snapshot,revision:1,createdAt:Date.now(),updatedAt:Date.now(),thumbnail:''};
  const db=await openWorkspaceDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction(['projects','photos'],'readwrite');for(const [key,blob] of blobs)tx.objectStore('photos').add(blob,key);tx.objectStore('projects').add(row,row.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Import annulé.'));});return row;
}
// The session serializes writes and keeps dirty edits when a save fails.
export class ProjectSession{
  current=null;pending=null;error=null;timer=null;saving=false;queue=Promise.resolve();onStatus=()=>{};
  async open(key,legacy){
    let row=key?await getProject(key):null;
    if(key&&!row)throw Error('Ce projet n’existe pas sur cet appareil. Importe son fichier de sauvegarde.');
    if(!row){const rows=await listProjects();row=rows[0];if(!row){try{row=await createProject('Mon premier récit',legacy||{}, {id:'project-migrated-v11'});}catch(e){if(e.name!=='ConstraintError')throw e;row=await getProject('project-migrated-v11');if(!row)throw e;}}}
    this.current=row;return row;
  }
  schedule(snapshot){this.pending=copy(snapshot);this.error=null;this.onStatus('Modifications à enregistrer…');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),350);}
  async flush(){
    clearTimeout(this.timer);
    const run=async()=>{if(!this.pending)return this.current;const snapshot=this.pending;this.pending=null;this.saving=true;
      try{this.current=await updateProject(this.current.id,this.current.revision,snapshot);this.error=null;this.onStatus('Enregistré sur cet appareil');return this.current;}
      catch(e){this.pending??=snapshot;this.error=e;this.onStatus(e.message,true);throw e;}finally{this.saving=false;}};
    const job=this.queue.then(run,run);this.queue=job.catch(()=>{});return job;
  }
}
export const projectSession=new ProjectSession();
