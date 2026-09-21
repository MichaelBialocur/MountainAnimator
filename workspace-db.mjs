let database;
export function openWorkspaceDatabase(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('Le stockage local est indisponible. Utilise un navigateur avec IndexedDB activé.'));return;}
    const r=indexedDB.open('MountainAnimatorMedia',2);let blocked=false;
    r.onupgradeneeded=()=>{for(const name of ['photos','projects'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};
    r.onblocked=()=>{blocked=true;reject(Error('Ferme les autres onglets Mountain Animator de l’ancienne version puis recharge cette page.'));};
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();database=null;};resolve(r.result);};
  }).catch(e=>{database=null;throw e;});return database;
}
export async function storeRequest(name,mode,action){
  const db=await openWorkspaceDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode),r=action(tx.objectStore(name));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Enregistrement interrompu.'));});
}
