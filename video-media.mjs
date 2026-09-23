import {storeRequest} from './workspace-db.mjs?v=13';
const loaded=new Map(),pending=new Map();
export const validVideoId=value=>typeof value==='string'&&/^video-[a-zA-Z0-9-]{1,80}$/.test(value)?value:'';
export const mediaVideo=id=>loaded.get(id)?.video||null;
function mediaEvent(video,type,action,timeout=20000){return new Promise((resolve,reject)=>{
 const done=()=>{cleanup();resolve();},error=()=>{cleanup();reject(Error('Vidéo illisible : utilise un MP4 H.264 ou WebM compatible avec ce navigateur.'));},expired=()=>{cleanup();reject(Error('Le décodage de la vidéo a expiré. Essaie un extrait plus léger.'));};
 const timer=setTimeout(expired,timeout),cleanup=()=>{clearTimeout(timer);video.removeEventListener(type,done);video.removeEventListener('error',error);};
 video.addEventListener(type,done,{once:true});video.addEventListener('error',error,{once:true});try{action?.();}catch(e){cleanup();reject(e);}
});}
async function decode(blob){
 const url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
 try{await mediaEvent(video,'loadeddata',()=>{video.src=url;video.load();});if(!Number.isFinite(video.duration)||video.duration<=.1||!video.videoWidth)throw Error('La durée ou les dimensions de cette vidéo sont invalides.');return {video,url};}
 catch(e){video.removeAttribute('src');video.load();URL.revokeObjectURL(url);throw e;}
}
export async function loadVideo(id){
 if(!validVideoId(id))throw Error('Référence vidéo invalide.');if(loaded.has(id))return loaded.get(id).video;if(pending.has(id))return pending.get(id);
 const task=(async()=>{const blob=await storeRequest('photos','readonly',s=>s.get(id));if(!blob)throw Error('Une vidéo du projet manque. Réimporte-la avant de continuer.');const item=await decode(blob);loaded.set(id,item);return item.video;})();pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
export async function importVideo(file){
 if(!file||!['video/mp4','video/webm'].includes(file.type))throw Error('Choisis une vidéo MP4 ou WebM.');if(file.size>100*1024*1024)throw Error('Limite de 100 Mo par vidéo. Importe un extrait plus court.');
 const item=await decode(file),id=`video-${crypto.randomUUID()}`;
 try{await storeRequest('photos','readwrite',s=>s.put(file,id));loaded.set(id,item);return {id,duration:item.video.duration,name:file.name||'Vidéo'};}
 catch(e){item.video.removeAttribute('src');item.video.load();URL.revokeObjectURL(item.url);throw e;}
}
export async function prepareVideos(ids){for(const id of new Set(ids.filter(Boolean)))await loadVideo(id);}
// Paused seeks, never fastSeek(): the renderer waits for the requested source
// frame before encoding. Preview and export share this exact path.
export async function seekVideo(id,time){
 const video=await loadVideo(id);video.pause();const target=Math.max(0,Math.min(video.duration-.001,time));
 if(Math.abs(video.currentTime-target)>.00001||video.seeking)await mediaEvent(video,'seeked',()=>{video.currentTime=target;});
 if(video.readyState<2)await mediaEvent(video,'loadeddata');return video;
}
export function releaseVideos(){for(const {video,url} of loaded.values()){video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}loaded.clear();}
