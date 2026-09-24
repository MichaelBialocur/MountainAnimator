import {SURFACE_DEFAULTS,cleanSurfaceSettings,analyzeSurfacePixels,planSurfaceDecor} from './surface-decor.mjs?v=15';
import {DECOR_DEFAULTS,DECOR_PRESETS,cleanDecorSettings,planDecor,createSceneDecor} from './scene-decor.mjs?v=15';
import {cleanPinVideo,videoStopPlan,samplePinVideo,videoScreenRect,drawVideoFrame} from './story-video.mjs?v=13';
import {importVideo,mediaVideo,seekVideo,prepareVideos,releaseVideos} from './video-media.mjs?v=13';
import {projectSession} from './project-store.mjs?v=13';
import { createTravelBook, cleanBookPages, sampleBookReading, sampleBookNarration, bookNarrationDuration, PAGE_TURN_SECONDS, BOOK_OPEN_SECONDS, BOOK_CLOSE_SECONDS } from './travel-book.mjs?v=13';
import { mediaImage, importMedia, prepareMedia, validMediaId } from './narrative-media.mjs?v=13';
import { trackFingerprint, nearestRoutePoint, stopDuration, nextStoryPin, sanitizeStoryPins } from './gpx-story.mjs?v=13';
import { decodeTerrarium, sampleNumericTiles, cleanTerrain } from './terrain-data.mjs?v=7';
import { compileCameraSequence, sampleCameraSequence } from './camera-sequence.mjs?v=13';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { cloudVolume, addSnow, cloudTypeFor } from './atmosphere.mjs?v=7';
import { VideoExport, supportedVideoTypes, videoDimensions } from './video-export.mjs?v=7';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, smootherstep, dampingAlpha, distanceKm, measureRoute, sampleRoute, smoothRoutePoint, clipToBounds, pointInOutline, interpolateGeo, routeMetrics } from './route-motion.mjs?v=7';
import { paintGround, paintTravelNotebook, paintLiveGpxCard, paintStoryLabel, paintBookSpread, paintStoryPhoto, paintBookCover, GROUND_KINDS } from './studio-art.mjs?v=14';

const PEAKS = [
  { id:'chavalard', name:'Grand Chavalard', elevation:2899, lat:46.17869, lon:7.11312, region:'Fully' },
  { id:'lagginhorn', name:'Lagginhorn', elevation:4010, lat:46.15706, lon:8.00310, region:'Saas-Grund' },
  { id:'jegihorn', name:'Jegihorn', elevation:3206, lat:46.20550, lon:7.95640, region:'Saas-Grund' },
  { id:'barrhorn', name:'Barrhorn', elevation:3610, lat:46.18030, lon:7.73580, region:'Turtmanntal' },
  { id:'bigerhorn', name:'Bigerhorn', elevation:3626, lat:46.19240, lon:7.76270, region:'Turtmanntal' },
  { id:'mettelhorn', name:'Mettelhorn', elevation:3406, lat:46.05510, lon:7.71680, region:'Zermatt' },
  { id:'rinderhorn', name:'Rinderhorn', elevation:3448, lat:46.44200, lon:7.65360, region:'Kandersteg' }
];

const QUALITY = {
  balanced: { label:'ÉQUILIBRÉE', grid:96, elevationZoom:12, elevationCanvas:384, textureSize:768, tileZoom:13, dpr:1.45, shadow:1024 },
  high: { label:'HAUTE', grid:176, elevationZoom:13, elevationCanvas:576, textureSize:1536, tileZoom:14, dpr:1.8, shadow:2048 },
  ultra: { label:'ULTRA', grid:256, elevationZoom:14, elevationCanvas:896, textureSize:2048, tileZoom:14, dpr:2.2, shadow:4096 }
};

const MAX_PEAKS = 3;
const TILE_SIZE = 256;
const BASE_Y = -0.42;
const TILE_CACHE = new Map();
const $ = selector => document.querySelector(selector);

const globalSettings = {
  ...DECOR_DEFAULTS,
  showGpxStats:true, storyEnabled:true, gpxFollowDistance:1.6, terrainSmoothing:.35, quality:'high', exaggeration:1, brightness:1.25,
  sunAzimuth:315, sunElevation:38, sunIntensity:3.2,
  clouds:true, cloudDensity:8, cloudDetail:2, cloudOpacity:.7, cloudSize:1,
  cloudType:'cumulus', cloudHeight:2600, cloudSpread:900, cloudCumulonimbus:20, cloudCumulus:60, cloudStratus:25, cloudCirrus:15, fillLight:.55, shadows:true, groundTexture:'marble', cloudSeed:1
};
const blockSettings = new Map();
let peaks = [...PEAKS];
let selected = ['chavalard','lagginhorn'];
let editorPeakId = selected[0];
let blocks = [];
let gpxTrack = [];
let gpxSource=null,restoredView=null,restoredPlayback=null;
let buildVersion = 0;
let rebuildTimer;
let statsTimer;
let sideMaterial;
let floor;
let groundDecor;
let surfaceTimer;
const pendingSurface=new Set();
let cloudTime = 0;
const videoExport=new VideoExport();
let exportCanvas, exportContext, exportSettings, exportUrl;

let cameraShots=[];
let storyVideoDraft={},previewVideoTask=null;
let storyImageDraft='',storyDraftVersion=0,mediaBusy=0;
let narrativePins=[],storyTrackKey='',storyEditingId=null,storyPicking=false;
const story={visited:[],active:null};
const cinema={playing:false,paused:false,time:0,timeline:null};
const gpxPlayer = { paused:false, playing:false, progress:0, duration:25, follow:true, routeBlock:null, phase:'idle', transition:null, offset:null, lastPart:null };

restoreProject();

const canvas = $('#sceneCanvas');
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x142631, .0035);
const camera = new THREE.PerspectiveCamera(37, 1, .08, 280);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .055;
controls.minDistance = .7;
controls.maxDistance = 130;
controls.maxPolarAngle = Math.PI * .49;
controls.autoRotateSpeed = .48;

const ambient = new THREE.HemisphereLight(0xd9f1f7, 0x1b2933, 2.05);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffefd6, globalSettings.sunIntensity);
sun.castShadow = true;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
sun.shadow.bias = -.00004;
sun.shadow.normalBias = .0025;
scene.add(sun,sun.target);
const rim = new THREE.DirectionalLight(0x8ed9f5, 1.35);
rim.position.set(28, 12, -22);
scene.add(rim);

setupEnvironment();
applyQuality();
applyLighting();
renderPeakList();
syncBlockEditor();
bindControls();
resize();
rebuildScene();

const clock = new THREE.Clock();
window.mountainWorkspace={snapshot:projectSnapshot,busy:()=>Boolean(exportSettings||mediaBusy||!$('#loadingPanel').hidden),thumbnail:projectThumbnail};
controls.addEventListener('end',()=>{if(!cinema.playing&&!gpxPlayer.playing&&!exportSettings)saveProject();});
requestAnimationFrame(animate);

function defaultBlockSettings(){
  return { ...SURFACE_DEFAULTS, bookOpenAtStart:false, bookCloseAtEnd:false, bookCoverTitle:'', bookCoverSubtitle:'', bookCoverColor:'#334e43', bookCoverImage:'', bookPages:[], bookIndex:0, bookHold:7, gpxWidth:4, notebookLayout:1, snowCoverage:.68, snowEnabled:false, snowAltitude:2800, statsX:0, statsY:0, statsZ:0, diameter:12, centerEast:0, centerNorth:0, rotation:0, gpxColor:'#e76f32', comment:'', showStats:true, manualDistance:'', manualGain:'', manualDuration:'', manualDate:'', manualNotes:'' };
}

function settingsFor(id){
  if(!blockSettings.has(id)) blockSettings.set(id, defaultBlockSettings());
  return blockSettings.get(id);
}

function activePeaks(){
  return selected.map(id => peaks.find(peak => peak.id === id)).filter(Boolean);
}

function setupEnvironment(){
  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 140),
    new THREE.MeshPhysicalMaterial({ color:0xffffff, roughness:.32, metalness:0, clearcoat:.75, clearcoatRoughness:.23 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BASE_Y - .035;
  floor.receiveShadow = true;
  scene.add(floor);
  applyGroundTexture();
  sideMaterial = new THREE.MeshStandardMaterial({ map:makeStoneTexture(), color:0x8e8577, roughness:.98, metalness:0, side:THREE.DoubleSide });
}

function applyGroundTexture(){
  const kind=globalSettings.groundTexture;
  const c=document.createElement('canvas');const natural=['meadow','earth','gravel'].includes(kind);c.width=natural?768:1536;c.height=natural?768:1024;
  const texture=new THREE.CanvasTexture(paintGround(c,kind));texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  // Natural materials are periodic; studio slabs keep their continuous pattern.
  if(natural){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(14,9.8);}
  floor.material.map?.dispose();floor.material.map=texture;
  floor.material.bumpMap=natural?texture:null;floor.material.bumpScale=natural?.025:0;
  const polished=kind==='marble'||kind==='dark-marble';
  floor.material.roughness=polished?.3:kind==='wood'?.72:.96;
  floor.material.clearcoat=polished?.8:0;floor.material.needsUpdate=true;
}

function refreshGroundDecor(){
  if(groundDecor){scene.remove(groundDecor);groundDecor.userData.dispose();groundDecor=null;}
  const mountains=blocks.map(b=>({x:b.group.position.x,z:b.group.position.z,radius:b.data.size/2}));
  const books=blocks.filter(b=>b.config.showStats).map(b=>{
    const w=Math.min(5.8,Math.max(4.6,b.data.size*.42)),h=w*2/3;
    const x=b.group.position.x+b.config.statsX,z=b.data.size*.5+2.5+b.config.statsZ;
    const halfX=(w/2+.18)*Math.cos(.07)+(h/2+.8)*Math.sin(.07),halfZ=(h/2+.8)*Math.cos(.07)+(w/2+.18)*Math.sin(.07);
    return {minX:x-halfX,maxX:x+halfX,minZ:z-halfZ,maxZ:z+halfZ};
  });
  const items=planDecor(globalSettings,mountains,books);
  if(items.length){groundDecor=createSceneDecor(items,{floorY:floor.position.y,shadows:globalSettings.shadows});scene.add(groundDecor);}
  const status=$('#decorStatus');if(status)status.textContent=globalSettings.decorEnabled?`${items.length} éléments · disposition conservée dans le projet`:'Décor désactivé';
  fitTerrainShadows();
}
function syncDecorControls(){
  for(const key of ['decorEnabled','decorPebbles','decorRocks','decorGrass','decorTrees'])$('#'+key).checked=globalSettings[key];
  for(const key of ['decorDensity','decorScale','decorSpread']){
    $('#'+key).value=globalSettings[key];$('#'+key+'Value').value=key==='decorDensity'?`${globalSettings[key]} %`:key==='decorScale'?`${globalSettings[key].toFixed(1)}×`:`${globalSettings[key]} km`;
  }
  $('#groundTexture').value=globalSettings.groundTexture;
}
function bindDecorControls(){
  syncDecorControls();
  for(const key of ['decorEnabled','decorPebbles','decorRocks','decorGrass','decorTrees'])$('#'+key).addEventListener('change',e=>{globalSettings[key]=e.target.checked;refreshGroundDecor();saveProject();});
  for(const key of ['decorDensity','decorScale','decorSpread'])bindRange(key,key+'Value',v=>key==='decorDensity'?`${v} %`:key==='decorScale'?`${v.toFixed(1)}×`:`${v} km`,v=>{globalSettings[key]=v;refreshGroundDecor();});
  $('#decorPreset').addEventListener('change',e=>{
    const preset=DECOR_PRESETS[e.target.value];if(!preset)return;Object.assign(globalSettings,preset);syncDecorControls();applyGroundTexture();refreshGroundDecor();saveProject();e.target.value='';
  });
  $('#randomizeDecor').addEventListener('click',()=>{globalSettings.decorSeed=globalSettings.decorSeed%2147483647+1;refreshGroundDecor();saveProject();});
}

function removeSurfaceDecor(block){
  const root=block.group.userData.surfaceDecor;if(root){block.group.remove(root);root.userData.dispose();block.group.userData.surfaceDecor=null;}
}
function refreshSurfaceDecor(block){
  removeSurfaceDecor(block);block.group.userData.surfaceError='';
  if(!block.config.surfaceEnabled)return;
  try{
    if(!block.data.surfaceMask){
      const image=document.createElement('canvas');image.width=image.height=512;
      const ctx=image.getContext('2d',{willReadFrequently:true});ctx.drawImage(block.data.textureCanvas,0,0,512,512);
      block.data.surfaceImage=ctx.getImageData(0,0,512,512);block.data.surfaceMask=analyzeSurfacePixels(block.data.surfaceImage);
    }
    const items=planSurfaceDecor(block.data,block.data.surfaceMask,organicOutline(hash(block.peak.id)),block.config,{seed:hash(block.peak.id),exaggeration:globalSettings.exaggeration,quality:globalSettings.quality});
    if(items.length){const root=createSceneDecor(items,{shadows:globalSettings.shadows,surface:true});root.name='mountain-surface-decor';block.group.add(root);block.group.userData.surfaceDecor=root;}
  }catch(error){block.group.userData.surfaceError='Analyse satellite indisponible pour ce sommet. Réessaie après avoir rechargé le relief.';console.warn('Surface decor:',error);}
}
function surfaceOutput(key,value){return key==='surfaceSensitivity'?`${Math.round(value*100)} %`:key.endsWith('Density')?`${value} %`:`${value} m`;}
function syncSurfaceControls(){
  const c=settingsFor(editorPeakId);
  for(const key of ['surfaceEnabled','surfaceTrees','surfaceRocks'])$('#'+key).checked=c[key];
  for(const key of ['surfaceTreeDensity','surfaceRockDensity','surfaceTreeHeight','surfaceRockSize','surfaceTreeAltitude','surfaceSensitivity']){
    $('#'+key).value=c[key];$('#'+key+'Value').value=surfaceOutput(key,c[key]);
  }
  const b=blocks.find(b=>b.peak.id===editorPeakId),items=b?.group.userData.surfaceDecor?.userData.items||[];
  $('#surfaceStatus').textContent=!c.surfaceEnabled?'Décor du relief désactivé':b?.group.userData.surfaceError||(b?`${items.filter(p=>p.type==='tree').length} sapins · ${items.filter(p=>p.type==='rock').length} pierres${items.length?'':' · aucune zone compatible avec ces réglages'}`:'En attente du relief…');
  const preview=$('#surfacePreview');preview.hidden=!c.surfaceEnabled||!b?.data.surfaceMask;
  if(!preview.hidden){
    const source=b.data.surfaceImage,mask=b.data.surfaceMask,ctx=preview.getContext('2d');preview.width=mask.width;preview.height=mask.height;
    const image=ctx.createImageData(mask.width,mask.height);image.data.set(source.data);
    for(let i=0;i<mask.forest.length;i++){
      const color=c.surfaceTrees&&mask.forest[i]>=1-c.surfaceSensitivity?[46,182,90]:c.surfaceRocks&&mask.rock[i]>=.52?[220,150,75]:null;
      if(color)for(let ch=0;ch<3;ch++)image.data[i*4+ch]=image.data[i*4+ch]*.45+color[ch]*.55;
    }
    ctx.putImageData(image,0,0);
  }
}
function flushSurfaceDecor(){
  clearTimeout(surfaceTimer);if(!pendingSurface.size)return;
  blocks.filter(b=>pendingSurface.has(b.peak.id)).forEach(refreshSurfaceDecor);pendingSurface.clear();syncSurfaceControls();fitTerrainShadows();
}
function scheduleSurfaceDecor(id){
  for(const b of blocks)if(!id||b.peak.id===id)pendingSurface.add(b.peak.id);
  clearTimeout(surfaceTimer);surfaceTimer=setTimeout(flushSurfaceDecor,160);
}
function bindSurfaceControls(){
  for(const key of ['surfaceEnabled','surfaceTrees','surfaceRocks'])$('#'+key).addEventListener('change',event=>{
    settingsFor(editorPeakId)[key]=event.target.checked;const b=blocks.find(b=>b.peak.id===editorPeakId);if(b)refreshSurfaceDecor(b);syncSurfaceControls();fitTerrainShadows();saveProject();
  });
  for(const key of ['surfaceTreeDensity','surfaceRockDensity','surfaceTreeHeight','surfaceRockSize','surfaceTreeAltitude','surfaceSensitivity'])$('#'+key).addEventListener('input',event=>{
    const c=settingsFor(editorPeakId);c[key]=+event.target.value;$('#'+key+'Value').value=surfaceOutput(key,c[key]);scheduleSurfaceDecor(editorPeakId);saveProject();
  });
  $('#randomizeSurface').addEventListener('click',()=>{const c=settingsFor(editorPeakId);c.surfaceSeed=c.surfaceSeed%2147483647+1;const b=blocks.find(b=>b.peak.id===editorPeakId);if(b)refreshSurfaceDecor(b);syncSurfaceControls();saveProject();});
}

function makeStoneTexture(){
  const c=document.createElement('canvas'); c.width=c.height=768;
  const ctx=c.getContext('2d'), image=ctx.createImageData(768,768), rng=seededRandom(4937);
  for(let y=0;y<768;y++) for(let x=0;x<768;x++){
    const i=(y*768+x)*4, strata=11*Math.sin(y*.11)+6*Math.sin(y*.029+x*.005), fracture=3*Math.sin(x*.045+y*.013), noise=(rng()-.5)*24, value=98+strata+fracture+noise;
    image.data[i]=value*1.02; image.data[i+1]=value*.95; image.data[i+2]=value*.84; image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace; texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(2.8,1.4); return texture;
}

function seededRandom(seed){
  return () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
}

function hash(text){
  return [...text].reduce((n,c)=>((n<<5)-n+c.charCodeAt(0))|0,0)>>>0;
}

function renderPeakList(){
  $('#selectedCount').textContent=`${selected.length} / ${MAX_PEAKS}`;
  $('#peakList').innerHTML=peaks.map(peak=>`
    <label class="peak-row ${selected.includes(peak.id)?'selected':''}">
      <input type="checkbox" data-peak="${peak.id}" ${selected.includes(peak.id)?'checked':''}>
      <span class="peak-name"><b>${escapeHtml(peak.name)}</b><small>${escapeHtml(peak.region||'Coordonnées personnalisées')}</small></span>
      <span class="peak-height">${peak.elevation.toLocaleString('fr-CH')} m</span>
      ${PEAKS.some(item=>item.id===peak.id)?'':`<button class="delete-peak" data-delete="${peak.id}" aria-label="Supprimer">×</button>`}
    </label>`).join('');

  document.querySelectorAll('[data-peak]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked && selected.length>=MAX_PEAKS){input.checked=false;showError(`La composition accepte jusqu’à ${MAX_PEAKS} montagnes côte à côte.`);return}
    selected=input.checked?[...selected,input.dataset.peak]:selected.filter(id=>id!==input.dataset.peak);
    if(!selected.includes(editorPeakId)) editorPeakId=selected[0]||'';
    renderPeakList(); syncBlockEditor(); saveProject(); rebuildScene();
  }));

  document.querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault(); event.stopPropagation();
    peaks=peaks.filter(peak=>peak.id!==button.dataset.delete);
    selected=selected.filter(id=>id!==button.dataset.delete);
    blockSettings.delete(button.dataset.delete);
    if(editorPeakId===button.dataset.delete) editorPeakId=selected[0]||'';
    renderPeakList(); syncBlockEditor(); saveProject(); rebuildScene();
  }));
}

function syncBlockEditor(){
  $('#gpxLiveStats').checked=globalSettings.showGpxStats;
  const list=activePeaks(), section=$('#blockEditorSection'), select=$('#blockPeakSelect');
  section.hidden=!list.length;
  if(!list.length) return;
  if(!list.some(peak=>peak.id===editorPeakId)) editorPeakId=list[0].id;
  select.innerHTML=list.map(peak=>`<option value="${peak.id}" ${peak.id===editorPeakId?'selected':''}>${escapeHtml(peak.name)}</option>`).join('');
  const config=settingsFor(editorPeakId);
  syncSurfaceControls();
  $('#blockDiameter').value=config.diameter; $('#blockDiameterValue').value=`${config.diameter} km`;
  $('#blockRotation').value=config.rotation;$('#blockRotationValue').value=`${config.rotation}°`;
  $('#gpxColor').value=config.gpxColor;$('#gpxWidth').value=config.gpxWidth;$('#gpxWidthValue').value=`${config.gpxWidth} px`;
  for(const key of ['snowAltitude','snowCoverage','statsX','statsY','statsZ']){$('#'+key).value=config[key];$('#'+key+'Value').value=key==='snowCoverage'?`${Math.round(config[key]*100)} %`:config[key]+(key==='snowAltitude'?' m':' km');}
  $('#snowEnabled').checked=config.snowEnabled;
  syncOffsetLimits(config);
  $('#blockComment').value=config.comment; $('#blockStatsToggle').checked=config.showStats;
  $('#distance').value=config.manualDistance; $('#gain').value=config.manualGain; $('#duration').value=config.manualDuration; $('#date').value=config.manualDate; $('#notes').value=config.manualNotes;
}

async function rebuildScene(){
  if(videoExport.active)return;
  const version=++buildVersion;
  clearTimeout(rebuildTimer);clearTimeout(statsTimer);
  stopCinema();stopGpxAnimation();
  clearBlocks();
  const list=activePeaks();
  updateComparison(list);
  if(!list.length){hideLoading();showError('Sélectionne au moins un sommet pour créer une découpe.');return}
  hideError(); showLoading('Construction haute définition',`0 / ${list.length} découpe chargée`);
  const results=[];
  for(let i=0;i<list.length;i++){
    if(version!==buildVersion) return;
    const quality=QUALITY[globalSettings.quality], config=settingsFor(list[i].id);
    $('#loadingDetail').textContent=`${i} / ${list.length} · ${quality.grid} × ${quality.grid} points · texture ${quality.textureSize}px`;
    try{
      const data=await loadPeakData(list[i],{...config},quality,version);
      if(version!==buildVersion) return;
      const block=createBlock(data,list[i],config);
      blocks.push(block); results.push(true);
      $('#loadingDetail').textContent=`${i+1} / ${list.length} découpe${list.length>1?'s':''} haute définition chargée${list.length>1?'s':''}`;
    }catch(error){
      if(error.message==='cancelled') return;
      console.error(error); results.push(false); showError(`${list[i].name} : ${humanError(error)}`);
    }
  }
  if(version!==buildVersion) return;
  positionBlocks();
  buildGpxRoutes();
  createPeakLabels();
  fitCamera();
  if(restoredView){const v=restoredView;restoredView=null;if(v.position?.length===3&&v.target?.length===3&&[...v.position,...v.target].every(Number.isFinite)){camera.position.fromArray(v.position);controls.target.fromArray(v.target);camera.lookAt(controls.target);controls.update(0);}}
  syncSurfaceControls();hideLoading();
  if(results.some(Boolean)&&results.some(value=>!value)) showError('Certaines découpes n’ont pas chargé. Vérifie la connexion puis modifie légèrement un réglage pour réessayer.');
}

function clearBlocks(){
  clearTimeout(surfaceTimer);pendingSurface.clear();
  if(groundDecor){scene.remove(groundDecor);groundDecor.userData.dispose();groundDecor=null;}
  cancelStoryPick();stopCinema();
  blocks.forEach(block=>{
    removeSurfaceDecor(block);
    scene.remove(block.group);block.group.userData.route?.geometry?.dispose();
    const disposedMaterials=new Set(),disposedTextures=new Set(),disposedGeometries=new Set();
    block.group.traverse(object=>{
      if(object.geometry && !disposedGeometries.has(object.geometry)){object.geometry.dispose();disposedGeometries.add(object.geometry);}
      object.customDepthMaterial?.dispose();
      if(object.material && object.material!==sideMaterial){
        (Array.isArray(object.material)?object.material:[object.material]).forEach(material=>{
          if(material.map && !disposedTextures.has(material.map)){material.map.dispose();disposedTextures.add(material.map);}
          if(!disposedMaterials.has(material)){material.dispose?.();disposedMaterials.add(material);}
        });
      }
    });
  });
  blocks=[]; $('#peakLabels').innerHTML=''; gpxPlayer.routeBlock=null;
  $('#gpxPlayButton').disabled=true;$('#gpxProgress').disabled=true;$('#gpxTarget').disabled=true;$('#gpxOverviewButton').disabled=true;
}

async function loadPeakData(peak,config,quality,version){
  const bounds=boundsAround(peak,config),zoom=config.diameter>17?Math.min(13,quality.elevationZoom):quality.elevationZoom;
  const [rawHeights,imageryCanvas]=await Promise.all([loadNumericElevation(bounds,zoom,quality.grid),loadImagery(bounds,quality)]);
  if(version!==buildVersion)throw Error('cancelled');
  const filtered=cleanTerrain(rawHeights,quality.grid,config.diameter*1000/quality.grid,globalSettings.terrainSmoothing);
  return {bounds,rawHeights,heights:filtered.heights,repaired:filtered.repaired,grid:quality.grid,size:config.diameter,textureCanvas:applyOrganicMask(imageryCanvas,hash(peak.id))};
}

async function loadNumericElevation(bounds,zoom,grid){
  const nw=lonLatToWorldPixel(bounds.west,bounds.north,zoom),se=lonLatToWorldPixel(bounds.east,bounds.south,zoom),tiles=new Map(),jobs=[];
  // Decode native pixels first, including the one-pixel interpolation halo.
  for(let y=Math.floor((nw.y-1)/256);y<=Math.floor((se.y+1)/256);y++)for(let x=Math.floor((nw.x-1)/256);x<=Math.floor((se.x+1)/256);x++){
    jobs.push((async()=>{
      const img=await loadImageWithFallback([`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${zoom}/${x}/${y}.png`,`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`]);
      if(img.width!==256||img.height!==256)throw Error('Taille de tuile altimétrique inattendue.');
      const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      tiles.set(`${x},${y}`,decodeTerrarium(ctx.getImageData(0,0,256,256).data));
    })());
  }
  await Promise.all(jobs);const heights=new Float32Array((grid+1)**2);
  for(let row=0;row<=grid;row++)for(let col=0;col<=grid;col++)heights[row*(grid+1)+col]=sampleNumericTiles(tiles,256,nw.x+(se.x-nw.x)*col/grid-.5,nw.y+(se.y-nw.y)*row/grid-.5);
  return heights;
}

function boundsAround(peak,config){
  const centerLat=peak.lat+config.centerNorth/110.574;
  const centerLon=peak.lon+config.centerEast/(111.320*Math.cos(peak.lat*Math.PI/180));
  const half=config.diameter/2, dLat=half/110.574, dLon=half/(111.320*Math.cos(centerLat*Math.PI/180));
  return {west:centerLon-dLon,east:centerLon+dLon,north:centerLat+dLat,south:centerLat-dLat};
}

function lonLatToWorldPixel(lon,lat,zoom){
  const scale=2**zoom*TILE_SIZE, sin=Math.sin(Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180);
  return {x:(lon+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
}

function mercator(lon,lat){
  const radius=6378137, phi=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;
  return {x:radius*lon*Math.PI/180,y:radius*Math.log(Math.tan(Math.PI/4+phi/2))};
}

async function loadImagery(bounds,quality){
  const sw=mercator(bounds.west,bounds.south), ne=mercator(bounds.east,bounds.north);
  const params=new URLSearchParams({bbox:`${sw.x},${sw.y},${ne.x},${ne.y}`,bboxSR:'3857',imageSR:'3857',size:`${quality.textureSize},${quality.textureSize}`,format:'jpg',transparent:'false',f:'image'});
  const urls=[
    `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params}`,
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params}`
  ];
  try{
    const image=await loadImageWithFallback(urls), canvas=document.createElement('canvas');
    canvas.width=canvas.height=quality.textureSize; canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); return canvas;
  }catch(error){
    console.warn('Export satellite indisponible, assemblage des tuiles.',error);
    return composeTiles(bounds,quality.tileZoom,quality.textureSize,(z,x,y)=>[
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    ],true);
  }
}

async function composeTiles(bounds,zoom,size,urlFactory,smoothing){
  const nw=lonLatToWorldPixel(bounds.west,bounds.north,zoom), se=lonLatToWorldPixel(bounds.east,bounds.south,zoom);
  const minX=Math.floor(nw.x/TILE_SIZE), maxX=Math.floor((se.x-1)/TILE_SIZE), minY=Math.floor(nw.y/TILE_SIZE), maxY=Math.floor((se.y-1)/TILE_SIZE);
  const jobs=[];
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) jobs.push({x,y,promise:loadImageWithFallback(urlFactory(zoom,x,y))});
  const loaded=await Promise.all(jobs.map(async job=>({...job,img:await job.promise})));
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=smoothing; if(smoothing)ctx.imageSmoothingQuality='high';
  const sx=size/(se.x-nw.x), sy=size/(se.y-nw.y);
  loaded.forEach(({x,y,img})=>ctx.drawImage(img,(x*TILE_SIZE-nw.x)*sx,(y*TILE_SIZE-nw.y)*sy,TILE_SIZE*sx,TILE_SIZE*sy));
  return canvas;
}

function loadImageWithFallback(urls){
  const key=urls.join('|'); if(TILE_CACHE.has(key)) return TILE_CACHE.get(key);
  const promise=(async()=>{let lastError;for(const url of urls){try{return await loadImage(url)}catch(error){lastError=error}}throw lastError||Error('image unavailable')})();
  TILE_CACHE.set(key,promise); promise.catch(()=>TILE_CACHE.delete(key));
  if(TILE_CACHE.size>700) TILE_CACHE.delete(TILE_CACHE.keys().next().value);
  return promise;
}

function loadImage(url){
  return new Promise((resolve,reject)=>{
    const image=new Image(), timer=setTimeout(()=>{image.src='';reject(Error(`délai dépassé (${new URL(url).hostname})`))},30000);
    image.crossOrigin='anonymous'; image.decoding='async';
    image.onload=()=>{clearTimeout(timer);resolve(image)};
    image.onerror=()=>{clearTimeout(timer);reject(Error(`source inaccessible (${new URL(url).hostname})`))};
    image.src=url;
  });
}

function organicOutline(seed,segments=160){
  const rng=seededRandom(seed), phase1=rng()*Math.PI*2, phase2=rng()*Math.PI*2, points=[];
  for(let i=0;i<segments;i++){
    const angle=i/segments*Math.PI*2, radius=.965+.018*Math.sin(angle*3+phase1)+.012*Math.sin(angle*7+phase2);
    points.push({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius});
  }
  return points;
}

function applyOrganicMask(source,seed){
  const canvas=document.createElement('canvas'); canvas.width=source.width; canvas.height=source.height;
  const ctx=canvas.getContext('2d'); ctx.drawImage(source,0,0);
  const outline=organicOutline(seed);
  ctx.globalCompositeOperation='destination-in'; ctx.beginPath();
  outline.forEach((point,index)=>{const x=(point.x*.5+.5)*canvas.width,y=(point.z*.5+.5)*canvas.height;index?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.closePath(); ctx.fill(); return canvas;
}

function createBlock(data,peak,config){
  const group=new THREE.Group(); group.name=peak.name;
  group.rotation.y=THREE.MathUtils.degToRad(config.rotation);
  const geometry=createTopGeometry(data), texture=new THREE.CanvasTexture(data.textureCanvas);
  texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=renderer.capabilities.getMaxAnisotropy(); texture.minFilter=THREE.LinearMipmapLinearFilter; texture.magFilter=THREE.LinearFilter;
  const material=new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.87,metalness:0,alphaTest:.45});
  addSnow(material,config,globalSettings.exaggeration);
  const top=new THREE.Mesh(geometry,material); top.castShadow=top.receiveShadow=globalSettings.shadows;
  top.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:texture,alphaTest:.45});
  group.add(top);
  const outline=organicOutline(hash(peak.id)), side=createSides(data,outline); side.castShadow=side.receiveShadow=globalSettings.shadows; group.add(side);
  const bottom=createBottom(outline,data.size); bottom.receiveShadow=true; group.add(bottom);
  const summitLocal=localPointForGeo(peak,data,peak.elevation);
  const summitMarker=createSummitMarker(summitLocal); group.add(summitMarker);
  const clouds=createClouds(peak,data.size); group.add(clouds);
  group.userData={peak,config,data,top,side,bottom,summitMarker,summitLocal,clouds,label:null,route:null,routeStats:null,statsCard:null,statsLeader:null};
  scene.add(group);const block={group,peak,config,data};refreshSurfaceDecor(block);return block;
}

function createTopGeometry(data){
  const {grid,heights,size}=data, positions=[],uvs=[],indices=[];
  for(let row=0;row<=grid;row++) for(let col=0;col<=grid;col++){
    const u=col/grid,v=row/grid; positions.push((u-.5)*size,heights[row*(grid+1)+col]/1000*globalSettings.exaggeration,(v-.5)*size); uvs.push(u,1-v);
  }
  for(let row=0;row<grid;row++) for(let col=0;col<grid;col++){
    const a=row*(grid+1)+col,b=a+1,c=a+grid+1,d=c+1; indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function sampleGrid(data,u,v){
  const {grid,heights}=data, x=Math.max(0,Math.min(grid,u*grid)), y=Math.max(0,Math.min(grid,v*grid));
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(grid,x0+1),y1=Math.min(grid,y0+1),tx=x-x0,ty=y-y0;
  const h00=heights[y0*(grid+1)+x0],h10=heights[y0*(grid+1)+x1],h01=heights[y1*(grid+1)+x0],h11=heights[y1*(grid+1)+x1];
  return (h00*(1-tx)+h10*tx)*(1-ty)+(h01*(1-tx)+h11*tx)*ty;
}

function createSides(data,outline){
  const positions=[],uvs=[],indices=[],count=outline.length;
  outline.forEach((point,index)=>{
    const x=point.x*data.size/2,z=point.z*data.size/2,u=point.x*.5+.5,v=point.z*.5+.5,top=sampleGrid(data,u,v)/1000*globalSettings.exaggeration,s=index/count*5;
    positions.push(x,BASE_Y,z,x,top,z); uvs.push(s,0,s,1);
  });
  for(let i=0;i<count;i++){const next=(i+1)%count,a=i*2,b=a+1,c=next*2,d=c+1;indices.push(a,c,b,b,c,d)}
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.userData.outline=outline;
  return new THREE.Mesh(geometry,sideMaterial);
}

function createBottom(outline,size){
  const shape=new THREE.Shape(); outline.forEach((point,index)=>index?shape.lineTo(point.x*size/2,-point.z*size/2):shape.moveTo(point.x*size/2,-point.z*size/2)); shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:0x46453e,roughness:1,side:THREE.DoubleSide})); mesh.rotation.x=-Math.PI/2; mesh.position.y=BASE_Y; return mesh;
}

function localPointForGeo(point,data,explicitElevation){
  const u=(point.lon-data.bounds.west)/(data.bounds.east-data.bounds.west), v=(data.bounds.north-point.lat)/(data.bounds.north-data.bounds.south);
  const elevation=Number.isFinite(explicitElevation)?explicitElevation:sampleGrid(data,u,v);
  return new THREE.Vector3((u-.5)*data.size,elevation/1000*globalSettings.exaggeration,(v-.5)*data.size);
}

function createSummitMarker(position){
  const group=new THREE.Group(); group.position.copy(position); group.position.y+=.025;
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.065,20,14),new THREE.MeshBasicMaterial({color:0xffd18a}));
  const halo=new THREE.Mesh(new THREE.RingGeometry(.09,.12,32),new THREE.MeshBasicMaterial({color:0x9ee6f6,transparent:true,opacity:.8,side:THREE.DoubleSide})); halo.rotation.x=-Math.PI/2;
  group.add(dot,halo); return group;
}

function createClouds(peak,size){
  const seed=hash(peak.id)+globalSettings.cloudSeed*997,root=new THREE.Group(),rng=seededRandom(seed);
  root.name='clouds';
  if(globalSettings.cloudType==='mixed'&&globalSettings.cloudCumulus+globalSettings.cloudStratus+globalSettings.cloudCirrus+globalSettings.cloudCumulonimbus===0)return root;
  for(let i=0;i<globalSettings.cloudDensity;i++){
    const cluster=new THREE.Group(),angle=rng()*Math.PI*2,radius=size*(.22+rng()*.35);
    const kind=cloudTypeFor(i,globalSettings.cloudDensity,globalSettings.cloudType,{cumulus:globalSettings.cloudCumulus,stratus:globalSettings.cloudStratus,cirrus:globalSettings.cloudCirrus,cumulonimbus:globalSettings.cloudCumulonimbus});
    const layer=kind==='cumulonimbus'?700:kind==='cirrus'?1400:kind==='stratus'?-350:0;
    const altitude=Math.max(100,globalSettings.cloudHeight+layer+(rng()-.5)*globalSettings.cloudSpread);
    cluster.position.set(Math.cos(angle)*radius,altitude/1000*globalSettings.exaggeration,Math.sin(angle)*radius);
    const volume=cloudVolume(kind,globalSettings.cloudDetail,seed+i*617,globalSettings.cloudSize*(.8+rng()*.8));
    cluster.add(volume);volume.material.uniforms.opacity.value=globalSettings.cloudOpacity;
    cluster.userData={startX:cluster.position.x,startZ:cluster.position.z,phase:rng()*6.28,speed:.055+rng()*.085,volume,kind,altitude,baseY:cluster.position.y};root.add(cluster);
  }
  root.visible=globalSettings.clouds;return root;
}

function refreshClouds(){
  blocks.forEach(block=>{
    const old=block.group.userData.clouds;block.group.remove(old);
    old.traverse(obj=>{obj.geometry?.dispose();obj.material?.dispose();});
    const clouds=createClouds(block.peak,block.data.size);block.group.add(clouds);block.group.userData.clouds=clouds;
  });
  clearCloudTerrain();fitTerrainShadows();
}

function clearCloudTerrain(){
  // Bound the complete cloud volume and its entire drift, across rotated neighbours.
  scene.updateMatrixWorld(true);
  const vertex=new THREE.Vector3(),center=new THREE.Vector3();
  blocks.forEach(owner=>owner.group.userData.clouds.children.forEach(cluster=>{
    const volume=cluster.userData.volume;
    center.set(cluster.userData.startX,0,cluster.userData.startZ);owner.group.localToWorld(center);
    const radius=Math.hypot(volume.scale.x,volume.scale.z)/2+.35;
    let height=BASE_Y;
    blocks.forEach(block=>{
      const positions=block.group.userData.top.geometry.attributes.position;
      const margin=block.data.size/block.data.grid*1.5;
      for(let i=0;i<positions.count;i++){
        vertex.fromBufferAttribute(positions,i);block.group.localToWorld(vertex);
        if(Math.hypot(vertex.x-center.x,vertex.z-center.z)<=radius+margin)height=Math.max(height,vertex.y);
      }
    });
    cluster.userData.baseY=cluster.userData.altitude/1000*globalSettings.exaggeration;
    cluster.position.y=Math.max(cluster.userData.baseY,height+volume.scale.y/2+.12);
    const direction=sun.position.clone().normalize();direction.applyAxisAngle(new THREE.Vector3(0,1,0),-owner.group.rotation.y);
    volume.material.uniforms.lightDir.value.copy(direction);
  }));
}

function positionBlocks(){
  const gap=1.15, total=blocks.reduce((sum,block)=>sum+block.data.size,0)+gap*Math.max(0,blocks.length-1);
  let cursor=-total/2;
  blocks.forEach(block=>{block.group.position.x=cursor+block.data.size/2;cursor+=block.data.size+gap});
  clearCloudTerrain();fitTerrainShadows();syncCinemaEditor();blocks.forEach(positionNotebook);refreshGroundDecor();
}

function createPeakLabels(){
  $('#peakLabels').innerHTML='';
  blocks.forEach(block=>{
    const label=document.createElement('div'); label.className='peak-label'; label.innerHTML=`<span class="label-card"><b>${escapeHtml(block.peak.name)}</b><span>${block.peak.elevation.toLocaleString('fr-CH')} m</span></span>`;
    $('#peakLabels').appendChild(label); block.group.userData.label=label;
  });
}

function updatePeakLabels(){
  if(updatePeakLabels.next>cloudTime)return;updatePeakLabels.next=cloudTime+.12;
  const width=stage.clientWidth,height=stage.clientHeight;
  blocks.forEach(block=>{
    const label=block.group.userData.label;if(!label)return;
    const vector=block.group.userData.summitLocal.clone(); vector.y+=.34; block.group.localToWorld(vector);
    const ray=new THREE.Raycaster(camera.position,vector.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(vector)-.03);
    scene.updateMatrixWorld(true);
    const hidden=ray.intersectObjects(blocks.flatMap(b=>[b.group.userData.top,b.group.userData.side]),false).some(hit=>{
      const owner=blocks.find(b=>b.group.userData.top===hit.object);if(!owner)return true;
      const local=owner.group.worldToLocal(hit.point.clone());return pointInOutline(local.x/(owner.data.size/2),local.z/(owner.data.size/2),organicOutline(hash(owner.peak.id)));
    });
    vector.project(camera);
    label.style.left=`${(vector.x*.5+.5)*width}px`; label.style.top=`${(-vector.y*.5+.5)*height}px`; label.style.display=hidden||Math.abs(vector.z)>1?'none':'';
  });
}

function makeStatsCanvas(block){
  const canvas=document.createElement('canvas'); canvas.width=1536; canvas.height=1024;
  const stats=block.group.userData.routeStats,config=block.config;
  const distance=config.manualDistance!==''?`${config.manualDistance} km`:stats?`${stats.distance.toFixed(1)} km`:'—';
  const gain=config.manualGain!==''?`+${config.manualGain} m`:stats?.hasElevation?`+${Math.round(stats.gain).toLocaleString('fr-CH')} m`:'—';
  const duration=config.manualDuration||(stats?.duration?formatDuration(stats.duration):'—');
  return paintTravelNotebook(canvas,{altitude:`${block.peak.elevation.toLocaleString('fr-CH')} m`,distance,gain,duration,comment:(config.comment||config.manualNotes||'').trim(),date:config.manualDate});
}

function disposeObject(root){
  root.traverse(o=>o.userData.dispose?.());
  const materials=new Set(),textures=new Set();root.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});
  materials.forEach(m=>{if(m.map)textures.add(m.map);m.dispose();});textures.forEach(t=>t.dispose());
}
function positionNotebook(block){
  const book=block.group.userData.statsCard;if(!book)return;
  block.group.updateWorldMatrix(true,false);
  book.position.copy(block.group.worldToLocal(new THREE.Vector3(block.group.position.x+block.config.statsX,BASE_Y-.035+.015,block.data.size*.5+2.5+block.config.statsZ)));
  book.rotation.y=-block.group.rotation.y-.07;
}
function refreshStatsBillboards(){
  blocks.forEach(block=>{
    const data=block.group.userData;
    if(data.statsCard){block.group.remove(data.statsCard);disposeObject(data.statsCard);data.statsCard=null;}
    if(data.statsLeader){block.group.remove(data.statsLeader);disposeObject(data.statsLeader);data.statsLeader=null;}
    if(!block.config.showStats)return;
    const w=Math.min(5.8,Math.max(4.6,block.data.size*.42));
    const book=createTravelBook({document,width:w,height:w*2/3,spreadCount:1+block.config.bookPages.length,paintSpread:index=>makeBookSpread(block,index),coverColor:block.config.bookCoverColor,paintCover:()=>makeCoverCanvas(block),anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
    book.userData.setState(block.config.bookIndex||0);book.userData.setOpenness(block.config.bookOpenAtStart?0:1);
    block.group.add(book);data.statsCard=book;positionNotebook(block);
  });
  refreshGroundDecor();
}

function updateComparison(list=activePeaks()){
  if(!list.length){$('#comparisonBar').innerHTML='';return}
  const elevations=list.map(peak=>peak.elevation),delta=Math.max(...elevations)-Math.min(...elevations);
  $('#comparisonBar').innerHTML=list.map(peak=>`<span class="comparison-peak"><b>${escapeHtml(peak.name)}</b><span>${peak.elevation.toLocaleString('fr-CH')} m</span></span>`).join('')+(list.length>1?`<span class="comparison-delta">écart maximal <strong>${delta.toLocaleString('fr-CH')} m</strong></span>`:'');
}

function compositionWidth(){return blocks.reduce((sum,block)=>sum+block.data.size,0)+Math.max(0,blocks.length-1)*1.15}

function fitCamera(){
  const width=Math.max(8,compositionWidth()), maxSize=Math.max(8,...blocks.map(block=>block.data.size)), aspect=Math.max(.42,stage.clientWidth/stage.clientHeight);
  const vertical=maxSize*.72+6, vfov=THREE.MathUtils.degToRad(camera.fov), hfov=2*Math.atan(Math.tan(vfov/2)*aspect), distance=Math.max(vertical/(2*Math.tan(vfov/2)),width/(2*Math.tan(hfov/2)))*1.26;
  controls.maxDistance=Math.max(130,distance*1.5);camera.far=Math.max(280,distance*2.5);camera.updateProjectionMatrix();
  controls.enabled=true;controls.target.set(0,1.45,0);camera.position.set(width*.12,Math.max(7,distance*.38),distance);camera.lookAt(controls.target);controls.update();
}

function updateVerticalScale(){
  stopCinema();stopGpxAnimation();
  blocks.forEach(block=>{
    const {data}=block,position=block.group.userData.top.geometry.attributes.position;
    for(let i=0;i<data.heights.length;i++) position.setY(i,data.heights[i]/1000*globalSettings.exaggeration);
    position.needsUpdate=true;block.group.userData.top.geometry.computeVertexNormals();
    block.group.userData.top.material.userData.snow.snowScale.value=globalSettings.exaggeration;
    const sidePosition=block.group.userData.side.geometry.attributes.position,outline=block.group.userData.side.geometry.userData.outline;
    outline.forEach((point,index)=>sidePosition.setY(index*2+1,sampleGrid(data,point.x*.5+.5,point.z*.5+.5)/1000*globalSettings.exaggeration));
    sidePosition.needsUpdate=true;block.group.userData.side.geometry.computeVertexNormals();
    const summit=localPointForGeo(block.peak,data,block.peak.elevation);block.group.userData.summitLocal.copy(summit);block.group.userData.summitMarker.position.copy(summit).add(new THREE.Vector3(0,.025,0));
  });
  blocks.forEach(refreshSurfaceDecor);syncSurfaceControls();clearCloudTerrain();fitTerrainShadows();buildGpxRoutes();
}

function parseGpx(text){
  const documentXml=new DOMParser().parseFromString(text,'application/xml');
  if(documentXml.querySelector('parsererror')||documentXml.documentElement.localName!=='gpx')throw Error('Le fichier GPX est invalide.');
  const nodes=[...documentXml.getElementsByTagName('*')];
  const tracks=nodes.filter(node=>node.localName==='trkseg');
  const containers=tracks.length?tracks:nodes.filter(node=>node.localName==='rte');
  const points=[];let segment=0;
  for(const container of containers){
    segment++;
    for(const node of [...container.children]){
      if(!['trkpt','rtept'].includes(node.localName))continue;
      const child=name=>[...node.children].find(item=>item.localName===name)?.textContent;
      const point={lat:parseFloat(node.getAttribute('lat')),lon:parseFloat(node.getAttribute('lon')),ele:parseFloat(child('ele')),time:Date.parse(child('time')||''),segment};
      if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180){segment++;continue;}
      points.push(point);
    }
  }
  if(points.length<2)throw Error('Aucune trace exploitable dans ce GPX.');
  if(points.length>150000)throw Error('Ce GPX dépasse 150 000 points. Simplifie-le avant de l’importer.');
  return points;
}

function trackStats(points){
  let distance=0,gain=0,duration=0,hasElevation=false;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(a.segment!==b.segment)continue;
    distance+=distanceKm(a,b);
    if(Number.isFinite(a.ele)&&Number.isFinite(b.ele)){gain+=Math.max(0,b.ele-a.ele);hasElevation=true;}
    if(Number.isFinite(a.time)&&Number.isFinite(b.time))duration+=Math.max(0,(b.time-a.time)/1000);
  }
  return{distance,gain,duration,hasElevation};
}

function routeEdgesForBlock(block){
  const edges=[],outline=organicOutline(hash(block.peak.id));let part=0;
  const inside=point=>pointInOutline(point.x/(block.data.size/2),point.z/(block.data.size/2),outline);
  const spacing=Math.max(.015,block.data.size/block.data.grid*.45);
  for(let i=1;i<gpxTrack.length;i++){
    const a=gpxTrack[i-1],b=gpxTrack[i];
    if(a.segment!==b.segment){part++;continue;}
    const interval=clipToBounds(a,b,block.data.bounds),length=distanceKm(a,b);
    if(length<1e-9)continue;
    if(!interval){part++;continue;}
    const [start,end]=interval;if(start>0)part++;
    const steps=Math.max(1,Math.ceil(length*(end-start)/spacing));
    let fromGeo=interpolateGeo(a,b,start),from=localPointForGeo(fromGeo,block.data).add(new THREE.Vector3(0,.035,0));
    for(let step=1;step<=steps;step++){
      const t=start+(end-start)*step/steps,toGeo=interpolateGeo(a,b,t);
      const to=localPointForGeo(toGeo,block.data).add(new THREE.Vector3(0,.035,0));
      if(inside(from)&&inside(to)){
        edges.push({a:from,b:to,length:length*(end-start)/steps,part,fromGeo,toGeo});
      }else part++;
      from=to;fromGeo=toGeo;
    }
    if(end<1)part++;
  }
  return edges;
}

function buildGpxRoutes(){
  storyTrackKey=trackFingerprint(gpxTrack);
  const previousId=gpxPlayer.routeBlock?.peak.id||restoredPlayback?.target;let bestBlock=null,bestLength=0;
  blocks.forEach(block=>{
    const data=block.group.userData,old=data.route;
    if(old){block.group.remove(old.root);disposeObject(old.root);old.geometry.dispose();data.route=null;data.routeStats=null;}
    if(!gpxTrack.length)return;
    const motion=measureRoute(routeEdgesForBlock(block));if(!motion.segments.length)return;
    const coords=motion.segments.flatMap(edge=>[edge.a,edge.b]);
    const geometry=new THREE.BufferGeometry().setFromPoints(coords);
    const material=new LineMaterial({color:block.config.gpxColor,linewidth:block.config.gpxWidth,depthTest:true,toneMapped:false,worldUnits:false});
    const fatGeometry=new LineSegmentsGeometry().setPositions(geometry.attributes.position.array);
    const line=new LineSegments2(fatGeometry,material);line.renderOrder=8;line.frustumCulled=false;
    const cursor=new THREE.Mesh(new THREE.SphereGeometry(.052,16,10),new THREE.MeshBasicMaterial({color:block.config.gpxColor,toneMapped:false}));
    const root=new THREE.Group();root.name='gpx-route';root.add(line,cursor);block.group.add(root);
    const stats={distance:motion.total,gain:0,duration:0,hasElevation:false};
    motion.segments.forEach(({fromGeo:a,toGeo:b})=>{
      if(Number.isFinite(a.ele)&&Number.isFinite(b.ele)){stats.gain+=Math.max(0,b.ele-a.ele);stats.hasElevation=true;}
      if(Number.isFinite(a.time)&&Number.isFinite(b.time))stats.duration+=Math.max(0,(b.time-a.time)/1000);
    });
    const liveCanvas=document.createElement('canvas');liveCanvas.width=720;liveCanvas.height=320;const liveTexture=new THREE.CanvasTexture(liveCanvas);liveTexture.colorSpace=THREE.SRGBColorSpace;
    const liveLabel=new THREE.Sprite(new THREE.SpriteMaterial({map:liveTexture,depthTest:false,depthWrite:false,toneMapped:false,fog:false}));
    liveLabel.renderOrder=10000;liveLabel.frustumCulled=false;root.add(liveLabel);
    data.route={root,line,geometry,fatGeometry,material,cursor,motion,liveCanvas,liveTexture,liveLabel,partialIndex:-1};data.routeStats=stats;
    if(motion.total>bestLength){bestLength=motion.total;bestBlock=block;}
  });
  gpxPlayer.routeBlock=blocks.find(block=>block.peak.id===previousId&&block.group.userData.route)||bestBlock;
  setGpxProgress(gpxPlayer.progress);
  const available=Boolean(bestBlock);$('#gpxPlayButton').disabled=!available;$('#gpxProgress').disabled=!available;$('#gpxTarget').disabled=!available;$('#gpxOverviewButton').disabled=!available;
  $('#gpxTarget').innerHTML=available?blocks.filter(block=>block.group.userData.route).map(block=>`<option value="${block.peak.id}">${escapeHtml(block.peak.name)}</option>`).join(''):'<option>Aucun parcours</option>';
  if(available)$('#gpxTarget').value=gpxPlayer.routeBlock.peak.id;
  rebuildStoryPins();renderStoryEditor();
  refreshStatsBillboards();
}

function setGpxProgress(progress){
  gpxPlayer.progress=clamp(progress);
  blocks.forEach(block=>{
    const route=block.group.userData.route;if(!route)return;
    const position=route.geometry.attributes.position;
    if(route.partialIndex>=0){const end=route.motion.segments[route.partialIndex].b;position.setXYZ(route.partialIndex*2+1,end.x,end.y,end.z);}
    const sample=sampleRoute(route.motion,route.motion.total*gpxPlayer.progress);
    position.setXYZ(sample.index*2+1,sample.point.x,sample.point.y,sample.point.z);position.needsUpdate=true;
    route.geometry.setDrawRange(0,gpxPlayer.progress>0?(sample.index+1)*2:0);
    route.fatGeometry.instanceCount=gpxPlayer.progress>0?sample.index+1:0;route.fatGeometry.attributes.instanceEnd.data.needsUpdate=true;
    route.partialIndex=sample.index;route.cursor.position.copy(sample.point);route.cursor.visible=true;
  });
  updateLiveStats();updateRouteStyle();
  $('#gpxProgress').value=Math.round(gpxPlayer.progress*1000);$('#gpxProgressValue').value=`${Math.round(gpxPlayer.progress*100)} %`;
}

function toggleGpxAnimation(){
  stopCinema();
  if(!gpxPlayer.routeBlock)return;
  if(mediaBusy&&!gpxPlayer.playing&&!gpxPlayer.paused&&!exportSettings){showError('Attends le chargement des médias.');return;}
  if(gpxPlayer.playing){gpxPlayer.playing=false;gpxPlayer.paused=true;controls.enabled=false;$('#gpxPlayButton').textContent='▶ Reprendre';setPlaybackStatus('En pause');return;}
  if(gpxPlayer.paused){gpxPlayer.paused=false;gpxPlayer.playing=true;$('#gpxPlayButton').textContent='❚❚ Pause';controls.enabled=!gpxPlayer.follow&&!story.active;setPlaybackStatus('Lecture reprise');return;}
  if(gpxPlayer.phase==='video-end'){story.active=null;clearStoryVideo();gpxPlayer.playing=true;gpxPlayer.phase='follow';$('#gpxPlayButton').textContent='❚❚ Pause';return;}
  if(gpxPlayer.progress>=.999)setGpxProgress(0);
  story.visited=storyPinsFor().filter(p=>p.progress<gpxPlayer.progress-1e-9).map(p=>p.id);story.active=null;
  gpxPlayer.playing=true;controls.autoRotate=false;$('#rotateButton').classList.remove('active');
  $('#gpxPlayButton').textContent='❚❚ Pause';gpxPlayer.lastPart=null;
  if(gpxPlayer.follow){
    captureFollowOffset();
    beginCameraTransition(followPose(),2.4,'intro',()=>{gpxPlayer.phase='follow';setPlaybackStatus('Lecture · vitesse constante sur la distance');});
    setPlaybackStatus('Approche du parcours…');
  }else{gpxPlayer.phase='follow';setPlaybackStatus('Lecture · caméra libre');}
}

function releaseCamera(){
  // Flush OrbitControls' inertial delta without changing the cinematic end pose.
  const position=camera.position.clone(),target=controls.target.clone(),auto=controls.autoRotate;
  controls.autoRotate=false;controls.enableDamping=false;controls.update();
  camera.position.copy(position);controls.target.copy(target);controls.update();
  controls.enableDamping=true;controls.autoRotate=auto;controls.enabled=true;
}

function stopGpxAnimation(){
  cancelStoryPick();stopCinema();clearStoryVideo();
  gpxPlayer.paused=false;story.active=null;story.visited=[];
  gpxPlayer.playing=false;gpxPlayer.phase='idle';gpxPlayer.transition=null;gpxPlayer.lastPart=null;
  releaseCamera();$('#gpxPlayButton').textContent='▶ Animer';
}

function setPlaybackStatus(message){$('#gpxPlaybackStatus').textContent=message;}

function captureFollowOffset(){
  const block=gpxPlayer.routeBlock;if(!block)return;
  const direction=camera.position.clone().sub(controls.target);direction.y=0;
  if(direction.lengthSq()<1e-8)direction.set(0,0,1);direction.normalize();
  const distance=Math.max(2.3,block.data.size*.22);
  gpxPlayer.offset=direction.multiplyScalar(distance);gpxPlayer.offset.y=Math.max(1.8,block.data.size*.19);
}

function worldRoutePoint(block,point){
  block.group.updateWorldMatrix(true,false);
  return block.group.localToWorld(new THREE.Vector3(point.x,point.y,point.z));
}

function safeCameraHeight(position){
  // Raise the camera above any block beneath it, including rotated neighbours.
  let result=Math.max(position.y,BASE_Y+.5);
  for(const block of blocks){
    block.group.updateWorldMatrix(true,false);
    const local=block.group.worldToLocal(position.clone()),u=local.x/block.data.size+.5,v=local.z/block.data.size+.5;
    if(u>=0&&u<=1&&v>=0&&v<=1)result=Math.max(result,sampleGrid(block.data,u,v)/1000*globalSettings.exaggeration+.65);
  }
  return result;
}

function followPose(offsetOverride){
  const block=gpxPlayer.routeBlock,route=block?.group.userData.route;if(!route)return null;
  if(!gpxPlayer.offset)captureFollowOffset();
  const point=smoothRoutePoint(route.motion,gpxPlayer.progress*route.motion.total,Math.max(.1,Math.min(.4,route.motion.total*.03)));
  const target=worldRoutePoint(block,point);target.y+=.08;
  const position=target.clone().addScaledVector(offsetOverride||gpxPlayer.offset,globalSettings.gpxFollowDistance);position.y=safeCameraHeight(position);
  return {position,target};
}

function beginCameraTransition(pose,duration,phase,onComplete){
  if(!pose)return;
  controls.maxDistance=Math.max(controls.maxDistance,pose.position.distanceTo(pose.target)*1.2);camera.far=Math.max(camera.far,controls.maxDistance*2);camera.updateProjectionMatrix();
  controls.autoRotate=false;$('#rotateButton').classList.remove('active');controls.enabled=false;
  gpxPlayer.phase=phase;
  gpxPlayer.transition={fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),toPosition:pose.position.clone(),toTarget:pose.target.clone(),elapsed:0,duration,onComplete};
}

function updateCameraTransition(delta){
  const transition=gpxPlayer.transition;if(!transition)return;
  transition.elapsed=Math.min(transition.duration,transition.elapsed+delta);if(transition.duration-transition.elapsed<1e-9)transition.elapsed=transition.duration;const t=clamp(transition.elapsed/transition.duration),ease=smootherstep(t);
  camera.position.lerpVectors(transition.fromPosition,transition.toPosition,ease);
  controls.target.lerpVectors(transition.fromTarget,transition.toTarget,ease);
  // A gentle upward arc keeps the approach/retreat clear of surrounding relief.
  camera.position.y+=Math.sin(Math.PI*t)**2*Math.min(2,transition.fromPosition.distanceTo(transition.toPosition)*.06);
  camera.lookAt(controls.target);
  if(t===1){gpxPlayer.transition=null;transition.onComplete?.();}
}

function updateFollowCamera(delta){
  const pose=followPose();if(!pose)return;
  const alpha=dampingAlpha(delta,.65);
  camera.position.lerp(pose.position,alpha);controls.target.lerp(pose.target,alpha);camera.lookAt(controls.target);
}

function routeOverviewPose(){
  const block=gpxPlayer.routeBlock,route=block?.group.userData.route;if(!route)return null;
  const bounds=new THREE.Box3();route.motion.segments.forEach(edge=>{bounds.expandByPoint(worldRoutePoint(block,edge.a));bounds.expandByPoint(worldRoutePoint(block,edge.b));});
  const target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const radius=Math.max(1,size.length()*.5),vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect);
  const distance=radius/Math.sin(Math.min(vfov,hfov)/2)*1.22;
  const direction=(gpxPlayer.offset||camera.position.clone().sub(controls.target)).clone();direction.y=0;
  if(direction.lengthSq()<1e-8)direction.set(0,0,1);direction.normalize();direction.y=.8;direction.normalize();
  const position=target.clone().addScaledVector(direction,distance);position.y=safeCameraHeight(position);
  return {position,target};
}

function startRouteOverview(){
  if(!gpxPlayer.routeBlock)return;
  beginCameraTransition(routeOverviewPose(),3,'outro',()=>{stopGpxAnimation();setPlaybackStatus('Vue d’ensemble · parcours terminé');});
  setPlaybackStatus('Retour à la vue d’ensemble…');
}

function applyQuality(){
  if(videoExport.active)return;
  const quality=QUALITY[globalSettings.quality],mobile=matchMedia('(max-width: 760px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?Math.min(1.8,quality.dpr):quality.dpr));renderer.shadowMap.enabled=globalSettings.shadows;
  sun.shadow.mapSize.set(quality.shadow,quality.shadow);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}
  $('.quality-badge').textContent=`SATELLITE + DEM · ${quality.label}`;fitTerrainShadows();
}

function applyLighting(){
  renderer.toneMappingExposure=globalSettings.brightness;sun.intensity=globalSettings.sunIntensity;
  const azimuth=THREE.MathUtils.degToRad(globalSettings.sunAzimuth),elevation=THREE.MathUtils.degToRad(globalSettings.sunElevation),radius=48,flat=Math.cos(elevation)*radius;
  sun.position.set(Math.sin(azimuth)*flat,Math.sin(elevation)*radius,Math.cos(azimuth)*flat);ambient.intensity=globalSettings.fillLight;rim.intensity=globalSettings.fillLight*.3;fitTerrainShadows();clearCloudTerrain();
}

function bindControls(){
  bindDecorControls();bindSurfaceControls();
  bindCinemaControls();bindStoryControls();bindNotebookControls();
  hydrateNarrativeMedia();
  bindRange('gpxFollowDistance','gpxFollowDistanceValue',v=>`${v.toFixed(1).replace('.',',')}×`,v=>{
    if(typeof globalSettings.showGpxStats!=='boolean')globalSettings.showGpxStats=true;
    globalSettings.gpxFollowDistance=clamp(v,.6,4);
    // Retarget an approach from its current pose; steady following uses damping.
    if(gpxPlayer.follow&&gpxPlayer.transition&&['intro','scrub'].includes(gpxPlayer.phase)){
      const previous=gpxPlayer.transition;
      beginCameraTransition(followPose(),Math.max(.6,previous.duration-previous.elapsed),gpxPlayer.phase,previous.onComplete);
    }
  });
  bindRange('terrainSmoothing','terrainSmoothingValue',v=>`${Math.round(v*100)} %`,v=>{
    globalSettings.terrainSmoothing=v;stopCinema();blocks.forEach(b=>{b.data.rawHeights??=b.data.heights.slice();const result=cleanTerrain(b.data.rawHeights,b.data.grid,b.data.size*1000/b.data.grid,v);b.data.heights=result.heights;b.data.repaired=result.repaired;});updateVerticalScale();
  });
  $('#gpxWidth').addEventListener('input',e=>{const config=settingsFor(editorPeakId);config.gpxWidth=+e.target.value;$('#gpxWidthValue').value=`${config.gpxWidth} px`;updateRouteStyle();saveProject();});
  $('#gpxLiveStats').addEventListener('change',e=>{globalSettings.showGpxStats=e.target.checked;updateLiveStats();saveProject();});

  bindRange('fillLight','fillLightValue',v=>v.toFixed(2),v=>{globalSettings.fillLight=v;applyLighting();});
  bindRange('cloudHeight','cloudHeightValue',v=>`${v} m`,v=>{globalSettings.cloudHeight=v;refreshClouds();});
  bindRange('cloudSpread','cloudSpreadValue',v=>`${v} m`,v=>{globalSettings.cloudSpread=v;refreshClouds();});
  for(const key of ['cloudCumulus','cloudStratus','cloudCirrus','cloudCumulonimbus'])bindRange(key,key+'Value',v=>String(v),v=>{globalSettings[key]=v;refreshClouds();});

  bindVideoExport();
  $('#cloudType').value=globalSettings.cloudType;$('#cloudMix').hidden=globalSettings.cloudType!=='mixed';
  $('#cloudType').addEventListener('change',e=>{globalSettings.cloudType=e.target.value;$('#cloudMix').hidden=globalSettings.cloudType!=='mixed';refreshClouds();saveProject();});
  for(const key of ['snowAltitude','snowCoverage','statsX','statsY','statsZ'])$('#'+key).addEventListener('input',e=>{
    const config=settingsFor(editorPeakId);config[key]=+e.target.value;$('#'+key+'Value').value=key==='snowCoverage'?`${Math.round(config[key]*100)} %`:config[key]+(key==='snowAltitude'?' m':' km');
    updateSnow();if(key.startsWith('stats'))refreshStatsBillboards();saveProject();
  });
  $('#snowEnabled').addEventListener('change',e=>{settingsFor(editorPeakId).snowEnabled=e.target.checked;updateSnow();saveProject();});
  $('#resetStatsPosition').addEventListener('click',()=>{Object.assign(settingsFor(editorPeakId),{statsX:0,statsY:0,statsZ:0});syncBlockEditor();refreshStatsBillboards();saveProject();});
  $('#qualitySelect').value=globalSettings.quality;$('#qualitySelect').addEventListener('change',event=>{globalSettings.quality=event.target.value;applyQuality();saveProject();if(globalSettings.quality==='ultra'&&matchMedia('(max-width: 760px)').matches)showError('Le mode Ultra peut être lourd sur téléphone. Repasse en Haute qualité si le navigateur ralentit.');rebuildScene()});
  bindRange('exaggeration','exaggerationValue',value=>`${value.toFixed(1).replace('.',',')}×${value===1?' réelle':''}`,value=>{globalSettings.exaggeration=value;$('.scale-badge').innerHTML=`<i></i><b>Même échelle</b> · relief ${value.toFixed(1).replace('.',',')}×`;updateVerticalScale()});
  bindRange('brightness','brightnessValue',value=>value.toFixed(2).replace('.',','),value=>{globalSettings.brightness=value;applyLighting()});
  bindRange('sunAzimuth','sunAzimuthValue',value=>`${Math.round(value)}°`,value=>{globalSettings.sunAzimuth=value;applyLighting()});
  bindRange('sunElevation','sunElevationValue',value=>`${Math.round(value)}°`,value=>{globalSettings.sunElevation=value;applyLighting()});
  bindRange('sunIntensity','sunIntensityValue',value=>value.toFixed(1).replace('.',','),value=>{globalSettings.sunIntensity=value;applyLighting()});
  $('#shadowToggle').checked=globalSettings.shadows;$('#shadowToggle').addEventListener('change',event=>{globalSettings.shadows=event.target.checked;renderer.shadowMap.enabled=globalSettings.shadows;blocks.forEach(block=>{block.group.userData.top.castShadow=block.group.userData.top.receiveShadow=globalSettings.shadows;block.group.userData.side.castShadow=block.group.userData.side.receiveShadow=globalSettings.shadows});blocks.forEach(refreshSurfaceDecor);refreshGroundDecor();saveProject()});
  $('#groundTexture').value=globalSettings.groundTexture;$('#groundTexture').addEventListener('change',event=>{globalSettings.groundTexture=event.target.value;applyGroundTexture();saveProject();});
  $('#cloudToggle').checked=globalSettings.clouds;$('#cloudToggle').addEventListener('change',event=>{globalSettings.clouds=event.target.checked;blocks.forEach(block=>block.group.userData.clouds.visible=globalSettings.clouds);saveProject()});
  bindRange('cloudDensity','cloudDensityValue',value=>String(Math.round(value)),value=>{globalSettings.cloudDensity=Math.round(value);refreshClouds()});
  bindRange('cloudDetail','cloudDetailValue',value=>`${Math.round(value)} / 3`,value=>{globalSettings.cloudDetail=Math.round(value);refreshClouds()});
  bindRange('cloudOpacity','cloudOpacityValue',value=>`${Math.round(value*100)} %`,value=>{globalSettings.cloudOpacity=value;blocks.forEach(block=>block.group.userData.clouds.children.forEach(cluster=>cluster.userData.volume.material.uniforms.opacity.value=value))});
  bindRange('cloudSize','cloudSizeValue',value=>`${value.toFixed(1).replace('.',',')}×`,value=>{globalSettings.cloudSize=value;refreshClouds()});
  $('#randomizeClouds').addEventListener('click',()=>{globalSettings.cloudSeed++;refreshClouds();saveProject();});
  $('#blockPeakSelect').addEventListener('change',event=>{editorPeakId=event.target.value;syncBlockEditor()});
  $('#blockDiameter').addEventListener('input',event=>{const config=settingsFor(editorPeakId);config.diameter=+event.target.value;$('#blockDiameterValue').value=`${config.diameter} km`;syncOffsetLimits(config);scheduleRebuild()});
  $('#blockRotation').addEventListener('input',event=>{stopCinema();stopGpxAnimation();const value=+event.target.value;settingsFor(editorPeakId).rotation=value;$('#blockRotationValue').value=`${value}°`;const block=blocks.find(item=>item.peak.id===editorPeakId);if(block){block.group.rotation.y=THREE.MathUtils.degToRad(value);block.group.updateWorldMatrix(true,true);clearCloudTerrain();fitTerrainShadows();positionNotebook(block);}saveProject();});
  $('#blockEast').addEventListener('input',event=>{const config=settingsFor(editorPeakId);config.centerEast=+event.target.value;$('#blockEastValue').value=formatSigned(config.centerEast,' km');scheduleRebuild()});
  $('#blockNorth').addEventListener('input',event=>{const config=settingsFor(editorPeakId);config.centerNorth=+event.target.value;$('#blockNorthValue').value=formatSigned(config.centerNorth,' km');scheduleRebuild()});
  $('#blockComment').addEventListener('input',event=>{settingsFor(editorPeakId).comment=event.target.value;saveProject();clearTimeout(statsTimer);statsTimer=setTimeout(refreshStatsBillboards,180)});
  $('#blockStatsToggle').addEventListener('change',event=>{settingsFor(editorPeakId).showStats=event.target.checked;saveProject();refreshStatsBillboards()});
  $('#gpxColor').addEventListener('input',event=>{const color=event.target.value;settingsFor(editorPeakId).gpxColor=color;const route=blocks.find(block=>block.peak.id===editorPeakId)?.group.userData.route;if(route){route.material.color.set(color);route.cursor.material.color.set(color);}saveProject();});
  $('#gpxTarget').addEventListener('change',event=>{stopGpxAnimation();gpxPlayer.routeBlock=blocks.find(block=>block.peak.id===event.target.value)||null;gpxPlayer.offset=null;newStoryDraft();renderStoryEditor();});
  $('#gpxPlayButton').addEventListener('click',toggleGpxAnimation);$('#gpxFollowToggle').checked=gpxPlayer.follow;
  $('#gpxFollowToggle').addEventListener('change',event=>{
    stopCinema();if(story.active||gpxPlayer.paused)stopGpxAnimation();gpxPlayer.follow=event.target.checked;gpxPlayer.transition=null;
    if(!gpxPlayer.follow){gpxPlayer.phase=gpxPlayer.playing?'follow':'idle';releaseCamera();setPlaybackStatus('Caméra libre');}
    else if(gpxPlayer.playing){captureFollowOffset();beginCameraTransition(followPose(),1.5,'intro',()=>{gpxPlayer.phase='follow';});}
  });
  $('#gpxProgress').addEventListener('input',event=>{stopGpxAnimation();setGpxProgress(+event.target.value/1000);if(gpxPlayer.follow&&gpxPlayer.routeBlock){captureFollowOffset();beginCameraTransition(followPose(),.7,'scrub',stopGpxAnimation);}$('#storyPosition').value=(gpxPlayer.progress*100).toFixed(2);setPlaybackStatus('Position choisie · prêt à reprendre');});
  $('#gpxDuration').addEventListener('change',event=>gpxPlayer.duration=+event.target.value);
  $('#gpxOverviewButton').addEventListener('click',()=>{stopGpxAnimation();setGpxProgress(1);startRouteOverview();});
  $('#rotateButton').addEventListener('click',()=>{stopCinema();stopGpxAnimation();controls.autoRotate=!controls.autoRotate;$('#rotateButton').classList.toggle('active',controls.autoRotate)});
  $('#resetCameraButton').addEventListener('click',()=>{stopCinema();stopGpxAnimation();fitCamera()});
  $('#filmButton').addEventListener('click',()=>{document.body.classList.toggle('film-mode');setTimeout(()=>{resize();if(!cinema.playing&&!cinema.paused&&!gpxPlayer.playing&&!gpxPlayer.paused&&!gpxPlayer.transition)fitCamera();},80);if(document.body.classList.contains('film-mode'))document.documentElement.requestFullscreen?.().catch(()=>{})});
  // The sidebar also works if WebGL cannot start (bound in panel-sections.mjs).
  document.addEventListener('mountain:create',handleNewPeak);
  $('#gpxInput').addEventListener('change',event=>handleGpxFile(event.target.files[0]));
  const drop=$('#dropZone');['dragenter','dragover'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('dragging')}));['dragleave','drop'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('dragging')}));drop.addEventListener('drop',event=>handleGpxFile(event.dataTransfer.files[0]));
  $('#saveButton').addEventListener('click',saveActiveStats);window.addEventListener('resize',resize);canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();showError('Le moteur 3D a perdu le contexte graphique. Recharge la page ou baisse la qualité.')});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('film-mode');setTimeout(resize,50)});
  restoreProjectControls();
}

function bindRange(id,outputId,formatter,onInput){
  const input=$('#'+id),output=$('#'+outputId);input.value=globalSettings[id];output.value=formatter(+input.value);
  input.addEventListener('input',event=>{const value=+event.target.value;output.value=formatter(value);onInput(value);saveProject()});
}

function syncOffsetLimits(config){
  const max=Math.max(1,config.diameter/2-.75);
  for(const id of ['blockEast','blockNorth']){$('#'+id).min=-max;$('#'+id).max=max}
  config.centerEast=Math.max(-max,Math.min(max,config.centerEast));config.centerNorth=Math.max(-max,Math.min(max,config.centerNorth));
  $('#blockEast').value=config.centerEast;$('#blockNorth').value=config.centerNorth;$('#blockEastValue').value=formatSigned(config.centerEast,' km');$('#blockNorthValue').value=formatSigned(config.centerNorth,' km');
}

function scheduleRebuild(){saveProject();clearTimeout(rebuildTimer);rebuildTimer=setTimeout(rebuildScene,420)}

function handleNewPeak(event){
  const peak={...event.detail,id:`custom-${Date.now()}`,region:'Sommet personnalisé'};
  if(!peak.name||peak.elevation<=0||!Number.isFinite(peak.lat)||!Number.isFinite(peak.lon))return;
  peaks.push(peak);settingsFor(peak.id);if(selected.length<MAX_PEAKS)selected.push(peak.id);editorPeakId=peak.id;renderPeakList();syncBlockEditor();saveProject();rebuildScene();$('#peakForm').reset();
}

async function handleGpxFile(file){
  if(!file)return;
  try{
    if(file.size>25*1024*1024)throw Error('Ce GPX dépasse 25 Mo. Simplifie-le avant de l’importer.');
    const text=await file.text(),imported=parseGpx(text);gpxSource={name:file.name||'parcours.gpx',text};stopGpxAnimation();gpxTrack=imported;const stats=trackStats(gpxTrack);gpxPlayer.progress=1;gpxPlayer.offset=null;
    $('#gpxStats').textContent=`${gpxTrack.length.toLocaleString('fr-CH')} points · ${stats.distance.toFixed(1)} km · ${stats.hasElevation?`+${Math.round(stats.gain).toLocaleString('fr-CH')} m`:'D+ non renseigné'} (GPX complet)`;$('#gpxStats').classList.add('loaded');
    buildGpxRoutes();newStoryDraft();saveProject();setPlaybackStatus('Tracé complet · Animer pour démarrer depuis la vue actuelle');
    if(!gpxPlayer.routeBlock)showError('Le GPX est chargé, mais son tracé ne traverse aucune découpe actuellement affichée.');
  }catch(error){showError(error.message)}
}

function saveActiveStats(){
  if(!editorPeakId)return;const config=settingsFor(editorPeakId);config.manualDistance=$('#distance').value;config.manualGain=$('#gain').value;config.manualDuration=$('#duration').value;config.manualDate=$('#date').value;config.manualNotes=$('#notes').value;saveProject();refreshStatsBillboards();const button=$('#saveButton');button.textContent='✓ Enregistré';setTimeout(()=>button.textContent='Enregistrer sur cet appareil',1500);
}

function projectSnapshot(){
  return {cameraShots,narrativePins,customPeaks:peaks.filter(peak=>!PEAKS.some(item=>item.id===peak.id)),selected,globalSettings,blockSettings:Object.fromEntries(blockSettings),gpxTrack,gpxSource,
    view:{position:camera.position.toArray(),target:controls.target.toArray()},
    playback:{duration:gpxPlayer.duration,follow:gpxPlayer.follow,progress:gpxPlayer.progress,target:gpxPlayer.routeBlock?.peak.id},
    exportOptions:Object.fromEntries(['exportResolution','exportOrientation','exportFps','exportMotion','exportDuration','exportCodec'].map(id=>[id,$('#'+id).value]))};
}
function projectThumbnail(){
  try{renderer.render(scene,camera);const thumb=document.createElement('canvas');thumb.width=240;thumb.height=140;thumb.getContext('2d').drawImage(canvas,0,0,240,140);return thumb.toDataURL('image/jpeg',.7);}catch{return '';}
}
function saveProject(){
  if(exportSettings)return;
  const snapshot=projectSnapshot();
  if(projectSession.current){projectSession.schedule(snapshot);return;}
  // Legacy fallback retained only when the project manager is not running.
  try{localStorage.setItem('mountainAnimatorProjectV3',JSON.stringify(snapshot));}catch{showError('Sauvegarde impossible : le stockage de ce navigateur est plein ou indisponible.');}
}

function restoreProject(){
  try{
    const saved=projectSession.current?.snapshot||JSON.parse(localStorage.getItem('mountainAnimatorProjectV3')||'null');if(!saved)return;
    gpxTrack=Array.isArray(saved.gpxTrack)?saved.gpxTrack.map(p=>({...p,ele:Number.isFinite(p.ele)?p.ele:NaN,time:Number.isFinite(p.time)?p.time:NaN})):[];
    gpxSource=saved.gpxSource||null;restoredView=saved.view||null;restoredPlayback=saved.playback||null;
    if(restoredPlayback){gpxPlayer.duration=[12,25,45,90].includes(+restoredPlayback.duration)?+restoredPlayback.duration:25;gpxPlayer.follow=restoredPlayback.follow!==false;gpxPlayer.progress=clamp(Number(restoredPlayback.progress)||0);}
    narrativePins=sanitizeStoryPins(saved.narrativePins);
    if(Array.isArray(saved.cameraShots))cameraShots=saved.cameraShots.slice(0,30).filter(s=>['orbit','transfer','book'].includes(s.type));
    if(Array.isArray(saved.customPeaks))peaks=[...PEAKS,...saved.customPeaks];if(Array.isArray(saved.selected))selected=saved.selected.filter(id=>peaks.some(peak=>peak.id===id)).slice(0,MAX_PEAKS);Object.assign(globalSettings,saved.globalSettings||{});if(!QUALITY[globalSettings.quality])globalSettings.quality='high';
    Object.assign(globalSettings,cleanDecorSettings(globalSettings));
    if(!GROUND_KINDS.includes(globalSettings.groundTexture))globalSettings.groundTexture='marble';
    if(typeof globalSettings.showGpxStats!=='boolean')globalSettings.showGpxStats=true;
    globalSettings.gpxFollowDistance=clamp(Number(globalSettings.gpxFollowDistance)||1.6,.6,4);
    if(!Number.isFinite(globalSettings.cloudSeed))globalSettings.cloudSeed=1;
    Object.entries(saved.blockSettings||{}).forEach(([id,value])=>{const config={...defaultBlockSettings(),...value};Object.assign(config,cleanSurfaceSettings(config));config.bookPages=cleanBookPages(config.bookPages);config.bookOpenAtStart=config.bookOpenAtStart===true;config.bookCloseAtEnd=config.bookCloseAtEnd===true;config.bookCoverTitle=String(config.bookCoverTitle||'').slice(0,80);config.bookCoverSubtitle=String(config.bookCoverSubtitle||'').slice(0,160);config.bookCoverColor=/^#[0-9a-f]{6}$/i.test(config.bookCoverColor)?config.bookCoverColor:'#334e43';config.bookCoverImage=validMediaId(config.bookCoverImage);config.bookIndex=clamp(Math.floor(Number(config.bookIndex)||0),0,config.bookPages.length);config.bookHold=clamp(Number(config.bookHold)||7,4,20);if(!value.notebookLayout){config.statsX=0;config.statsY=0;config.statsZ=0;}config.gpxWidth=clamp(Number(config.gpxWidth)||4,1,16);config.rotation=clamp(Number(config.rotation)||0,-180,180);if(!/^#[0-9a-f]{6}$/i.test(config.gpxColor))config.gpxColor='#e76f32';blockSettings.set(id,config);});editorPeakId=selected[0]||'';
  }catch{}
}

function setPanel(open){document.body.classList.toggle('panel-open',open);$('#menuButton').setAttribute('aria-expanded',String(open))}
function showLoading(title,detail){$('#loadingPanel').hidden=false;$('#loadingTitle').textContent=title;$('#loadingDetail').textContent=detail}
function hideLoading(){$('#loadingPanel').hidden=true}
function showError(message){const panel=$('#errorPanel');panel.textContent=message;panel.hidden=false;clearTimeout(showError.timer);showError.timer=setTimeout(hideError,9000)}
function hideError(){$('#errorPanel').hidden=true}
function humanError(){return!navigator.onLine?'aucune connexion Internet':'les données de relief ou l’imagerie haute définition sont temporairement inaccessibles'}
function formatSigned(value,suffix=''){return `${value>0?'+':''}${Number(value).toFixed(2).replace(/\.00$/,'').replace('.',',')}${suffix}`}
function formatDuration(seconds){const totalMinutes=Math.round(seconds/60),hours=Math.floor(totalMinutes/60),minutes=totalMinutes%60;return hours?`${hours} h ${String(minutes).padStart(2,'0')}`:`${minutes} min`}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}

function resize(){if(videoExport.active)return;const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}

function updateCloudAnimation(){
  blocks.forEach(block=>block.group.userData.clouds.children.forEach(cluster=>{cluster.position.x=cluster.userData.startX+Math.sin(cloudTime*cluster.userData.speed+cluster.userData.phase)*.25;cluster.position.z=cluster.userData.startZ+Math.cos(cloudTime*cluster.userData.speed*.7+cluster.userData.phase)*.16}));
}
function animate(){
  requestAnimationFrame(animate);if(previewVideoTask)return;const delta=Math.min(.05,clock.getDelta());
  if(exportSettings)return;
  advanceBookTurns(delta);cloudTime+=delta;if(cinema.playing)advanceCinema(delta);else advancePlayback(delta);
  if(!cinema.playing&&!gpxPlayer.paused&&!story.active&&!gpxPlayer.transition&&(!gpxPlayer.playing||!gpxPlayer.follow))controls.update(delta);
  updateCloudAnimation();updatePeakLabels();updateLiveStats();updateStoryVisuals();updateRouteStyle();renderer.render(scene,camera);
  if(story.active?.pin.video){previewVideoTask=renderStoryVideo().catch(e=>{stopGpxAnimation();showError(e.message);}).finally(()=>{previewVideoTask=null;});}else clearStoryVideo();
}

function advancePlayback(delta){
  if(gpxPlayer.paused)return;
  let remaining=Math.max(0,delta),guard=0;
  // Consume the full film timestep, including stops at 0% and 100%.
  while(remaining>1e-9&&guard++<100){
    if(gpxPlayer.transition){const transition=gpxPlayer.transition,dt=Math.min(remaining,Math.max(0,transition.duration-transition.elapsed));updateCameraTransition(dt);remaining-=dt;continue;}
    if(!gpxPlayer.playing)return;
    if(story.active){const dt=Math.min(remaining,story.active.duration-story.active.elapsed);advanceStoryStop(dt);remaining-=dt;continue;}
    if(gpxPlayer.phase!=='follow')return;
    const end=Math.min(1,gpxPlayer.progress+remaining/gpxPlayer.duration);
    const pin=globalSettings.storyEnabled?nextStoryPin(storyPinsFor(),story.visited,gpxPlayer.progress,end):null;
    const progress=pin?pin.progress:end,dt=Math.max(0,(progress-gpxPlayer.progress)*gpxPlayer.duration);
    setGpxProgress(progress);remaining=Math.max(0,remaining-dt);
    if(pin){beginStoryStop(pin);continue;}
    if(gpxPlayer.follow){
      const route=gpxPlayer.routeBlock?.group.userData.route,sample=route&&sampleRoute(route.motion,route.motion.total*gpxPlayer.progress);
      if(sample&&gpxPlayer.lastPart!==null&&sample.part!==gpxPlayer.lastPart)beginCameraTransition(followPose(),1,'intro',()=>{gpxPlayer.phase='follow';});
      else updateFollowCamera(dt);
      gpxPlayer.lastPart=sample?.part??null;
    }
    if(gpxPlayer.progress>=1){if(gpxPlayer.follow)startRouteOverview();else{stopGpxAnimation();setPlaybackStatus('Parcours terminé · caméra libre');}}
  }
}

function updateSnow(){blocks.forEach(block=>{const u=block.group.userData.top.material.userData.snow;u.snowLine.value=block.config.snowEnabled?block.config.snowAltitude:1e7;u.snowCoverage.value=block.config.snowCoverage;});scheduleSurfaceDecor();}

function bindVideoExport(){
  const types=supportedVideoTypes();
  $('#exportCodec').innerHTML=types.map(t=>`<option value="${t.ext}">${t.label}</option>`).join('');
  $('#exportStart').disabled=!types.length;
  if(!types.length)$('#exportStatus').textContent='Rendu image par image indisponible : utilise Chrome ou Edge récent avec WebCodecs.';
  $('#exportStart').addEventListener('click',runVideoExport);
  $('#renderCancel').addEventListener('click',()=>videoExport.cancel());
  canvas.addEventListener('webglcontextlost',()=>{if(videoExport.active)videoExport.cancel();});
}

function lockExportControls(locked){
  $('#controlPanel').inert=locked;$('.topbar').inert=locked;
  $('#renderPanel').hidden=!locked;canvas.style.pointerEvents=locked?'none':'';
}

function saveExportView(){
  return {books:blocks.map(b=>({id:b.peak.id,showStats:b.config.showStats,openness:b.group.userData.statsCard?.userData.openness??1,manualCover:b.group.userData.statsCard?.userData.manualCover?{...b.group.userData.statsCard.userData.manualCover}:null,index:b.group.userData.statsCard?.userData.index||0,turn:b.group.userData.statsCard?.userData.turn||0,manualTurn:b.group.userData.statsCard?.userData.manualTurn?{...b.group.userData.statsCard.userData.manualTurn}:null})),dpr:renderer.getPixelRatio(),position:camera.position.clone(),target:controls.target.clone(),
    story:{visited:[...story.visited],active:story.active?{...story.active,fromPosition:story.active.fromPosition.clone(),fromTarget:story.active.fromTarget.clone(),offset:story.active.offset.clone(),exitOffset:story.active.exitOffset.clone(),target:story.active.target.clone()}:null},
    cinema:{...cinema},far:camera.far,maxDistance:controls.maxDistance,cloudTime,autoRotate:controls.autoRotate,enabled:controls.enabled,
    damping:controls.enableDamping,player:{...gpxPlayer,offset:gpxPlayer.offset?.clone(),
    transition:gpxPlayer.transition?{...gpxPlayer.transition,fromPosition:gpxPlayer.transition.fromPosition.clone(),fromTarget:gpxPlayer.transition.fromTarget.clone(),toPosition:gpxPlayer.transition.toPosition.clone(),toTarget:gpxPlayer.transition.toTarget.clone()}:null},
    playbackStatus:$('#gpxPlaybackStatus').textContent,cinemaStatus:$('#cinemaStatus').textContent,cinemaPause:$('#cinemaPause').textContent};
}

async function runVideoExport(){
  if(exportSettings)return;
  if(!blocks.length||!$('#loadingPanel').hidden){showError('Attends le chargement des montagnes avant d’exporter.');return;}
  if(mediaBusy){showError('Attends la préparation des photos avant d’exporter.');return;}
  const mode=$('#exportMotion').value;
  if(mode==='sequence'&&!cameraShots.length){showError('Ajoute des séquences dans les outils caméra.');return;}
  if((mode==='gpx'||mode==='pin')&&!gpxPlayer.routeBlock){showError('Importe un GPX avant de choisir le rendu du parcours.');return;}
  const [width,height]=videoDimensions($('#exportResolution').value,$('#exportOrientation').value);
  const fps=+$('#exportFps').value,ext=$('#exportCodec').value;
  flushSurfaceDecor();exportSettings=saveExportView();videoExport.cancelled=false;lockExportControls(true);
  $('#renderStatus').textContent='Préparation de l’encodeur…';$('#renderProgress').value=0;
  const started=performance.now();
  try{
    if(previewVideoTask)await previewVideoTask;await prepareMedia(narrativeMediaIds());await prepareVideos(narrativePins.map(p=>p.video));
    validateStoryVideos();await document.fonts?.ready;
    exportCanvas=document.createElement('canvas');exportCanvas.width=width;exportCanvas.height=height;exportContext=exportCanvas.getContext('2d');
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    // Remove interactive inertia: the exported camera depends only on film time.
    controls.enableDamping=false;controls.autoRotate=false;controls.enabled=false;
    let duration=+$('#exportDuration').value;
    if(mode==='sequence'){startCinema(cameraShots);duration=cinema.timeline.duration+1/fps;}
    else if(mode==='gpx'||mode==='pin'){
      const selectedPin=mode==='pin'?storyPinsFor().find(p=>p.id===storyEditingId):null;if(mode==='pin'&&!selectedPin)throw Error('Sélectionne une étape avec « Modifier / voir ».');
      stopGpxAnimation();gpxPlayer.follow=true;if(selectedPin)startFromStoryPin(selectedPin);else{setGpxProgress(0);toggleGpxAnimation();}
      const parts=new Set(gpxPlayer.routeBlock.group.userData.route.motion.segments.map(edge=>edge.part)).size;
      const from=selectedPin?.progress||0,pins=globalSettings.storyEnabled?storyPinsFor().filter(p=>p.progress>from+1e-9||Math.abs(p.progress-from)<1e-9&&(!selectedPin||p.id.localeCompare(selectedPin.id)>=0)):selectedPin?[selectedPin]:[],terminal=pins.find(p=>p.video&&p.videoMode==='in'),end=terminal?.progress??1,used=terminal?pins.slice(0,pins.indexOf(terminal)+1):pins;
      duration=gpxPlayer.duration*(end-from)+(selectedPin?0:2.4)+(terminal?1/30:3+.5)+Math.max(0,parts-1)+used.reduce((sum,p)=>sum+stopDuration(p),0);
      if(duration>300)throw Error('Le film dépasse 5 minutes avec les étapes. Réduis les pauses, orbites ou la durée du parcours.');
    }else if(mode==='rotation'||mode==='still'){stopCinema();stopGpxAnimation();}
    controls.enabled=false;controls.enableDamping=false;
    const orbit=camera.position.clone().sub(controls.target),rotationTarget=controls.target.clone();
    if(videoExport.cancelled){$('#exportStatus').textContent='Rendu annulé.';return;}
    const blob=await videoExport.start({canvas:exportCanvas,ext,fps,duration,
      renderFrame:({index,time,delta})=>{
        if(renderer.getContext().isContextLost())throw Error('Le contexte graphique a été perdu. Réduis la qualité puis relance le rendu.');
        cloudTime=exportSettings.cloudTime+time;
        if(mode==='sequence'){applyCinemaTime(time);}
        else if(mode==='current'&&exportSettings.cinema.playing){applyCinemaTime(exportSettings.cinema.time+time);}
        else if(mode==='rotation'){
          camera.position.copy(orbit).applyAxisAngle(new THREE.Vector3(0,1,0),-time/duration*Math.PI*2).add(rotationTarget);controls.target.copy(rotationTarget);camera.lookAt(controls.target);
        }else if(mode==='gpx'||mode==='pin'||mode==='current'){
          if(index>0)advancePlayback(delta);
          if(mode==='current'&&exportSettings.autoRotate&&!gpxPlayer.playing&&!gpxPlayer.transition){
            camera.position.copy(orbit).applyAxisAngle(new THREE.Vector3(0,1,0),-time*2*Math.PI/60*controls.autoRotateSpeed).add(rotationTarget);camera.lookAt(controls.target);
          }
        }
        if(mode==='current'&&!exportSettings.cinema.playing&&index>0)advanceBookTurns(delta);
        updateCloudAnimation();updatePeakLabels.next=0;updatePeakLabels();updateLiveStats();updateStoryVisuals();updateRouteStyle();renderer.render(scene,camera);
        exportContext.fillStyle='#142631';exportContext.fillRect(0,0,width,height);exportContext.drawImage(canvas,0,0);drawExportLabels();
        if(story.active?.pin.video)return renderStoryVideo(exportContext);
      },onProgress:(frame,total)=>{
        const elapsed=(performance.now()-started)/1000,eta=elapsed/frame*(total-frame);
        $('#renderProgress').value=frame/total;$('#renderStatus').textContent=`${frame} / ${total} images · ${Math.round(frame/total*100)} % · reste environ ${formatDuration(eta)}`;
      }});
    if(blob){
      if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(blob);
      const link=$('#exportDownload');link.href=exportUrl;link.download=`MountainAnimator-${Date.now()}.${ext}`;link.hidden=false;link.click();
      $('#exportStatus').textContent=`Rendu terminé · ${width} × ${height} · ${fps} i/s · ${duration.toFixed(1)} s.`;
    }else $('#exportStatus').textContent='Rendu annulé. La scène est restaurée.';
  }catch(error){$('#exportStatus').textContent=`Rendu impossible : ${error.message}`;showError(error.message);}
  finally{restoreExportView();}
}

function restoreExportView(){
  const saved=exportSettings;if(!saved)return;
  let restoreBooks=false;for(const state of saved.books||[]){const block=blocks.find(b=>b.peak.id===state.id);if(block&&block.config.showStats!==state.showStats){block.config.showStats=state.showStats;restoreBooks=true;}}if(restoreBooks)refreshStatsBillboards();
  for(const state of saved.books||[]){const book=blocks.find(b=>b.peak.id===state.id)?.group.userData.statsCard;if(book){book.userData.setState(state.index,state.turn);book.userData.setOpenness(state.openness??1);book.userData.manualCover=state.manualCover;book.userData.manualTurn=state.manualTurn;}}
  Object.assign(story,saved.story);Object.assign(cinema,saved.cinema);Object.assign(gpxPlayer,saved.player);setGpxProgress(saved.player.progress);
  $('#cinemaStatus').textContent=saved.cinemaStatus;$('#cinemaPause').textContent=saved.cinemaPause;
  controls.autoRotate=false;controls.enableDamping=false;controls.update(0);
  camera.position.copy(saved.position);controls.target.copy(saved.target);camera.lookAt(controls.target);controls.update(0);
  camera.position.copy(saved.position);controls.target.copy(saved.target);camera.lookAt(controls.target);
  controls.autoRotate=saved.autoRotate;controls.enabled=saved.enabled;controls.enableDamping=saved.damping;
  controls.maxDistance=saved.maxDistance;camera.far=saved.far;
  cloudTime=saved.cloudTime;updateCloudAnimation();updatePeakLabels.next=0;
  $('#gpxPlayButton').textContent=gpxPlayer.playing?'❚❚ Pause':gpxPlayer.paused?'▶ Reprendre':'▶ Animer';$('#rotateButton').classList.toggle('active',saved.autoRotate);setPlaybackStatus(saved.playbackStatus);
  renderer.setPixelRatio(saved.dpr);exportSettings=null;clearStoryVideo();resize();lockExportControls(false);updateRouteStyle();clock.getDelta();
}
function drawExportLabels(){
  const ctx=exportContext,w=exportCanvas.width,h=exportCanvas.height,scale=h/1080;
  ctx.font=`600 ${22*scale}px sans-serif`;ctx.textAlign='center';
  blocks.forEach(block=>{
    const p=block.group.userData.summitLocal.clone();p.y+=.34;block.group.localToWorld(p);p.project(camera);
    if(Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1||block.group.userData.label?.style.display==='none')return;
    const x=(p.x*.5+.5)*w,y=(-p.y*.5+.5)*h,text=`${block.peak.name} · ${block.peak.elevation} m`;
    ctx.fillStyle='rgba(15,26,31,.85)';ctx.fillRect(x-ctx.measureText(text).width/2-12*scale,y-30*scale,ctx.measureText(text).width+24*scale,40*scale);
    ctx.fillStyle='#fff';ctx.fillText(text,x,y);
  });
  ctx.textAlign='right';ctx.font=`${13*scale}px sans-serif`;ctx.fillStyle='#fff';ctx.fillText('Relief : Mapzen / AWS · Imagerie : Esri World Imagery',w-20*scale,h-20*scale);
}

function fitTerrainShadows(){
  if(!blocks.length)return;
  scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3();
  blocks.forEach(block=>{bounds.expandByObject(block.group.userData.top);bounds.expandByObject(block.group.userData.side);const book=block.group.userData.statsCard;if(book){book.updateWorldMatrix(true,true);for(const x of [-book.userData.width/2,book.userData.width/2])for(const y of [0,book.userData.width/2+.3])for(const z of [-book.userData.height/2,book.userData.height/2])bounds.expandByPoint(book.localToWorld(new THREE.Vector3(x,y,z)));}});
  if(groundDecor)bounds.expandByObject(groundDecor);
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const az=THREE.MathUtils.degToRad(globalSettings.sunAzimuth),el=THREE.MathUtils.degToRad(globalSettings.sunElevation);
  const distance=Math.max(48,size.length()*1.6);
  sun.target.position.copy(center);sun.position.copy(center).add(new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance));
  sun.target.updateMatrixWorld(true);sun.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
  const lightBounds=new THREE.Box3();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])lightBounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(sun.shadow.camera.matrixWorldInverse));
  const c=sun.shadow.camera,pad=1.5;
  c.left=lightBounds.min.x-pad;c.right=lightBounds.max.x+pad;c.bottom=lightBounds.min.y-pad;c.top=lightBounds.max.y+pad;
  c.near=Math.max(.1,-lightBounds.max.z-pad);c.far=-lightBounds.min.z+pad+Math.max(size.length(),size.y/Math.max(.05,Math.sin(el)));c.updateProjectionMatrix();sun.shadow.needsUpdate=true;
}

function updateRouteStyle(){
  const h=exportSettings?exportCanvas?.height||1080:stage.clientHeight;
  blocks.forEach(block=>{const route=block.group.userData.route;if(!route)return;route.material.linewidth=block.config.gpxWidth*h/1080;route.material.resolution.set(exportSettings?exportCanvas?.width||1920:stage.clientWidth,h);});
}
function overlayDimensions(){return {width:exportSettings?exportCanvas?.width||1920:stage.clientWidth,height:exportSettings?exportCanvas?.height||1080:stage.clientHeight};}
function placeOverlay(sprite,block,x,y,w,h,width,height){
  const center=new THREE.Vector3(x/width*2-1,1-y/height*2,0).unproject(camera);
  const depth=-center.clone().applyMatrix4(camera.matrixWorldInverse).z;
  sprite.position.copy(block.group.worldToLocal(center));
  const scale=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/height;sprite.scale.set(w*scale,h*scale,1);
}
function updateLiveStats(){
  camera.updateMatrixWorld(true);const {width,height}=overlayDimensions();if(!width||!height)return;
  const unit=exportSettings?height/1080:1,w=Math.min(185*unit,width*.47),h=w*320/720;
  blocks.forEach(block=>{
    const route=block.group.userData.route;if(!route)return;
    route.liveLabel.visible=globalSettings.showGpxStats&&block===gpxPlayer.routeBlock;if(!route.liveLabel.visible)return;
    const anchor=route.cursor.getWorldPosition(new THREE.Vector3()).project(camera);
    // Keep the text beside the dot; never flip sides when it nears an edge.
    // An offscreen/behind-camera cursor must not leave unrelated counters onscreen.
    if(anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x)>1 || Math.abs(anchor.y)>1){route.liveLabel.visible=false;return;}
    const metrics=routeMetrics(route.motion,gpxPlayer.progress*route.motion.total,globalSettings.exaggeration);
    const text=`${Math.round(metrics.altitude)}|D+ ${metrics.gain===null?'—':Math.round(metrics.gain)}|${metrics.distance.toFixed(2)}`;
    if(route.liveText!==text){paintLiveGpxCard(route.liveCanvas,metrics);route.liveTexture.needsUpdate=true;route.liveText=text;}
    const margin=8*unit,gap=12*unit;
    const x=clamp((anchor.x+1)*width/2+gap+w/2,margin+w/2,width-margin-w/2);
    const y=clamp((1-anchor.y)*height/2-gap-h/2,margin+h/2,height-margin-h/2);
    placeOverlay(route.liveLabel,block,x,y,w,h,width,height);
  });
}

function mountainCameraPose(id,spec={}){
  if(spec.type==='book')return notebookCameraPose(id,spec.bookOpenness??1);
  const block=blocks.find(b=>b.peak.id===id);if(!block)throw Error('Une montagne de la séquence n’est plus affichée.');
  const bounds=new THREE.Box3().setFromObject(block.group.userData.top),target=bounds.getCenter(new THREE.Vector3()),radius=bounds.getSize(new THREE.Vector3()).length()*.5;
  const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect);
  const distance=radius/Math.sin(Math.min(vfov,hfov)/2)*clamp(Number(spec.distance)||1, .6,2);
  const elevation=THREE.MathUtils.degToRad(clamp(Number(spec.elevation)||30,12,75)),angle=THREE.MathUtils.degToRad(25);
  const position=target.clone().add(new THREE.Vector3(Math.sin(angle)*Math.cos(elevation),Math.sin(elevation),Math.cos(angle)*Math.cos(elevation)).multiplyScalar(distance));
  return {position,target};
}
function globalCameraPose(){
  const bounds=new THREE.Box3();blocks.forEach(b=>bounds.expandByObject(b.group.userData.top));
  const target=bounds.getCenter(new THREE.Vector3()),radius=bounds.getSize(new THREE.Vector3()).length()*.5;
  const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect),distance=radius/Math.sin(Math.min(vfov,hfov)/2)*1.18;
  return {position:target.clone().add(new THREE.Vector3(.2,.65,1).normalize().multiplyScalar(distance)),target};
}
function syncCinemaEditor(){
  for(const id of ['shotFrom','shotTo']){
    const select=$('#'+id);if(!select)return;const previous=select.value;
    select.innerHTML=blocks.map(b=>`<option value="${b.peak.id}">${escapeHtml(b.peak.name)}</option>`).join('');
    if(blocks.some(b=>b.peak.id===previous))select.value=previous;
    else if(id==='shotTo'&&blocks.length>1)select.value=blocks[1].peak.id;
  }
  renderShotList();syncNotebookEditor();
}
function shotFromEditor(){return {type:$('#shotType').value,from:$('#shotFrom').value,to:$('#shotTo').value,duration:+$('#shotDuration').value,angle:+$('#shotAngle').value,distance:+$('#shotDistance').value,elevation:+$('#shotElevation').value};}
function renderShotList(){
  const name=id=>peaks.find(p=>p.id===id)?.name||'Sommet absent';
  $('#shotList').innerHTML=cameraShots.map((s,i)=>`<li><span>${i+1}. ${s.type==='book'?'Carnet':s.type==='orbit'?'Orbite':'Liaison'} · ${escapeHtml(name(s.from))}${s.type==='transfer'?' → '+escapeHtml(name(s.to)):''} · ${s.duration}s</span><div><button type="button" data-shot-up="${i}" aria-label="Monter la séquence ${i+1}" ${i===0?'disabled':''}>↑</button><button type="button" data-shot-down="${i}" aria-label="Descendre la séquence ${i+1}" ${i===cameraShots.length-1?'disabled':''}>↓</button><button type="button" data-shot-delete="${i}" aria-label="Supprimer la séquence ${i+1}">×</button></div></li>`).join('');
  $('#sequenceTotal').textContent=`${cameraShots.length} plans · ${cameraShots.reduce((n,s)=>n+Number(s.duration),0)} s`;
  for(const action of ['up','down','delete'])document.querySelectorAll(`[data-shot-${action}]`).forEach(button=>button.addEventListener('click',()=>{
    stopCinema();const index=+button.getAttribute(`data-shot-${action}`);
    if(action==='delete')cameraShots.splice(index,1);else{const other=index+(action==='up'?-1:1);[cameraShots[index],cameraShots[other]]=[cameraShots[other],cameraShots[index]];}
    renderShotList();saveProject();
  }));
}
function startCinema(shots=cameraShots){
  shots=shots.map(normalizeBookShot);
  if(shots.reduce((n,s)=>n+s.duration,0)>295)throw Error('La composition dépasse 295 secondes. Réduis les temps de lecture.');
  const timeline=compileCameraSequence(shots,{position:camera.position.clone(),target:controls.target.clone()},mountainCameraPose,globalCameraPose());
  stopGpxAnimation();blocks.forEach(b=>{if(b.group.userData.statsCard){b.group.userData.statsCard.userData.manualTurn=null;b.group.userData.statsCard.userData.manualCover=null;}});controls.autoRotate=false;$('#rotateButton').classList.remove('active');controls.enabled=false;
  cinema.timeline=timeline;cinema.time=0;cinema.playing=true;cinema.paused=false;applyCinemaTime(0);$('#cinemaPause').textContent='Pause';
}
function applyCinemaTime(time){
  if(!cinema.timeline)return;
  cinema.time=clamp(time,0,cinema.timeline.duration);
  const bookTracks=cinema.timeline.tracks.filter(s=>s.type==='book');
  for(const id of new Set(bookTracks.map(s=>s.blockId))){
    const track=bookTracks.filter(s=>s.blockId===id&&s.at<=cinema.time).at(-1),book=blocks.find(b=>b.peak.id===id)?.group.userData.statsCard;
    if(book){book.userData.manualTurn=null;const state=track?sampleBookNarration(book.userData.spreadCount,clamp(cinema.time-track.at,0,track.duration),track.hold,track):{index:0,turn:0,openness:blocks.find(b=>b.peak.id===id).config.bookOpenAtStart?0:1};book.userData.setState(state.index,state.turn);book.userData.setOpenness(state.openness);}
  }
  const pose=sampleCameraSequence(cinema.timeline,cinema.time);
  camera.position.copy(pose.position);camera.position.y=safeCameraHeight(camera.position);controls.target.copy(pose.target);camera.lookAt(controls.target);
  controls.maxDistance=Math.max(controls.maxDistance,camera.position.distanceTo(controls.target)*1.2);camera.far=Math.max(camera.far,camera.position.distanceTo(controls.target)*3);camera.updateProjectionMatrix();
  $('#cinemaStatus').textContent=`${cinema.time.toFixed(1)} / ${cinema.timeline.duration.toFixed(1)} s`;
}
function advanceCinema(delta){applyCinemaTime(cinema.time+delta);if(cinema.time>=cinema.timeline.duration)stopCinema();}
function stopCinema(){const wasActive=cinema.playing||cinema.paused;cinema.playing=false;cinema.paused=false;if(wasActive&&!exportSettings){blocks.forEach(b=>{const book=b.group.userData.statsCard;if(book)b.config.bookIndex=book.userData.index;});renderNotebookEditor();}if(typeof controls!=='undefined')controls.enabled=true;$('#cinemaPause').textContent='Pause';}
function bindCinemaControls(){
  $('#shotType').addEventListener('change',()=>{$('#shotToRow').hidden=$('#shotType').value!=='transfer';});
  const start=shots=>{try{startCinema(shots);}catch(e){showError(e.message);}};
  $('#shotPreview').addEventListener('click',()=>start([shotFromEditor()]));
  $('#shotAdd').addEventListener('click',()=>{
    let shot;try{shot=normalizeBookShot(shotFromEditor());}catch(e){showError(e.message);return;}if(!shot.from||shot.type==='transfer'&&shot.from===shot.to){showError('Choisis les montagnes de la séquence.');return;}
    if(cameraShots.reduce((n,s)=>n+Number(s.duration),0)+shot.duration>295){showError('Une composition vidéo peut contenir jusqu’à 295 secondes de séquences.');return;}
    cameraShots.push(shot);renderShotList();saveProject();
  });
  $('#sequencePlay').addEventListener('click',()=>start(cameraShots));
  $('#cinemaStop').addEventListener('click',()=>{stopCinema();$('#cinemaStatus').textContent='Arrêté · vue conservée';});
  $('#cinemaPause').addEventListener('click',()=>{
    if(!cinema.timeline)return;
    if(cinema.playing){cinema.playing=false;cinema.paused=true;$('#cinemaPause').textContent='Reprendre';}
    else if(cinema.paused&&cinema.time<cinema.timeline.duration){cinema.playing=true;cinema.paused=false;controls.enabled=false;$('#cinemaPause').textContent='Pause';}
  });
  syncCinemaEditor();
}

function storyPinsFor(block=gpxPlayer.routeBlock){return block?.group.userData.route?.storyPins||[];}
function rebuildStoryPins(){
  blocks.forEach(block=>{
    const route=block.group.userData.route;if(!route)return;
    if(route.storyRoot){route.root.remove(route.storyRoot);disposeObject(route.storyRoot);}
    route.storyRoot=new THREE.Group();route.root.add(route.storyRoot);route.storyPins=[];
    narrativePins.filter(p=>p.track===storyTrackKey&&p.block===block.peak.id).forEach(saved=>{
      const closest=nearestRoutePoint(route.motion,localPointForGeo(saved,block.data),saved.progress);
      if(!closest||closest.error>.015)return; // Outside this cutout: never move a pin to another summit.
      const sample=sampleRoute(route.motion,closest.progress*route.motion.total),pin={...saved,progress:closest.progress,point:new THREE.Vector3(sample.point.x,sample.point.y,sample.point.z)};
      const marker=new THREE.Group();marker.position.copy(pin.point);
      const material=new THREE.MeshBasicMaterial({color:0xf3d695,toneMapped:false,transparent:true,depthWrite:false});
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.20,6),material);stem.position.y=.10;
      const head=new THREE.Mesh(new THREE.SphereGeometry(.043,12,8),material);head.position.y=.22;marker.add(stem,head);route.storyRoot.add(marker);
      const card=document.createElement('canvas');card.width=900;card.height=pin.image?1040:440;if(pin.image)paintStoryPhoto(card,pin,mediaImage(pin.image));else paintStoryLabel(card,pin);
      const texture=new THREE.CanvasTexture(card);texture.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false,fog:false}));label.renderOrder=10002;label.frustumCulled=false;label.visible=false;route.storyRoot.add(label);
      const leader=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false,transparent:true,toneMapped:false,fog:false}));leader.renderOrder=10001;leader.frustumCulled=false;leader.visible=false;route.storyRoot.add(leader);
      route.storyPins.push({...pin,marker,label,leader});
    });
    route.storyPins.sort((a,b)=>a.progress-b.progress||a.id.localeCompare(b.id));
  });
}
function newStoryDraft(){storyDraftVersion++;storyVideoDraft={};syncStoryVideoEditor();storyImageDraft='';syncStoryPhoto();storyEditingId=null;$('#storyPosition').value=(gpxPlayer.progress*100).toFixed(2);$('#storyName').value='';$('#storyComment').value='';$('#storySave').textContent='Ajouter cette étape';}
function renderStoryEditor(){
  const block=gpxPlayer.routeBlock,pins=storyPinsFor();const available=!!block;
  $('#storySave').disabled=!available;$('#storyPick').disabled=!available;$('#storyPlayFrom').disabled=!pins.some(p=>p.id===storyEditingId);
  const all=narrativePins.filter(p=>p.track===storyTrackKey&&p.block===block?.peak.id);
  $('#storyList').innerHTML=pins.map((p,i)=>`<li><span>${i+1}. ${escapeHtml(p.name)} · ${(p.progress*100).toFixed(1)} %${p.video?' · vidéo '+(p.videoEnd-p.videoStart).toFixed(1)+'s':''} · pause ${p.pause}s${p.angle?` + orbite ${p.angle}° / ${p.orbitDuration}s`:''}</span><div><button type="button" data-story-edit="${escapeHtml(p.id)}">Modifier / voir</button><button type="button" data-story-delete="${escapeHtml(p.id)}">Supprimer</button></div></li>`).join('');
  $('#storyStatus').textContent=available?`${pins.length} étapes · +${pins.reduce((sum,p)=>sum+stopDuration(p),0).toFixed(1)} s avec transitions${all.length>pins.length?' · certaines étapes sont hors de la découpe':''}`:'Importe un GPX pour placer des étapes.';
  document.querySelectorAll('[data-story-edit]').forEach(button=>button.addEventListener('click',()=>{
    const pin=pins.find(p=>p.id===button.dataset.storyEdit);stopGpxAnimation();setGpxProgress(pin.progress);storyEditingId=pin.id;storyDraftVersion++;storyImageDraft=pin.image||'';storyVideoDraft=cleanPinVideo(pin);syncStoryPhoto();syncStoryVideoEditor();$('#storyPlayFrom').disabled=false;
    $('#storyPosition').value=(pin.progress*100).toFixed(4);$('#storyName').value=pin.name;$('#storyComment').value=pin.comment;$('#storyPause').value=pin.pause;$('#storyAngle').value=pin.angle;$('#storyOrbitDuration').value=pin.orbitDuration;$('#storySave').textContent='Enregistrer cette étape';
    if(gpxPlayer.follow){captureFollowOffset();beginCameraTransition(followPose(),.7,'scrub',()=>{gpxPlayer.phase='idle';releaseCamera();});}
  }));
  document.querySelectorAll('[data-story-delete]').forEach(button=>button.addEventListener('click',()=>{stopGpxAnimation();narrativePins=narrativePins.filter(p=>p.id!==button.dataset.storyDelete);newStoryDraft();rebuildStoryPins();renderStoryEditor();saveProject();}));
}
function saveStoryPin(){
  if(mediaBusy){showError('Attends la préparation du média.');return;}
  const block=gpxPlayer.routeBlock,route=block?.group.userData.route;if(!route)return;
  for(const id of ['storyPosition','storyName','storyPause','storyOrbitDuration'])if(!$('#'+id).reportValidity())return;
  const name=$('#storyName').value.trim();if(!name){showError('Donne un nom à cette étape.');$('#storyName').focus();return;}
  if(!storyEditingId&&storyPinsFor().length>=20){showError('Maximum 20 étapes par parcours et par montagne.');return;}
  const video=videoDraftFromEditor();if(video.video){const start=+$('#storyVideoStart').value,end=+$('#storyVideoEnd').value;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>video.videoDuration||end<=start||end-start>180){showError('Choisis un extrait valide de 180 secondes maximum, dans la durée de la vidéo.');return;}}
  const progress=clamp(Number($('#storyPosition').value)/100),sample=sampleRoute(route.motion,progress*route.motion.total),edge=route.motion.segments[sample.index];
  const geo=interpolateGeo(edge.fromGeo,edge.toGeo,sample.t);
  const pin={...video,id:storyEditingId||`pin-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,track:storyTrackKey,block:block.peak.id,lat:geo.lat,lon:geo.lon,progress,name,image:validMediaId(storyImageDraft),comment:$('#storyComment').value.trim(),pause:clamp(+$('#storyPause').value,0,30),angle:+$('#storyAngle').value,orbitDuration:clamp(+$('#storyOrbitDuration').value,2,30)};
  stopGpxAnimation();narrativePins=narrativePins.filter(p=>p.id!==pin.id);narrativePins.push(pin);setGpxProgress(progress);rebuildStoryPins();newStoryDraft();renderStoryEditor();saveProject();
}
function bindStoryControls(){
  bindStoryVideoControls();
  $('#storyPhoto').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const draft=storyDraftVersion,track=storyTrackKey,block=gpxPlayer.routeBlock;await withMedia(async()=>{const id=await importMedia(file);if(draft===storyDraftVersion&&track===storyTrackKey&&block===gpxPlayer.routeBlock){storyImageDraft=id;storyVideoDraft={};syncStoryPhoto();syncStoryVideoEditor();}});});
  $('#storyRemovePhoto').addEventListener('click',()=>{storyDraftVersion++;storyImageDraft='';syncStoryPhoto();});
  $('#storyEnabled').checked=globalSettings.storyEnabled;
  $('#storyEnabled').addEventListener('change',e=>{stopGpxAnimation();globalSettings.storyEnabled=e.target.checked;saveProject();});
  $('#storySave').addEventListener('click',saveStoryPin);$('#storyNew').addEventListener('click',newStoryDraft);
  $('#storyPosition').addEventListener('change',()=>{if(!gpxPlayer.routeBlock||!$('#storyPosition').checkValidity())return;stopGpxAnimation();setGpxProgress(clamp(+$('#storyPosition').value/100));});
  $('#storyPick').addEventListener('click',()=>{
    if(storyPicking){cancelStoryPick();return;}
    if(!gpxPlayer.routeBlock)return;stopGpxAnimation();storyPicking=true;canvas.style.cursor=storyPicking?'crosshair':'';
    $('#storyPick').textContent=storyPicking?'Annuler le placement':'Choisir un point sur la trace';if(storyPicking){setPanel(false);setPlaybackStatus('Touche la trace à l’endroit de l’étape · Échap pour annuler');}
  });
  let down=null;
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',e=>{
    if(!storyPicking||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;
    const block=gpxPlayer.routeBlock;if(!block)return;
    const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
    const hit=ray.intersectObject(block.group.userData.top)[0];if(!hit){showError('Touche la trace sur la montagne suivie.');return;}
    const closest=nearestRoutePoint(block.group.userData.route.motion,block.group.worldToLocal(hit.point.clone()),gpxPlayer.progress);
    if(!closest||closest.error>Math.max(.15,block.data.size*.025)){showError('Touche plus près du tracé GPX.');return;}
    setGpxProgress(closest.progress);$('#storyPosition').value=(closest.progress*100).toFixed(4);cancelStoryPick();setPanel(true);$('#gpxSection').open=true;$('#storyEditor').open=true;$('#storyName').focus();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&storyPicking)cancelStoryPick();});renderStoryEditor();
}
function cancelStoryPick(){storyPicking=false;canvas.style.cursor='';$('#storyPick').textContent='Choisir un point sur la trace';}
function beginStoryStop(pin){
  if(!gpxPlayer.follow){const damping=controls.enableDamping;releaseCamera();controls.enableDamping=damping;}
  if(!gpxPlayer.offset)captureFollowOffset();
  const target=worldRoutePoint(gpxPlayer.routeBlock,pin.point);target.y+=.08;
  const angle=videoStopPlan(pin)?.videoMode==='out'?0:pin.angle;
  const offset=gpxPlayer.offset.clone(),exitOffset=offset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(angle));
  story.visited.push(pin.id);story.active={pin,zoom:globalSettings.gpxFollowDistance,elapsed:0,duration:stopDuration(pin),target,offset,exitOffset,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),moveCamera:gpxPlayer.follow||Boolean(pin.angle)};
  gpxPlayer.phase='stop';controls.enabled=false;setPlaybackStatus(`Étape · ${pin.name}`);
}
function advanceStoryStop(delta){
  const a=story.active;if(!a)return;a.elapsed=Math.min(a.duration,a.elapsed+delta);a.zoom+=(globalSettings.gpxFollowDistance-a.zoom)*dampingAlpha(delta,.65);
  if(a.moveCamera){
    const plan=videoStopPlan(a.pin),orbitTime=plan?.videoMode==='out'?0:a.pin.angle?a.pin.orbitDuration:0,orbitStart=1.2+a.pin.pause,orbitEnd=orbitStart+orbitTime;
    const exitStart=plan?plan.exitAt+plan.exit:orbitEnd;
    const t=plan?(a.elapsed<plan.lead?a.elapsed:orbitEnd+Math.max(0,a.elapsed-exitStart)):a.elapsed;
    const progress=orbitTime?smootherstep((t-orbitStart)/orbitTime):0;
    const offset=a.offset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(a.pin.angle)*progress).multiplyScalar(a.zoom);
    const target=a.target.clone(),position=target.clone().add(offset);position.y=safeCameraHeight(position);
    if(t<1.2){const f=smootherstep(t/1.2);position.lerpVectors(a.fromPosition,position,f);target.lerpVectors(a.fromTarget,target,f);}
    else if(t>orbitEnd){const pose=followPose(a.exitOffset),f=smootherstep((t-orbitEnd)/1.2);position.lerp(pose.position,f);target.lerp(pose.target,f);}
    camera.position.copy(position);camera.position.y=safeCameraHeight(camera.position);controls.target.copy(target);camera.lookAt(target);
    controls.maxDistance=Math.max(controls.maxDistance,position.distanceTo(target)*1.2);camera.far=Math.max(camera.far,controls.maxDistance*2);camera.updateProjectionMatrix();
  }
  if(a.elapsed>=a.duration-1e-9){if(a.pin.video&&a.pin.videoMode==='in'){gpxPlayer.playing=false;gpxPlayer.paused=false;gpxPlayer.phase='video-end';$('#gpxPlayButton').textContent='▶ Reprendre le GPX';setPlaybackStatus('Fin de l’extrait · vidéo plein écran');return;}if(a.moveCamera)gpxPlayer.offset.copy(a.exitOffset);story.active=null;clearStoryVideo();gpxPlayer.phase='follow';controls.enabled=!gpxPlayer.follow;gpxPlayer.lastPart=null;setPlaybackStatus('Lecture · reprise du parcours');}
}
function updateStoryVisuals(){
  camera.updateMatrixWorld(true);const {width,height}=overlayDimensions();if(!width||!height)return;
  const unit=exportSettings?height/1080:1,margin=12*unit;
  blocks.forEach(block=>storyPinsFor(block).forEach(pin=>{
    const active=story.active?.pin.id===pin.id,material=pin.marker.children[0].material;
    material.depthTest=!active;pin.marker.children.forEach(child=>child.renderOrder=active?10000:0);
    pin.label.visible=pin.leader.visible=active;if(!active)return;
    if(pin.video){pin.label.visible=pin.leader.visible=false;return;}
    const w=Math.min((pin.image?310:230)*unit,width*.70,height*.45*(pin.image?900/1040:900/440)),h=w*(pin.image?1040:440)/900;
    const a=story.active,opacity=Math.min(1,(a.elapsed-.3)/.5,(a.duration-.5-a.elapsed)/.5);pin.label.material.opacity=pin.leader.material.opacity=clamp(opacity);
    const anchor=block.group.localToWorld(pin.point.clone().add(new THREE.Vector3(0,.22,0))),projected=anchor.clone().project(camera);
    if(projected.z<-1||projected.z>1){pin.label.visible=pin.leader.visible=false;return;}
    const x=clamp((projected.x+1)*width/2+35*unit+w/2,margin+w/2,width-margin-w/2),y=clamp((1-projected.y)*height/2-45*unit-h/2,margin+h/2,height-margin-h/2);
    placeOverlay(pin.label,block,x,y,w,h,width,height);
    const tipX=clamp((projected.x+1)*width/2,x-w*.4,x+w*.4);
    const tip=new THREE.Vector3(tipX/width*2-1,1-(y+h*.45)/height*2,0).unproject(camera),positions=pin.leader.geometry.attributes.position;
    positions.setXYZ(0,pin.point.x,pin.point.y+.22,pin.point.z);const local=block.group.worldToLocal(tip);positions.setXYZ(1,local.x,local.y,local.z);positions.needsUpdate=true;
  }));
}

function narrativeMediaIds(){return [...narrativePins.map(p=>p.image),...Array.from(blockSettings.values()).flatMap(c=>[c.bookCoverImage,...(c.bookPages||[]).map(p=>p.image)])].filter(Boolean);}
async function withMedia(action){
  mediaBusy++;$('#mediaStatus').textContent='Préparation du média…';
  try{await action();$('#mediaStatus').textContent='Média prêt et conservé sur cet appareil.';}
  catch(e){$('#mediaStatus').textContent=e.message;showError(e.message);}
  finally{mediaBusy--;}
}
async function hydrateNarrativeMedia(){
  if(!narrativeMediaIds().length&&!narrativePins.some(p=>p.video))return;
  await withMedia(async()=>{await prepareMedia(narrativeMediaIds());await prepareVideos(narrativePins.map(p=>p.video));refreshStatsBillboards();rebuildStoryPins();syncNotebookEditor();syncStoryPhoto();});
}
function syncStoryPhoto(){
  const preview=$('#storyPhotoPreview'),image=mediaImage(storyImageDraft);preview.hidden=!image;
  if(image){const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;canvas.getContext('2d').drawImage(image,0,0);preview.src=canvas.toDataURL('image/jpeg',.75);}else preview.removeAttribute('src');
  $('#storyRemovePhoto').disabled=!storyImageDraft;
}
function makeBookSpread(block,index){
  if(!index)return makeStatsCanvas(block);
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;
  const page=block.config.bookPages[index-1]||{};return paintBookSpread(canvas,page,mediaImage(page.image),index);
}
function currentNotebookBlock(){return blocks.find(b=>b.peak.id===$('#bookMountain').value);}
function syncNotebookEditor(){
  const select=$('#bookMountain'),previous=select.value;
  select.innerHTML=blocks.map(b=>`<option value="${escapeHtml(b.peak.id)}">${escapeHtml(b.peak.name)}</option>`).join('');
  if(blocks.some(b=>b.peak.id===previous))select.value=previous;
  renderNotebookEditor();
}
function renderNotebookEditor(){
  const block=currentNotebookBlock(),available=!!block;
  for(const id of ['bookAdd','bookFocus','bookPlay','bookAddShot'])$('#'+id).disabled=!available;
  if(!available){$('#bookPageFields').hidden=true;return;}
  const c=block.config,index=clamp(c.bookIndex||0,0,c.bookPages.length);c.bookIndex=index;
  $('#bookPage').innerHTML=['Statistiques de l’ascension',...c.bookPages.map((p,i)=>`${i+1}. ${(p.chapter?p.chapter+' · ':'')+(p.title||'Nouvelle double page')}`)].map((name,i)=>`<option value="${i}">${escapeHtml(name)}</option>`).join('');$('#bookPage').value=index;
  $('#bookOpenAtStart').checked=c.bookOpenAtStart;$('#bookCloseAtEnd').checked=c.bookCloseAtEnd;$('#bookCoverTitle').value=c.bookCoverTitle;$('#bookCoverSubtitle').value=c.bookCoverSubtitle;$('#bookCoverColor').value=c.bookCoverColor;$('#bookRemoveCoverPhoto').disabled=!c.bookCoverImage;
  const coverPreview=$('#bookCoverPreview');coverPreview.getContext('2d').drawImage(makeCoverCanvas(block),0,0,coverPreview.width,coverPreview.height);
  $('#bookHold').value=c.bookHold;$('#bookPageFields').hidden=index===0;
  const p=c.bookPages[index-1]||{};$('#bookChapter').value=p.chapter||'';$('#bookTitle').value=p.title||'';$('#bookText').value=p.text||'';$('#bookCaption').value=p.caption||'';$('#bookRemovePhoto').disabled=!p.image;
  const preview=$('#bookPreview');preview.getContext('2d').drawImage(makeBookSpread(block,index),0,0,preview.width,preview.height);
  $('#bookPrevious').disabled=index===0;$('#bookNext').disabled=index===c.bookPages.length;
  $('#bookPageStatus').textContent=`Double page ${index+1} / ${c.bookPages.length+1}${index===0?' · contenu des statistiques du sommet':''}`;
}
function showNotebook(block){
  if(!block.config.showStats){block.config.showStats=true;refreshStatsBillboards();syncBlockEditor();if(!exportSettings)saveProject();}
  if(!block.group.userData.statsCard)refreshStatsBillboards();
  return block.group.userData.statsCard;
}
function notebookCameraPose(id,openness=1){
  const block=blocks.find(b=>b.peak.id===id);if(!block)throw Error('Ce carnet n’est plus dans la scène.');
  const book=showNotebook(block);book.updateWorldMatrix(true,true);
  const target=book.localToWorld(new THREE.Vector3(book.userData.width*.25*(1-openness),.22,0));
  const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect);
  const distance=Math.max(book.userData.width*(.5+.5*openness)/(2*Math.tan(hfov/2)),book.userData.height/(2*Math.tan(vfov/2)))*1.35;
  const direction=new THREE.Vector3(0,.94,.34).applyQuaternion(book.getWorldQuaternion(new THREE.Quaternion()));
  return {position:target.clone().addScaledVector(direction,distance),target};
}
function normalizeBookShot(shot){
  if(shot.type!=='book')return shot;
  const block=blocks.find(b=>b.peak.id===shot.from);if(!block)throw Error('Choisis la montagne du carnet.');
  const hold=clamp(Number(shot.hold)||block.config.bookHold||7,4,20),count=block.config.bookPages.length+1;
  const openBook=block.config.bookOpenAtStart,closeBook=block.config.bookCloseAtEnd;return {...shot,hold,pageCount:count,openBook,closeBook,duration:bookNarrationDuration(count,hold,{openBook,closeBook})};
}
function advanceBookTurns(delta){
  blocks.forEach(block=>{
    const book=block.group.userData.statsCard;if(!book)return;const cover=book.userData.manualCover;if(cover){cover.elapsed=Math.min(cover.duration,cover.elapsed+delta);book.userData.setOpenness(cover.from+(cover.to-cover.from)*smootherstep(cover.elapsed/cover.duration));if(cover.elapsed>=cover.duration)book.userData.manualCover=null;}
    const a=book.userData.manualTurn;if(!a)return;
    a.elapsed=Math.min(PAGE_TURN_SECONDS,a.elapsed+delta);const t=a.elapsed/PAGE_TURN_SECONDS;
    book.userData.setState(a.base,a.reverse?1-t:t);
    if(t>=1){book.userData.manualTurn=null;book.userData.setState(a.target);if(!exportSettings){block.config.bookIndex=a.target;saveProject();if(block===currentNotebookBlock())renderNotebookEditor();}}
  });
}
function turnNotebook(direction){
  const block=currentNotebookBlock();if(!block)return;
  const book=showNotebook(block);if(book.userData.manualTurn||book.userData.manualCover)return;
  if(book.userData.openness<.999){animateNotebookCover(1);return;}
  stopCinema();stopGpxAnimation();const index=book.userData.index,target=index+direction;
  if(target<0||target>=book.userData.spreadCount)return;
  book.userData.manualTurn={base:Math.min(index,target),target,reverse:direction<0,elapsed:0};
  $('#bookPrevious').disabled=$('#bookNext').disabled=true;
}
function bindNotebookControls(){
  bindCoverControls();
  $('#bookMountain').addEventListener('change',renderNotebookEditor);
  $('#bookPage').addEventListener('change',()=>{const b=currentNotebookBlock();if(!b)return;stopCinema();b.config.bookIndex=+$('#bookPage').value;const book=showNotebook(b);book.userData.manualTurn=null;book.userData.setState(b.config.bookIndex);book.userData.setOpenness(1);renderNotebookEditor();saveProject();});
  $('#bookFocus').addEventListener('click',()=>{const b=currentNotebookBlock();if(!b)return;stopCinema();stopGpxAnimation();beginCameraTransition(notebookCameraPose(b.peak.id),2.4,'notebook',()=>{gpxPlayer.phase='idle';releaseCamera();});setPanel(false);});
  $('#bookPrevious').addEventListener('click',()=>turnNotebook(-1));$('#bookNext').addEventListener('click',()=>turnNotebook(1));
  $('#bookAdd').addEventListener('click',()=>{const b=currentNotebookBlock();if(!b)return;if(b.config.bookPages.length>=12){showError('Maximum 12 doubles pages personnalisées par carnet.');return;}stopCinema();b.config.bookPages.push({title:'',text:'',caption:'',image:''});b.config.bookIndex=b.config.bookPages.length;showNotebook(b);refreshStatsBillboards();renderNotebookEditor();saveProject();});
  const savePage=()=>{const b=currentNotebookBlock(),p=b?.config.bookPages[b.config.bookIndex-1];if(!p)return;stopCinema();Object.assign(p,{chapter:$('#bookChapter').value.trim(),title:$('#bookTitle').value.trim(),text:$('#bookText').value.trim(),caption:$('#bookCaption').value.trim()});refreshStatsBillboards();renderNotebookEditor();saveProject();};
  $('#bookSave').addEventListener('click',savePage);
  // Save on leaving a field too, so choosing another page does not lose text.
  for(const id of ['bookChapter','bookTitle','bookText','bookCaption'])$('#'+id).addEventListener('change',savePage);
  $('#bookDelete').addEventListener('click',()=>{const b=currentNotebookBlock();if(!b||!b.config.bookIndex)return;stopCinema();b.config.bookPages.splice(b.config.bookIndex-1,1);b.config.bookIndex=Math.min(b.config.bookIndex,b.config.bookPages.length);refreshStatsBillboards();renderNotebookEditor();saveProject();});
  $('#bookPhoto').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';const b=currentNotebookBlock(),p=b?.config.bookPages[b.config.bookIndex-1];if(!file||!p)return;await withMedia(async()=>{const id=await importMedia(file);if(!b.config.bookPages.includes(p))return;stopCinema();p.image=id;refreshStatsBillboards();renderNotebookEditor();saveProject();});});
  $('#bookRemovePhoto').addEventListener('click',()=>{const b=currentNotebookBlock(),p=b?.config.bookPages[b.config.bookIndex-1];if(!p)return;p.image='';stopCinema();refreshStatsBillboards();renderNotebookEditor();saveProject();});
  $('#bookHold').addEventListener('change',()=>{const b=currentNotebookBlock();if(b){b.config.bookHold=+$('#bookHold').value;saveProject();}});
  const reading=()=>{const b=currentNotebookBlock();if(!b)throw Error('Choisis un carnet.');return normalizeBookShot({type:'book',from:b.peak.id,hold:b.config.bookHold});};
  $('#bookPlay').addEventListener('click',()=>{try{startCinema([reading()]);setPanel(false);}catch(e){showError(e.message);}});
  $('#bookAddShot').addEventListener('click',()=>{try{const shot=reading();if(cameraShots.reduce((n,s)=>n+normalizeBookShot(s).duration,0)+shot.duration>295)throw Error('La composition dépasse 295 secondes. Réduis les temps de lecture.');cameraShots.push(shot);renderShotList();saveProject();$('#bookPageStatus').textContent='Lecture ajoutée aux Outils caméra.';}catch(e){showError(e.message);}});
  syncNotebookEditor();
}

function restoreProjectControls(){
  const saved=projectSession.current?.snapshot;
  $('#gpxDuration').value=gpxPlayer.duration;
  if(gpxTrack.length){const stats=trackStats(gpxTrack);$('#gpxStats').textContent=`${gpxSource?.name||'Parcours mémorisé'} · ${gpxTrack.length.toLocaleString('fr-CH')} points · ${stats.distance.toFixed(1)} km`;$('#gpxStats').classList.add('loaded');}
  for(const [id,value] of Object.entries(saved?.exportOptions||{})){const input=$('#'+id);if(input?.tagName==='SELECT'&&[...input.options].some(o=>o.value===String(value)))input.value=value;}
  for(const id of ['gpxDuration','gpxFollowToggle','gpxTarget','gpxProgress','exportResolution','exportOrientation','exportFps','exportMotion','exportDuration','exportCodec'])$('#'+id).addEventListener('change',saveProject);
}

function makeCoverCanvas(block){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;const c=block.config;return paintBookCover(canvas,{title:c.bookCoverTitle||block.peak.name,subtitle:c.bookCoverSubtitle,color:c.bookCoverColor},mediaImage(c.bookCoverImage));}
function animateNotebookCover(to){const b=currentNotebookBlock();if(!b)return;stopCinema();stopGpxAnimation();const book=showNotebook(b);if(book.userData.manualTurn)return;book.userData.manualCover={from:book.userData.openness,to,elapsed:0,duration:to?BOOK_OPEN_SECONDS:BOOK_CLOSE_SECONDS};}
function bindCoverControls(){
  const save=()=>{const b=currentNotebookBlock();if(!b)return;stopCinema();Object.assign(b.config,{bookOpenAtStart:$('#bookOpenAtStart').checked,bookCloseAtEnd:$('#bookCloseAtEnd').checked,bookCoverTitle:$('#bookCoverTitle').value.trim(),bookCoverSubtitle:$('#bookCoverSubtitle').value.trim(),bookCoverColor:$('#bookCoverColor').value});refreshStatsBillboards();renderNotebookEditor();saveProject();};
  for(const id of ['bookOpenAtStart','bookCloseAtEnd','bookCoverTitle','bookCoverSubtitle','bookCoverColor'])$('#'+id).addEventListener('change',save);
  $('#bookOpenPreview').addEventListener('click',()=>animateNotebookCover(1));$('#bookClosePreview').addEventListener('click',()=>animateNotebookCover(0));
  $('#bookCoverPhoto').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';const b=currentNotebookBlock();if(!file||!b)return;await withMedia(async()=>{const id=await importMedia(file);stopCinema();b.config.bookCoverImage=id;refreshStatsBillboards();renderNotebookEditor();saveProject();});});
  $('#bookRemoveCoverPhoto').addEventListener('click',()=>{const b=currentNotebookBlock();if(!b)return;b.config.bookCoverImage='';stopCinema();refreshStatsBillboards();renderNotebookEditor();saveProject();});
}

function videoDraftFromEditor(){return cleanPinVideo({...storyVideoDraft,videoMode:$('#storyVideoMode').value,videoStart:+$('#storyVideoStart').value,videoEnd:+$('#storyVideoEnd').value,videoTransition:+$('#storyVideoTransition').value});}
function syncStoryVideoEditor(){
  const d=storyVideoDraft,v=mediaVideo(d.video),preview=$('#storyVideoPreview');preview.pause();preview.hidden=!v;$('#storyVideoOptions').hidden=!d.video;
  if(v){if(preview.src!==v.src)preview.src=v.src;}else preview.removeAttribute('src');
  $('#storyVideoStatus').textContent=d.video?`${d.videoName} · ${d.videoDuration.toFixed(1)} s · enregistre l’étape pour conserver ce choix`:'';
  $('#storyVideoMode').value=d.videoMode||'in-out';$('#storyVideoStart').value=d.videoStart||0;$('#storyVideoEnd').value=d.videoEnd||10;$('#storyVideoEnd').max=d.videoDuration||180;$('#storyVideoTransition').value=d.videoTransition||2;
}
function bindStoryVideoControls(){
  $('#storyVideo').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const draft=storyDraftVersion,track=storyTrackKey,block=gpxPlayer.routeBlock;
    await withMedia(async()=>{const media=await importVideo(file);if(draft!==storyDraftVersion||track!==storyTrackKey||block!==gpxPlayer.routeBlock)return;storyVideoDraft=cleanPinVideo({video:media.id,videoName:media.name,videoDuration:media.duration,videoEnd:Math.min(10,media.duration)});storyImageDraft='';syncStoryPhoto();syncStoryVideoEditor();});
  });
  $('#storyRemoveVideo').addEventListener('click',()=>{storyDraftVersion++;storyVideoDraft={};syncStoryVideoEditor();});
  $('#storyPlayFrom').addEventListener('click',()=>{try{const pin=storyPinsFor().find(p=>p.id===storyEditingId);if(!pin)throw Error('Enregistre puis sélectionne cette étape.');validateStoryVideos();startFromStoryPin(pin);}catch(e){showError(e.message);}});
  window.addEventListener('pagehide',()=>{$('#storyVideoPreview').pause();});
}
function validateStoryVideos(){for(const p of storyPinsFor()){if(!p.video)continue;const v=mediaVideo(p.video);if(!v)throw Error('Attends le chargement des vidéos du projet.');if(p.videoEnd>v.duration+.05)throw Error(`L’extrait de « ${p.name} » dépasse la durée de la vidéo.`);}}
function startFromStoryPin(pin){
  stopGpxAnimation();setGpxProgress(pin.progress);captureFollowOffset();story.visited=storyPinsFor().filter(p=>p.progress<pin.progress-1e-9||p.progress===pin.progress&&p.id.localeCompare(pin.id)<0).map(p=>p.id);
  gpxPlayer.playing=true;gpxPlayer.paused=false;controls.autoRotate=false;$('#gpxPlayButton').textContent='❚❚ Pause';beginStoryStop(pin);
}
function clearStoryVideo(){const c=$('#storyVideoCanvas');if(c)c.hidden=true;stage.classList.remove('video-full');}
async function renderStoryVideo(output){
  const active=story.active,state=active&&samplePinVideo(active.pin,active.elapsed);if(!state){if(!output)clearStoryVideo();return;}
  const elapsed=active.elapsed,video=await seekVideo(state.id,state.time);
  if(!output&&(exportSettings||story.active!==active||active.elapsed!==elapsed))return;
  const width=output?output.canvas.width:Math.max(1,Math.round(stage.clientWidth*renderer.getPixelRatio())),height=output?output.canvas.height:Math.max(1,Math.round(stage.clientHeight*renderer.getPixelRatio()));
  const overlay=$('#storyVideoCanvas');let ctx=output;
  if(!ctx){if(overlay.width!==width||overlay.height!==height){overlay.width=width;overlay.height=height;}ctx=overlay.getContext('2d');ctx.clearRect(0,0,width,height);overlay.hidden=false;stage.classList.toggle('video-full',state.expand>.999);}
  camera.updateMatrixWorld(true);const anchor=worldRoutePoint(gpxPlayer.routeBlock,active.pin.point).project(camera),point={x:(anchor.x+1)*width/2,y:(1-anchor.y)*height/2};
  const rect=videoScreenRect(point,width,height,state.expand,video.videoWidth/video.videoHeight);
  if(state.expand<.999){ctx.save();ctx.globalAlpha=state.opacity*(1-state.expand);ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,height/1080);ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(rect.x+rect.width/2,rect.y+rect.height);ctx.stroke();ctx.restore();}
  drawVideoFrame(ctx,video,rect,state.opacity);
  if(state.expand<.98){ctx.save();ctx.globalAlpha=state.opacity*(1-state.expand);ctx.fillStyle='white';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.font=`600 ${Math.max(12,height/50)}px sans-serif`;ctx.fillText(active.pin.name,rect.x+10,rect.y+rect.height-12,rect.width-20);ctx.restore();}
}
