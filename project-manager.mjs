import {projectSession,listProjects,createProject,duplicateProject,updateProject,exportProjectFile,importProjectFile} from './project-store.mjs?v=12';
const $=id=>document.getElementById(id);
let busy=false;
const status=(message,error=false)=>{ $('projectStatus').textContent=message;$('projectStatus').classList.toggle('save-error',error);};
projectSession.onStatus=status;
function remember(row){sessionStorage.setItem('mountainProjectTab',row.id);localStorage.setItem('mountainProjectLast',row.id);$('activeProjectName').textContent=row.name;}
function requestedId(){return new URL(location.href).searchParams.get('project')||sessionStorage.getItem('mountainProjectTab')||localStorage.getItem('mountainProjectLast');}
async function saveCurrent(){
  const bridge=window.mountainWorkspace;if(bridge?.busy())throw Error('Termine le chargement ou le rendu en cours avant de changer de projet.');
  if(bridge)projectSession.schedule(bridge.snapshot());
  return await projectSession.flush();
}
async function navigate(row){remember(row);const url=new URL(location.href);url.searchParams.set('project',row.id);location.assign(url.href);}
async function perform(action){if(busy)return;busy=true;$('projectActions').inert=true;try{await action();}catch(e){status(e.message,true);}finally{busy=false;$('projectActions').inert=false;}}
async function renderList(){
  const rows=await listProjects(),list=$('projectList');list.replaceChildren();
  for(const row of rows){const item=document.createElement('li'),title=document.createElement('strong'),date=document.createElement('small'),actions=document.createElement('div');
    title.textContent=row.name;date.textContent=`${new Date(row.updatedAt).toLocaleString('fr-CH')} · ${row.snapshot.gpxTrack?.length||0} points GPX`;
    const thumb=document.createElement('div');thumb.className='project-thumb';thumb.textContent='▲';
    if(/^data:image\/(png|jpeg);base64,/.test(row.thumbnail)){const img=document.createElement('img');img.src=row.thumbnail;img.alt='Aperçu du projet';thumb.replaceChildren(img);}
    item.append(thumb,title,date,actions);if(row.id===projectSession.current?.id)item.classList.add('active');
    const open=document.createElement('button');open.className='secondary';open.textContent=row.id===projectSession.current?.id?'Projet actuel':'Ouvrir';open.disabled=row.id===projectSession.current?.id;open.onclick=()=>perform(async()=>{await saveCurrent();await navigate(row);});
    const tab=document.createElement('a'),url=new URL(location.href);url.searchParams.set('project',row.id);tab.href=url.href;tab.target='_blank';tab.rel='noopener';tab.textContent='Nouvel onglet';tab.className='secondary';actions.append(open,tab);list.append(item);
  }
}
export async function startProjectManager(){
  let legacy;try{legacy=JSON.parse(localStorage.getItem('mountainAnimatorProjectV3')||'null');}catch{}
  let key=requestedId();
  // A deleted/cleared last selection must not prevent reopening the library.
  if(key&&!new URL(location.href).searchParams.has('project')){try{const {getProject}=await import('./project-store.mjs?v=12');if(!await getProject(key))key=null;}catch(e){throw e;}}
  const row=await projectSession.open(key,legacy);remember(row);$('projectName').value=row.name;status('Projet chargé · sauvegarde automatique');await renderList();
  $('projectNew').onclick=()=>perform(async()=>{await saveCurrent();await navigate(await createProject($('projectName').value||'Nouveau récit',{}));});
  $('projectDuplicate').onclick=()=>perform(async()=>{
    // A conflict can be rescued as an independent copy without overwriting the other tab.
    const bridge=window.mountainWorkspace;if(bridge?.busy())throw Error('Attends la fin de l’opération en cours.');
    const snapshot=bridge?bridge.snapshot():projectSession.pending||projectSession.current.snapshot;
    const clone=await duplicateProject({...projectSession.current,snapshot},$('projectName').value||projectSession.current.name+' — copie');
    projectSession.pending=null;projectSession.error=null;clearTimeout(projectSession.timer);await projectSession.queue;await navigate(clone);
  });
  $('projectRename').onclick=()=>perform(async()=>{await saveCurrent();const current=projectSession.current;projectSession.current=await updateProject(current.id,current.revision,current.snapshot,{name:$('projectName').value,thumbnail:window.mountainWorkspace?.thumbnail()});remember(projectSession.current);await renderList();status('Projet renommé');});
  $('projectSave').onclick=()=>perform(async()=>{await saveCurrent();const current=projectSession.current,thumbnail=window.mountainWorkspace?.thumbnail();if(thumbnail)projectSession.current=await updateProject(current.id,current.revision,current.snapshot,{thumbnail});await renderList();status('Enregistré sur cet appareil');});
  $('projectRefresh').onclick=()=>perform(renderList);
  $('projectExport').onclick=()=>perform(async()=>{const bridge=window.mountainWorkspace;if(bridge?.busy())throw Error('Attends la fin de l’opération en cours.');let current;try{current=await saveCurrent();}catch(e){if(e.code!=='CONFLICT')throw e;current={...projectSession.current,snapshot:bridge?bridge.snapshot():projectSession.pending};}
    status('Préparation du fichier avec les GPX et les images…');const blob=await exportProjectFile(current),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(current.name.replace(/[^\p{L}\p{N}_-]+/gu,'-')||'recit')+'.mountainproject';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Fichier de projet téléchargé avec ses médias');});
  $('projectImport').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;perform(async()=>{await saveCurrent();status('Vérification et import du projet…');const row=await importProjectFile(file);await navigate(row);});};
  $('projectPersist').onclick=()=>perform(async()=>{const granted=await navigator.storage?.persist?.();status(granted?'Stockage persistant accordé. Conserve aussi un fichier de sauvegarde.':'Protection non accordée par le navigateur. Télécharge régulièrement tes projets.');});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')projectSession.flush().catch(()=>{});});
  window.addEventListener('beforeunload',event=>{if(projectSession.pending||projectSession.saving||projectSession.error){event.preventDefault();event.returnValue='';}});
  return row;
}
