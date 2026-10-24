import {trackFingerprint} from './gpx-story.mjs?v=13';
import {sampleSurfaceTriangle} from './surface-decor.mjs?v=15';
import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {DrawingDraft,densifyDrawnRoute,gpxDocument,prepareEditableRoute,mergeEditedRoute} from './gpx-drawing.mjs?v=17';
import {pointInOutline} from './route-motion.mjs?v=7';

export function createRouteEditor({canvas,stage,camera,controls,getBlocks,getSource,getTrack=()=>[],getExaggeration=()=>1,onBegin,onChange,onCommit,onClose,reportError}){
  const doc=canvas.ownerDocument,win=doc.defaultView,$=id=>doc.getElementById(id);
  let active=false,block=null,draft=null,tool='draw',pointer=null,lastScreen=null,interrupted=false,frame=0,preview=null,hover=null,previousControls=null,lastRoute=[],selectedIndex=-1,movingIndex=-1,gesture='',spaceNav=false,editContext=null,dragOrigin=null,dragged=false,editingExisting=false;
  const status=text=>{$('drawStatus').textContent=text;};
  const inside=(x,z)=>pointInOutline(x/(block.data.size/2),z/(block.data.size/2),block.group.userData.side.geometry.userData.outline);
  const local=p=>new THREE.Vector3(((p.lon-block.data.bounds.west)/(block.data.bounds.east-block.data.bounds.west)-.5)*block.data.size,p.ele/1000*getExaggeration()+.04,((block.data.bounds.north-p.lat)/(block.data.bounds.north-block.data.bounds.south)-.5)*block.data.size);
  function releasePreview(){if(preview){block?.group.remove(preview);preview.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});preview=null;}}
  function renderPreview(){
    frame=0;if(!active)return;releasePreview();lastRoute=[];
    $('drawUndo').disabled=!draft.canUndo;$('drawRedo').disabled=!draft.canRedo;
    try{lastRoute=densifyDrawnRoute(draft.points,block.data);}catch(e){status(e.message);$('drawFinish').disabled=true;return;}
    preview=new THREE.Group();preview.name='gpx-drawing-preview';block.group.add(preview);
    const coordinates=[];
    for(let i=1;i<lastRoute.length;i++)if(lastRoute[i].segment===lastRoute[i-1].segment)coordinates.push(...local(lastRoute[i-1]).toArray(),...local(lastRoute[i]).toArray());
    if(coordinates.length){const g=new LineSegmentsGeometry().setPositions(coordinates),m=new LineMaterial({color:0xffcc77,linewidth:3,depthTest:false,depthWrite:false,toneMapped:false});m.resolution.set(stage.clientWidth,stage.clientHeight);const line=new LineSegments2(g,m);line.renderOrder=9000;line.frustumCulled=false;preview.add(line);}
    if(tool==='edit'||tool==='insert'){
      const positions=draft.points.flatMap(p=>local({...p,ele:sampleHeight(p)}).toArray());
      const handles=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0x9bd5ff,size:8,sizeAttenuation:false,depthTest:false,depthWrite:false,toneMapped:false}));handles.renderOrder=9002;handles.frustumCulled=false;preview.add(handles);
      if(selectedIndex>=0&&draft.points[selectedIndex]){const dot=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}));dot.position.copy(local({...draft.points[selectedIndex],ele:sampleHeight(draft.points[selectedIndex])}));dot.renderOrder=9003;preview.add(dot);}
    }
    $('drawDeletePoint').disabled=selectedIndex<0||!draft.points[selectedIndex];
    const ends=lastRoute.length?[lastRoute[0],lastRoute.at(-1)]:[];
    ends.forEach((p,i)=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(.035,10,6),new THREE.MeshBasicMaterial({color:i?0xffcc77:0x8de0ae,depthTest:false}));dot.position.copy(local(p));dot.renderOrder=9001;preview.add(dot);});
    $('drawUndo').disabled=!draft.canUndo;$('drawRedo').disabled=!draft.canRedo;$('drawFinish').disabled=!coordinates.length;
    const length=lastRoute.reduce((n,p,i)=>{if(!i||p.segment!==lastRoute[i-1].segment)return n;const a=lastRoute[i-1];return n+Math.hypot((p.lon-a.lon)*111.32*Math.cos(p.lat*Math.PI/180),(p.lat-a.lat)*110.574);},0);
    status(`${draft.points.length} points de dessin · ${length.toFixed(2)} km · ${tool==='draw'?'clic ou glisser pour tracer':tool==='edit'?`déplacer les points${selectedIndex>=0?' · point '+(selectedIndex+1):''}`:tool==='insert'?'cliquer près du trait pour insérer un point':'caméra libre'}`);
  }
  function refresh(){if(frame)win.cancelAnimationFrame(frame);renderPreview();}
  function queue(){if(!frame)frame=win.requestAnimationFrame(renderPreview);}
  function finishStroke(){if(pointer===null)return;const id=pointer;pointer=null;movingIndex=-1;gesture='';dragOrigin=null;dragged=false;try{canvas.releasePointerCapture?.(id);}catch{}lastScreen=null;draft.endStroke();refresh();onChange();}
  function setTool(value){
    finishStroke();tool=value;controls.enabled=true;selectedIndex=-1;canvas.style.cursor=value==='draw'||value==='insert'?'crosshair':value==='edit'?'grab':'';
    for(const [id,mode] of [['drawToolDraw','draw'],['drawToolCamera','camera'],['drawToolEdit','edit'],['drawToolInsert','insert']])$(id).setAttribute('aria-pressed',String(value===mode));
    if(hover)hover.visible=false;if(active)refresh();
  }
  function sampleHeight(p){const u=(p.lon-block.data.bounds.west)/(block.data.bounds.east-block.data.bounds.west),v=(block.data.bounds.north-p.lat)/(block.data.bounds.north-block.data.bounds.south);return sampleSurfaceTriangle(block.data,u,v).altitude;}
  function screenPoint(p){const v=local({...p,ele:sampleHeight(p)});block.group.localToWorld(v);v.project(camera);const r=canvas.getBoundingClientRect();return {x:r.left+(v.x*.5+.5)*r.width,y:r.top+(1-v.y)*.5*r.height,visible:Math.abs(v.z)<=1};}
  function nearestHandle(event){
    camera.updateMatrixWorld(true);block.group.updateWorldMatrix(true,true);let index=-1,best=16;
    draft.points.forEach((p,i)=>{const q=screenPoint(p),d=Math.hypot(q.x-event.clientX,q.y-event.clientY);if(q.visible&&d<best){index=i;best=d;}});return index;
  }
  function insertAt(event){
    const point=pick(event);if(!point)return;let after=-1,best=18,bestGeo=null;
    for(let i=1;i<draft.points.length;i++){
      const a=draft.points[i-1],b=draft.points[i];if(a.segment!==b.segment)continue;
      const sampled=densifyDrawnRoute([a,b],block.data);
      for(let j=1;j<sampled.length;j++){
        const x=screenPoint(sampled[j-1]),y=screenPoint(sampled[j]);if(!x.visible||!y.visible)continue;
        const dx=y.x-x.x,dy=y.y-x.y,t=Math.max(0,Math.min(1,((event.clientX-x.x)*dx+(event.clientY-x.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(event.clientX-x.x-t*dx,event.clientY-x.y-t*dy);
        if(d<best){best=d;after=i;const a=sampled[j-1],b=sampled[j];bestGeo={lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t};}
      }
    }
    if(after<0){status('Clique plus près du tracé pour insérer un point.');return;}
    if(bestGeo){point.lat=bestGeo.lat;point.lon=bestGeo.lon;point.ele=sampleHeight(point);}
    point.segment=draft.points[after-1].segment;try{draft.insert(after,point);selectedIndex=after;refresh();onChange();}catch(error){status(error.message);}
  }
  function removeSelected(){if(selectedIndex<0)return;finishStroke();draft.remove(selectedIndex);selectedIndex=-1;refresh();onChange();}
  function mountOptions(){
    const select=$('drawMountain'),value=select.value;select.replaceChildren();
    getBlocks().forEach(b=>{const o=doc.createElement('option');o.value=b.peak.id;o.textContent=b.peak.name;select.append(o);});
    if(getBlocks().some(b=>b.peak.id===value))select.value=value;
    $('drawStart').disabled=!getBlocks().length||active;$('drawContinue').disabled=active||!Array.isArray(getSource()?.anchors)||!!getSource()?.editContext;$('drawMountain').disabled=active||!getBlocks().length;$('drawEdit').disabled=active||getTrack().length<2||!getBlocks().length;
    if(active&&!getBlocks().includes(block)){close();reportError('Le relief a changé. Le dessin a été fermé.');}
  }
  function start(saved){
    if(active)return;
    const target=getBlocks().find(b=>b.peak.id===(saved?.blockId||$('drawMountain').value));if(!target){reportError('Charge le sommet à dessiner avant de commencer.');return;}
    let points=Array.isArray(saved?.anchors)?saved.anchors:[];
    if(points.length>10000||points.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)){reportError('Le brouillon de tracé est invalide.');return;}
    if(points.some(p=>p.lon<target.data.bounds.west||p.lon>target.data.bounds.east||p.lat<target.data.bounds.south||p.lat>target.data.bounds.north)){reportError('Ce dessin sort du cadre actuel. Rétablis le cadrage du sommet ou crée un nouveau tracé.');return;}
    previousControls={damping:controls.enableDamping,zoom:controls.enableZoom,pan:controls.enablePan,rotate:controls.enableRotate,zoomToCursor:controls.zoomToCursor,mouseButtons:{...controls.mouseButtons}};onBegin();block=target;draft=new DrawingDraft(points);editContext=saved?.editContext||null;editingExisting=!!(saved?.editingExisting||saved?.editing||editContext);selectedIndex=-1;spaceNav=false;active=true;
    // Flush camera inertia before disabling orbit; the scene stays under the cursor.
    const position=camera.position.clone(),targetPoint=controls.target.clone();controls.autoRotate=false;controls.enableDamping=false;controls.update();camera.position.copy(position);controls.target.copy(targetPoint);controls.update();
    $('drawName').value=String(saved?.name||$('drawName').value||`Parcours — ${block.peak.name}`).slice(0,100);$('drawDraftName').value=$('drawName').value;$('drawToolbar').hidden=false;stage.classList.add('drawing-route');
    $('controlPanel').inert=true;doc.querySelector('.topbar').inert=true;doc.body.classList.remove('panel-open');$('menuButton').setAttribute('aria-expanded','false');
    hover=new THREE.Mesh(new THREE.SphereGeometry(.025,10,6),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.7}));hover.visible=false;hover.renderOrder=9002;block.group.add(hover);
    controls.enableZoom=controls.enablePan=controls.enableRotate=true;controls.zoomToCursor=true;controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.mouseButtons.MIDDLE=THREE.MOUSE.DOLLY;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
    setTool(saved?.editing?'edit':saved?'camera':'draw');mountOptions();refresh();onChange();
  }
  function close(){
    if(!active)return;finishStroke();if(frame)win.cancelAnimationFrame(frame);frame=0;releasePreview();
    if(hover){block.group.remove(hover);hover.geometry.dispose();hover.material.dispose();hover=null;}
    active=false;draft=null;block=null;$('drawToolbar').hidden=true;stage.classList.remove('drawing-route');$('controlPanel').inert=false;doc.querySelector('.topbar').inert=false;canvas.style.cursor='';
    controls.enabled=true;controls.enableDamping=previousControls?.damping??true;controls.enableZoom=previousControls?.zoom??true;controls.enablePan=previousControls?.pan??true;controls.enableRotate=previousControls?.rotate??true;controls.zoomToCursor=previousControls?.zoomToCursor??false;if(previousControls?.mouseButtons)Object.assign(controls.mouseButtons,previousControls.mouseButtons);spaceNav=false;editContext=null;mountOptions();onClose?.();
  }
  function pick(event){
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
    camera.updateMatrixWorld(true);block.group.updateWorldMatrix(true,true);
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),camera);
    const hit=ray.intersectObject(block.group.userData.top,false)[0];if(!hit)return null;
    const p=block.group.worldToLocal(hit.point.clone());if(!inside(p.x,p.z))return null;
    return {lat:block.data.bounds.north-(p.z/block.data.size+.5)*(block.data.bounds.north-block.data.bounds.south),lon:block.data.bounds.west+(p.x/block.data.size+.5)*(block.data.bounds.east-block.data.bounds.west),ele:p.y/getExaggeration()*1000};
  }
  function add(event,drag=false){
    const p=pick(event);if(!p){if(pointer!==null)interrupted=true;if(hover)hover.visible=false;return false;}
    if(hover){hover.position.copy(local(p));hover.visible=true;}
    if(drag&&lastScreen&&Math.hypot(event.clientX-lastScreen.x,event.clientY-lastScreen.y)<5)return true;
    p.segment=(draft.points.at(-1)?.segment||0)+(interrupted?1:0);interrupted=false;
    if(draft.points.length>=10000){status('Limite de 10 000 points de dessin atteinte. Termine ou annule des traits.');return true;}
    if(draft.append(p,drag?8:1)){lastScreen={x:event.clientX,y:event.clientY};queue();}return true;
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!active||tool==='camera'||event.button!==0||pointer!==null||event.isPrimary===false||event.altKey||event.shiftKey||event.ctrlKey||event.metaKey||spaceNav)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(tool==='insert'){insertAt(event);return;}
    if(tool==='edit'){
      selectedIndex=nearestHandle(event);if(selectedIndex<0){refresh();status('Attrape un point bleu pour le déplacer, ou utilise « Insérer ».');return;}
      movingIndex=selectedIndex;gesture='move';dragOrigin={x:event.clientX,y:event.clientY};dragged=false;
    }else gesture='append';
    pointer=event.pointerId;interrupted=false;draft.beginStroke();try{canvas.setPointerCapture?.(pointer);}catch{}
    if(gesture==='append'&&!add(event))status('Clique sur la surface de la montagne sélectionnée.');else if(gesture==='move')refresh();
  },true);
  function moveSelected(event){if(!dragged){if(!dragOrigin||Math.hypot(event.clientX-dragOrigin.x,event.clientY-dragOrigin.y)<4)return;dragged=true;}const p=pick(event);if(!p){status('Le point doit rester sur la montagne.');return;}draft.move(movingIndex,p);queue();}
  canvas.addEventListener('pointermove',event=>{
    if(!active||tool==='camera')return;
    if(pointer!==null&&event.pointerId===pointer){event.preventDefault();event.stopImmediatePropagation();if(gesture==='move')moveSelected(event);else add(event,true);}
    else if(tool==='draw'||tool==='insert'){const p=pick(event);if(hover){hover.visible=!!p;if(p)hover.position.copy(local(p));}}
  },true);
  const up=event=>{if(active&&pointer===event.pointerId){event.preventDefault();event.stopImmediatePropagation();if(event.type==='pointerup'){if(gesture==='move')moveSelected(event);else add(event,true);}finishStroke();}};
  canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);canvas.addEventListener('lostpointercapture',()=>{if(active)finishStroke();});
  canvas.addEventListener('wheel',()=>{if(active)finishStroke();},true);
  doc.addEventListener('keydown',event=>{
    if(!active||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable)return;
    if(event.code==='Space'||event.key===' '){event.preventDefault();finishStroke();spaceNav=true;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;return;}
    if(event.key==='Escape'){event.preventDefault();setTool('camera');return;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelected();return;}
    if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();finishStroke();selectedIndex=-1;if(event.key.toLowerCase()==='y'||event.shiftKey)draft.redo();else draft.undo();refresh();onChange();}
  });
  const releaseSpace=()=>{spaceNav=false;if(active)controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;};
  doc.addEventListener('keyup',event=>{if(event.code==='Space'||event.key===' ')releaseSpace();});win.addEventListener('blur',()=>{if(active)finishStroke();releaseSpace();});
  win.addEventListener('beforeunload',event=>{if(active){event.preventDefault();event.returnValue='';}});
  win.addEventListener('resize',()=>{if(active)queue();});
  $('drawDraftName').addEventListener('input',()=>{if(active)onChange();});
  $('drawStart').addEventListener('click',()=>start());
  $('drawEdit').addEventListener('click',()=>{
    const target=getBlocks().find(b=>b.peak.id===$('drawMountain').value);if(!target)return;
    try{
      const source=getSource();
      if(Array.isArray(source?.anchors)&&source.blockId===target.peak.id&&!source.editContext){start({anchors:source.anchors,name:source.name.replace(/\.gpx$/i,''),blockId:target.peak.id,editing:true});return;}
      const {anchors,ranges}=prepareEditableRoute(getTrack(),target.data,{isInside:p=>{const x=((p.lon-target.data.bounds.west)/(target.data.bounds.east-target.data.bounds.west)-.5)*target.data.size,z=((target.data.bounds.north-p.lat)/(target.data.bounds.north-target.data.bounds.south)-.5)*target.data.size;return pointInOutline(x/(target.data.size/2),z/(target.data.size/2),target.group.userData.side.geometry.userData.outline);}});
      if(anchors.length<2){reportError('Ce GPX ne traverse pas la découpe choisie. Sélectionne la bonne montagne.');return;}
      start({anchors,name:source?.name?.replace(/\.gpx$/i,'')||'Parcours modifié',blockId:target.peak.id,editing:true,editContext:{ranges,trackKey:trackFingerprint(getTrack())}});
    }catch(e){reportError(e.message);}
  });
  $('drawDeletePoint').addEventListener('click',removeSelected);
  $('drawToolEdit').addEventListener('click',()=>setTool('edit'));$('drawToolInsert').addEventListener('click',()=>setTool('insert'));
  $('drawContinue').addEventListener('click',()=>{const source=getSource();if(source?.anchors&&!source.editContext)start({anchors:source.anchors,name:source.name.replace(/\.gpx$/i,''),blockId:source.blockId});});
  $('drawToolDraw').addEventListener('click',()=>setTool('draw'));$('drawToolCamera').addEventListener('click',()=>setTool('camera'));
  for(const action of ['Undo','Redo'])$('draw'+action).addEventListener('click',()=>{finishStroke();draft[action.toLowerCase()]();selectedIndex=-1;refresh();onChange();});
  $('drawTopView').addEventListener('click',()=>{
    setTool('camera');const maxHeight=block.data.heights.reduce((a,h)=>Math.max(a,h),0)/1000*getExaggeration(),center=block.group.position.clone();center.y=maxHeight*.5;
    controls.target.copy(center);const narrow=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect)),distance=block.data.size/.9/(2*Math.tan(narrow/2))+maxHeight;
    camera.position.copy(center).add(new THREE.Vector3(0,distance,.001));camera.far=Math.max(camera.far,distance*3);camera.updateProjectionMatrix();camera.lookAt(center);controls.update();setTool('draw');
  });
  $('drawCancel').addEventListener('click',()=>{close();onChange();});
  $('drawFinish').addEventListener('click',()=>{
    finishStroke();refresh();if($('drawFinish').disabled)return;
    if(lastRoute.some(p=>{const v=local(p);return !inside(v.x,v.z);})){status('Une ligne sort de la découpe. Annule ce trait et longe le relief.');return;}
    try{
    if(editContext?.trackKey&&editContext.trackKey!==trackFingerprint(getTrack()))throw Error('Le GPX a changé depuis ce brouillon. Annule et rouvre sa modification.');
    const context=editContext,points=context?mergeEditedRoute(getTrack(),lastRoute,context.ranges):lastRoute,name=($('drawDraftName').value.trim()||`Parcours — ${block.peak.name}`).slice(0,100),source={name:name+'.gpx',text:gpxDocument(points,name),anchors:draft.points,blockId:block.peak.id,origin:'drawn',...(editingExisting?{editedFrom:trackFingerprint(getTrack())}:{}),...(context?{editContext:context}:{})},id=block.peak.id;
    close();onCommit(points,source,id);
    }catch(error){status(error.message);}
  });
  return {get active(){return active;},start,close,refresh,mountOptions,restore:saved=>{if(saved&&typeof saved==='object'&&Array.isArray(saved.anchors))start(saved);},snapshot:()=>active?{blockId:block.peak.id,name:$('drawDraftName').value,anchors:draft.points,editingExisting,editing:tool==='edit'||tool==='insert',...(editContext?{editContext}:{} )}:null};
}
