import {storeRequest} from './workspace-db.mjs?v=13';
// Photos remain on this device. Store blobs outside the small localStorage quota.
const loaded=new Map(),pending=new Map();
const transaction=(mode,action)=>storeRequest('photos',mode,action);
async function decode(blob){
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Image illisible. Utilise un fichier JPEG, PNG ou WebP.'));image.src=url;});return image;}
  finally{URL.revokeObjectURL(url);}
}
export const mediaImage=id=>loaded.get(id)||null;
export async function loadMedia(id){
  if(!id)return null;if(loaded.has(id))return loaded.get(id);if(pending.has(id))return pending.get(id);
  const promise=(async()=>{const blob=await transaction('readonly',store=>store.get(id));if(!blob)throw Error('Une photo sauvegardée manque sur cet appareil. Réimporte-la.');const image=await decode(blob);loaded.set(id,image);return image;})();
  pending.set(id,promise);try{return await promise;}finally{pending.delete(id);}
}
export async function importMedia(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Choisis une photo JPEG, PNG ou WebP.');
  if(file.size>25*1024*1024)throw Error('La photo dépasse 25 Mo. Réduis sa taille avant de l’importer.');
  const source=await decode(file),scale=Math.min(1,1600/Math.max(source.naturalWidth,source.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#eee7da';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw Error('Impossible de préparer cette photo.');
  const id=`photo-${crypto.randomUUID()}`;
  await transaction('readwrite',store=>store.put(blob,id));loaded.set(id,await decode(blob));return id;
}
export async function prepareMedia(ids){await Promise.all([...new Set(ids.filter(Boolean))].map(loadMedia));}
export const validMediaId=value=>typeof value==='string'&&/^photo-[a-zA-Z0-9-]{1,80}$/.test(value)?value:'';
