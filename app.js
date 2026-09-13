import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
const CLOUD_TEXTURES = new Map();
const $ = selector => document.querySelector(selector);

const globalSettings = {
  quality:'high', exaggeration:1, brightness:1.25,
  sunAzimuth:315, sunElevation:38, sunIntensity:3.2,
  clouds:true, cloudDensity:8, cloudDetail:2, cloudOpacity:.7, cloudSize:1,
  shadows:true
};
const blockSettings = new Map();
let peaks = [...PEAKS];
let selected = ['chavalard','lagginhorn'];
let editorPeakId = selected[0];
let blocks = [];
let gpxTrack = [];
let buildVersion = 0;
let rebuildTimer;
let sideMaterial;
let floor;
let cloudTime = 0;

const gpxPlayer = { playing:false, progress:0, duration:25, follow:true, routeBlock:null };

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
controls.minDistance = 5;
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
sun.shadow.bias = -.00018;
sun.shadow.normalBias = .025;
scene.add(sun);
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
requestAnimationFrame(animate);

function defaultBlockSettings(){
  return { diameter:12, centerEast:0, centerNorth:0, comment:'', showStats:true, manualDistance:'', manualGain:'', manualDuration:'', manualDate:'', manualNotes:'' };
}

function settingsFor(id){
  if(!blockSettings.has(id)) blockSettings.set(id, defaultBlockSettings());
  return blockSettings.get(id);
}

function activePeaks(){
  return selected.map(id => peaks.find(peak => peak.id === id)).filter(Boolean);
}

function setupEnvironment(){
  const floorTexture = makeGroundTexture();
  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 140),
    new THREE.MeshStandardMaterial({ map:floorTexture, color:0x727d7f, roughness:.91, metalness:0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = BASE_Y - .035;
  floor.receiveShadow = true;
  scene.add(floor);
  sideMaterial = new THREE.MeshStandardMaterial({ map:makeStoneTexture(), color:0x8e8577, roughness:.98, metalness:0, side:THREE.DoubleSide });
}

function makeGroundTexture(){
  const c=document.createElement('canvas'); c.width=c.height=768;
  const ctx=c.getContext('2d'), gradient=ctx.createLinearGradient(0,0,768,768);
  gradient.addColorStop(0,'#69777a'); gradient.addColorStop(.5,'#3d4c52'); gradient.addColorStop(1,'#26363d');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,768,768);
  const rng=seededRandom(8821);
  for(let i=0;i<2400;i++){ctx.fillStyle=`rgba(230,241,242,${rng()*.045})`;const x=rng()*768,y=rng()*768,r=.25+rng()*1.15;ctx.fillRect(x,y,r,r)}
  const texture=new THREE.CanvasTexture(c); texture.colorSpace=THREE.SRGBColorSpace; texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.repeat.set(8,5); return texture;
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
  const list=activePeaks(), section=$('#blockEditorSection'), select=$('#blockPeakSelect');
  section.hidden=!list.length;
  if(!list.length) return;
  if(!list.some(peak=>peak.id===editorPeakId)) editorPeakId=list[0].id;
  select.innerHTML=list.map(peak=>`<option value="${peak.id}" ${peak.id===editorPeakId?'selected':''}>${escapeHtml(peak.name)}</option>`).join('');
  const config=settingsFor(editorPeakId);
  $('#blockDiameter').value=config.diameter; $('#blockDiameterValue').value=`${config.diameter} km`;
  const maxOffset=Math.max(1,config.diameter/2-.75);
  for(const id of ['blockEast','blockNorth']){$('#'+id).min=-maxOffset;$('#'+id).max=maxOffset}
  $('#blockEast').value=config.centerEast; $('#blockEastValue').value=formatSigned(config.centerEast,' km');
  $('#blockNorth').value=config.centerNorth; $('#blockNorthValue').value=formatSigned(config.centerNorth,' km');
  $('#blockComment').value=config.comment; $('#blockStatsToggle').checked=config.showStats;
  $('#distance').value=config.manualDistance; $('#gain').value=config.manualGain; $('#duration').value=config.manualDuration; $('#date').value=config.manualDate; $('#notes').value=config.manualNotes;
}

async function rebuildScene(){
  const version=++buildVersion;
  stopGpxAnimation();
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
      const data=await loadPeakData(list[i],config,quality,version);
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
  refreshStatsBillboards();
  fitCamera();
  hideLoading();
  if(results.some(Boolean)&&results.some(value=>!value)) showError('Certaines découpes n’ont pas chargé. Vérifie la connexion puis modifie légèrement un réglage pour réessayer.');
}

function clearBlocks(){
  blocks.forEach(block=>{
    scene.remove(block.group);
    block.group.traverse(object=>{
      object.geometry?.dispose();
      if(object.material && object.material!==sideMaterial){
        (Array.isArray(object.material)?object.material:[object.material]).forEach(material=>{
          if(material.map && ![...CLOUD_TEXTURES.values()].includes(material.map)) material.map.dispose();
          material.dispose?.();
        });
      }
    });
  });
  blocks=[]; $('#peakLabels').innerHTML=''; gpxPlayer.routeBlock=null;
}

async function loadPeakData(peak,config,quality,version){
  const bounds=boundsAround(peak,config);
  const zoom=config.diameter>17?Math.min(13,quality.elevationZoom):quality.elevationZoom;
  const elevationPromise=composeTiles(bounds,zoom,quality.elevationCanvas,(z,x,y)=>[
    `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`,
    `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
  ],false);
  const imageryPromise=loadImagery(bounds,quality);
  const [elevationCanvas,imageryCanvas]=await Promise.all([elevationPromise,imageryPromise]);
  if(version!==buildVersion) throw Error('cancelled');
  const pixels=elevationCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,elevationCanvas.width,elevationCanvas.height).data;
  const grid=quality.grid, heights=new Float32Array((grid+1)*(grid+1));
  for(let row=0;row<=grid;row++) for(let col=0;col<=grid;col++){
    const px=Math.min(elevationCanvas.width-1,Math.round(col/grid*(elevationCanvas.width-1)));
    const py=Math.min(elevationCanvas.height-1,Math.round(row/grid*(elevationCanvas.height-1)));
    const index=(py*elevationCanvas.width+px)*4;
    let height=pixels[index]*256+pixels[index+1]+pixels[index+2]/256-32768;
    if(!Number.isFinite(height)||height< -500) height=0;
    heights[row*(grid+1)+col]=height;
  }
  return {bounds,heights,grid,size:config.diameter,textureCanvas:applyOrganicMask(imageryCanvas,hash(peak.id))};
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
  const geometry=createTopGeometry(data), texture=new THREE.CanvasTexture(data.textureCanvas);
  texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=renderer.capabilities.getMaxAnisotropy(); texture.minFilter=THREE.LinearMipmapLinearFilter; texture.magFilter=THREE.LinearFilter;
  const material=new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.87,metalness:0,alphaTest:.45});
  const top=new THREE.Mesh(geometry,material); top.castShadow=top.receiveShadow=globalSettings.shadows;
  top.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:texture,alphaTest:.45});
  group.add(top);
  const outline=organicOutline(hash(peak.id)), side=createSides(data,outline); side.castShadow=side.receiveShadow=globalSettings.shadows; group.add(side);
  const bottom=createBottom(outline,data.size); bottom.receiveShadow=true; group.add(bottom);
  const summitLocal=localPointForGeo(peak,data,peak.elevation);
  const summitMarker=createSummitMarker(summitLocal); group.add(summitMarker);
  const clouds=createClouds(peak,data.size); group.add(clouds);
  group.userData={peak,config,data,top,side,bottom,summitMarker,summitLocal,clouds,label:null,route:null,routeStats:null,statsCard:null,statsLeader:null};
  scene.add(group); return {group,peak,config,data};
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

function getCloudTexture(detail){
  if(CLOUD_TEXTURES.has(detail)) return CLOUD_TEXTURES.get(detail);
  const size=detail===1?256:detail===2?384:512, canvas=document.createElement('canvas'); canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'),rng=seededRandom(9384+detail),puffs=detail===1?20:detail===2?38:62;
  for(let i=0;i<puffs;i++){
    const x=size*(.17+rng()*.66),y=size*(.27+rng()*.48),radius=size*(.08+rng()*.17),gradient=ctx.createRadialGradient(x,y,0,x,y,radius);
    gradient.addColorStop(0,'rgba(255,255,255,.72)'); gradient.addColorStop(.28,'rgba(252,254,255,.55)'); gradient.addColorStop(.68,'rgba(239,247,250,.18)'); gradient.addColorStop(1,'rgba(230,241,246,0)');
    ctx.fillStyle=gradient; ctx.fillRect(0,0,size,size);
  }
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.minFilter=THREE.LinearMipmapLinearFilter; CLOUD_TEXTURES.set(detail,texture); return texture;
}

function createClouds(peak,size){
  const root=new THREE.Group(),rng=seededRandom(hash(peak.id)+117),texture=getCloudTexture(globalSettings.cloudDetail),puffsPerCluster=[0,2,4,7][globalSettings.cloudDetail];
  root.name='clouds';
  for(let clusterIndex=0;clusterIndex<globalSettings.cloudDensity;clusterIndex++){
    const cluster=new THREE.Group(),angle=rng()*Math.PI*2,radius=size*(.11+rng()*.37);
    cluster.position.set(Math.cos(angle)*radius,1.15+rng()*2.25,Math.sin(angle)*radius);
    cluster.userData={startX:cluster.position.x,startZ:cluster.position.z,phase:rng()*Math.PI*2,speed:.055+rng()*.085};
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,opacity:globalSettings.cloudOpacity,depthWrite:false,color:0xffffff});
    for(let puff=0;puff<puffsPerCluster;puff++){
      const sprite=new THREE.Sprite(material),base=(.72+rng()*.7)*globalSettings.cloudSize;
      sprite.position.set((rng()-.5)*1.05*globalSettings.cloudSize,(rng()-.5)*.42*globalSettings.cloudSize,(rng()-.5)*.8*globalSettings.cloudSize);
      sprite.scale.set(base*(1.45+rng()*.65),base*(.65+rng()*.42),1); cluster.add(sprite);
    }
    cluster.userData.material=material; root.add(cluster);
  }
  root.visible=globalSettings.clouds; return root;
}

function refreshClouds(){
  blocks.forEach(block=>{
    const old=block.group.userData.clouds; block.group.remove(old);
    old.children.forEach(cluster=>cluster.userData.material?.dispose());
    const clouds=createClouds(block.peak,block.data.size); block.group.add(clouds); block.group.userData.clouds=clouds;
  });
}

function positionBlocks(){
  const gap=1.15, total=blocks.reduce((sum,block)=>sum+block.data.size,0)+gap*Math.max(0,blocks.length-1);
  let cursor=-total/2;
  blocks.forEach(block=>{block.group.position.x=cursor+block.data.size/2;cursor+=block.data.size+gap});
}

function createPeakLabels(){
  $('#peakLabels').innerHTML='';
  blocks.forEach(block=>{
    const label=document.createElement('div'); label.className='peak-label'; label.innerHTML=`<span class="label-card"><b>${escapeHtml(block.peak.name)}</b><span>${block.peak.elevation.toLocaleString('fr-CH')} m</span></span>`;
    $('#peakLabels').appendChild(label); block.group.userData.label=label;
  });
}

function updatePeakLabels(){
  const width=stage.clientWidth,height=stage.clientHeight;
  blocks.forEach(block=>{
    const label=block.group.userData.label;if(!label)return;
    const vector=block.group.userData.summitLocal.clone(); vector.y+=.34; block.group.localToWorld(vector); vector.project(camera);
    label.style.left=`${(vector.x*.5+.5)*width}px`; label.style.top=`${(-vector.y*.5+.5)*height}px`; label.style.display=vector.z>1?'none':'';
  });
}

function makeStatsCanvas(block){
  const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=600;
  const ctx=canvas.getContext('2d');
  roundedRect(ctx,18,18,988,564,42); ctx.fillStyle='rgba(5,14,21,.93)';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='rgba(145,224,244,.55)';ctx.stroke();
  ctx.fillStyle='#92e0f4';ctx.font='700 25px Manrope, sans-serif';ctx.fillText('SOMMET ACCOMPLI',62,78);
  ctx.fillStyle='#f2f7f8';ctx.font='700 52px Manrope, sans-serif';ctx.fillText(block.peak.name,62,146);
  ctx.fillStyle='#e7bb73';ctx.font='700 44px Manrope, sans-serif';ctx.fillText(`${block.peak.elevation.toLocaleString('fr-CH')} m`,62,205);
  const stats=block.group.userData.routeStats,config=block.config;
  const distance=stats?`${stats.distance.toFixed(1)} km`:config.manualDistance?`${config.manualDistance} km`:'—';
  const gain=stats?`+${Math.round(stats.gain).toLocaleString('fr-CH')} m`:config.manualGain?`+${config.manualGain} m`:'—';
  const duration=stats?.duration?formatDuration(stats.duration):config.manualDuration||'—';
  drawMetric(ctx,62,268,'DISTANCE',distance);drawMetric(ctx,360,268,'DÉNIVELÉ +',gain);drawMetric(ctx,674,268,'DURÉE',duration);
  const comment=(config.comment||config.manualNotes||'Aucun commentaire').trim();
  ctx.fillStyle='#7793a2';ctx.font='700 20px Manrope, sans-serif';ctx.fillText('COMMENTAIRE',62,406);
  ctx.fillStyle='#d7e5ea';ctx.font='500 27px DM Sans, sans-serif';wrapText(ctx,comment,62,452,890,35,3);
  return canvas;
}

function drawMetric(ctx,x,y,label,value){ctx.fillStyle='#718c9b';ctx.font='700 18px Manrope, sans-serif';ctx.fillText(label,x,y);ctx.fillStyle='#eef6f8';ctx.font='700 31px Manrope, sans-serif';ctx.fillText(value,x,y+42)}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines){const words=text.split(/\s+/);let line='',lines=[];for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);lines.slice(0,maxLines).forEach((value,index)=>{let output=value;if(index===maxLines-1&&lines.length>maxLines)output=output.replace(/[.,;:]?$/,'…');ctx.fillText(output,x,y+index*lineHeight)})}

function refreshStatsBillboards(){
  blocks.forEach(block=>{
    const data=block.group.userData;
    if(data.statsCard){block.group.remove(data.statsCard);data.statsCard.material.map.dispose();data.statsCard.material.dispose();data.statsCard=null}
    if(data.statsLeader){block.group.remove(data.statsLeader);data.statsLeader.geometry.dispose();data.statsLeader.material.dispose();data.statsLeader=null}
    if(!block.config.showStats)return;
    const texture=new THREE.CanvasTexture(makeStatsCanvas(block));texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
    const card=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
    const width=Math.min(5.2,Math.max(3.7,block.data.size*.38));card.scale.set(width,width*600/1024,1);
    const summit=data.summitLocal,side= summit.x>0?-1:1;
    card.position.set(side*block.data.size*.28,Math.max(1.8,summit.y*.64),block.data.size*.31);card.renderOrder=20;card.name='stats-card';block.group.add(card);data.statsCard=card;
    const start=summit.clone().add(new THREE.Vector3(0,.12,0)),end=card.position.clone();end.x-=side*width*.44;
    const leader=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineBasicMaterial({color:0x92e0f4,transparent:true,opacity:.5,depthTest:false}));leader.renderOrder=19;block.group.add(leader);data.statsLeader=leader;
  });
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
  controls.enabled=true;controls.target.set(0,1.45,0);camera.position.set(width*.12,Math.max(7,distance*.38),distance);camera.lookAt(controls.target);controls.update();
}

function updateVerticalScale(){
  blocks.forEach(block=>{
    const {data}=block,position=block.group.userData.top.geometry.attributes.position;
    for(let i=0;i<data.heights.length;i++) position.setY(i,data.heights[i]/1000*globalSettings.exaggeration);
    position.needsUpdate=true;block.group.userData.top.geometry.computeVertexNormals();
    const sidePosition=block.group.userData.side.geometry.attributes.position,outline=block.group.userData.side.geometry.userData.outline;
    outline.forEach((point,index)=>sidePosition.setY(index*2+1,sampleGrid(data,point.x*.5+.5,point.z*.5+.5)/1000*globalSettings.exaggeration));
    sidePosition.needsUpdate=true;block.group.userData.side.geometry.computeVertexNormals();
    const summit=localPointForGeo(block.peak,data,block.peak.elevation);block.group.userData.summitLocal.copy(summit);block.group.userData.summitMarker.position.copy(summit).add(new THREE.Vector3(0,.025,0));
  });
  buildGpxRoutes();refreshStatsBillboards();
}

function parseGpx(text){
  const documentXml=new DOMParser().parseFromString(text,'application/xml');
  if(documentXml.querySelector('parsererror'))throw Error('Le fichier GPX est invalide.');
  const points=[...documentXml.querySelectorAll('trkpt,rtept')].map(node=>({lat:+node.getAttribute('lat'),lon:+node.getAttribute('lon'),ele:Number(node.querySelector('ele')?.textContent),time:Date.parse(node.querySelector('time')?.textContent||'')})).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lon));
  if(points.length<2)throw Error('Aucune trace exploitable dans ce GPX.');return points;
}

function trackStats(points){
  let distance=0,gain=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,h=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    distance+=12742*Math.asin(Math.sqrt(h));if(Number.isFinite(a.ele)&&Number.isFinite(b.ele)&&b.ele>a.ele)gain+=b.ele-a.ele;
  }
  const duration=Number.isFinite(points[0]?.time)&&Number.isFinite(points.at(-1)?.time)?Math.max(0,(points.at(-1).time-points[0].time)/1000):0;
  return{distance,gain,duration};
}

function buildGpxRoutes(){
  let bestBlock=null,bestCount=0;
  blocks.forEach(block=>{
    const data=block.group.userData,old=data.route;
    if(old){block.group.remove(old.line);old.geometry.dispose();old.material.dispose();data.route=null;data.routeStats=null}
    if(!gpxTrack.length)return;
    let points=gpxTrack.filter(point=>point.lon>=block.data.bounds.west&&point.lon<=block.data.bounds.east&&point.lat>=block.data.bounds.south&&point.lat<=block.data.bounds.north);
    if(points.length<2)return;
    const stats=trackStats(points),stride=Math.max(1,Math.ceil(points.length/1600));points=points.filter((_,index)=>index%stride===0||index===points.length-1);
    const coords=points.map(point=>localPointForGeo(point,block.data,Number.isFinite(point.ele)?point.ele:undefined).add(new THREE.Vector3(0,.055,0)));
    const geometry=new THREE.BufferGeometry().setFromPoints(coords),material=new THREE.LineBasicMaterial({color:0x42e4ff,depthTest:true,transparent:true,opacity:1}),line=new THREE.Line(geometry,material);
    line.name='gpx-route';line.renderOrder=8;line.frustumCulled=false;block.group.add(line);data.route={line,geometry,material,coords,sourcePoints:points};data.routeStats=stats;
    if(coords.length>bestCount){bestCount=coords.length;bestBlock=block}
  });
  gpxPlayer.routeBlock=bestBlock;setGpxProgress(gpxPlayer.progress,false);
  const available=Boolean(bestBlock);$('#gpxPlayButton').disabled=!available;$('#gpxProgress').disabled=!available;
  refreshStatsBillboards();
}

function setGpxProgress(progress,moveCamera=true){
  gpxPlayer.progress=Math.max(0,Math.min(1,progress));
  blocks.forEach(block=>{const route=block.group.userData.route;if(route)route.geometry.setDrawRange(0,Math.max(1,Math.ceil(route.coords.length*gpxPlayer.progress)))});
  $('#gpxProgress').value=Math.round(gpxPlayer.progress*1000);$('#gpxProgressValue').value=`${Math.round(gpxPlayer.progress*100)} %`;
  if(moveCamera&&gpxPlayer.follow&&gpxPlayer.routeBlock)updateFollowCamera(true);
}

function toggleGpxAnimation(){
  if(!gpxPlayer.routeBlock)return;
  if(gpxPlayer.progress>=.999)setGpxProgress(0,false);
  gpxPlayer.playing=!gpxPlayer.playing;$('#gpxPlayButton').textContent=gpxPlayer.playing?'❚❚ Pause':'▶ Animer';
  if(gpxPlayer.playing&&gpxPlayer.follow){controls.autoRotate=false;$('#rotateButton').classList.remove('active');controls.enabled=false}else controls.enabled=true;
}

function stopGpxAnimation(resetButton=true){
  gpxPlayer.playing=false;controls.enabled=true;if(resetButton)$('#gpxPlayButton').textContent='▶ Animer';
}

function updateFollowCamera(immediate=false){
  const block=gpxPlayer.routeBlock,route=block?.group.userData.route;if(!route?.coords.length)return;
  const positionFloat=gpxPlayer.progress*(route.coords.length-1),index=Math.floor(positionFloat),next=Math.min(route.coords.length-1,index+1),fraction=positionFloat-index;
  const point=route.coords[index].clone().lerp(route.coords[next],fraction),ahead=route.coords[Math.min(route.coords.length-1,index+5)].clone();block.group.localToWorld(point);block.group.localToWorld(ahead);
  const tangent=ahead.clone().sub(point);tangent.y=0;if(tangent.lengthSq()<.0001)tangent.set(0,0,-1);tangent.normalize();
  const distance=Math.max(2.6,block.data.size*.2),desired=point.clone().addScaledVector(tangent,-distance);desired.add(new THREE.Vector3(-tangent.z*distance*.42,Math.max(1.6,block.data.size*.13),tangent.x*distance*.42));
  const factor=immediate?1:.075;camera.position.lerp(desired,factor);controls.target.lerp(ahead,factor*1.25);camera.lookAt(controls.target);
}

function applyQuality(){
  const quality=QUALITY[globalSettings.quality],mobile=matchMedia('(max-width: 760px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?Math.min(1.8,quality.dpr):quality.dpr));renderer.shadowMap.enabled=globalSettings.shadows;
  sun.shadow.mapSize.set(quality.shadow,quality.shadow);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}
  $('.quality-badge').textContent=`SATELLITE + DEM · ${quality.label}`;
}

function applyLighting(){
  renderer.toneMappingExposure=globalSettings.brightness;sun.intensity=globalSettings.sunIntensity;
  const azimuth=THREE.MathUtils.degToRad(globalSettings.sunAzimuth),elevation=THREE.MathUtils.degToRad(globalSettings.sunElevation),radius=48,flat=Math.cos(elevation)*radius;
  sun.position.set(Math.sin(azimuth)*flat,Math.sin(elevation)*radius,Math.cos(azimuth)*flat);ambient.intensity=1.75+globalSettings.brightness*.24;
}

function bindControls(){
  $('#qualitySelect').value=globalSettings.quality;$('#qualitySelect').addEventListener('change',event=>{globalSettings.quality=event.target.value;applyQuality();saveProject();if(globalSettings.quality==='ultra'&&matchMedia('(max-width: 760px)').matches)showError('Le mode Ultra peut être lourd sur téléphone. Repasse en Haute qualité si le navigateur ralentit.');rebuildScene()});
  bindRange('exaggeration','exaggerationValue',value=>`${value.toFixed(1).replace('.',',')}×${value===1?' réelle':''}`,value=>{globalSettings.exaggeration=value;$('.scale-badge').innerHTML=`<i></i><b>Même échelle</b> · relief ${value.toFixed(1).replace('.',',')}×`;updateVerticalScale()});
  bindRange('brightness','brightnessValue',value=>value.toFixed(2).replace('.',','),value=>{globalSettings.brightness=value;applyLighting()});
  bindRange('sunAzimuth','sunAzimuthValue',value=>`${Math.round(value)}°`,value=>{globalSettings.sunAzimuth=value;applyLighting()});
  bindRange('sunElevation','sunElevationValue',value=>`${Math.round(value)}°`,value=>{globalSettings.sunElevation=value;applyLighting()});
  bindRange('sunIntensity','sunIntensityValue',value=>value.toFixed(1).replace('.',','),value=>{globalSettings.sunIntensity=value;applyLighting()});
  $('#shadowToggle').checked=globalSettings.shadows;$('#shadowToggle').addEventListener('change',event=>{globalSettings.shadows=event.target.checked;renderer.shadowMap.enabled=globalSettings.shadows;blocks.forEach(block=>{block.group.userData.top.castShadow=block.group.userData.top.receiveShadow=globalSettings.shadows;block.group.userData.side.castShadow=globalSettings.shadows});saveProject()});
  $('#cloudToggle').checked=globalSettings.clouds;$('#cloudToggle').addEventListener('change',event=>{globalSettings.clouds=event.target.checked;blocks.forEach(block=>block.group.userData.clouds.visible=globalSettings.clouds);saveProject()});
  bindRange('cloudDensity','cloudDensityValue',value=>String(Math.round(value)),value=>{globalSettings.cloudDensity=Math.round(value);refreshClouds()});
  bindRange('cloudDetail','cloudDetailValue',value=>`${Math.round(value)} / 3`,value=>{globalSettings.cloudDetail=Math.round(value);refreshClouds()});
  bindRange('cloudOpacity','cloudOpacityValue',value=>`${Math.round(value*100)} %`,value=>{globalSettings.cloudOpacity=value;blocks.forEach(block=>block.group.userData.clouds.children.forEach(cluster=>cluster.userData.material.opacity=value))});
  bindRange('cloudSize','cloudSizeValue',value=>`${value.toFixed(1).replace('.',',')}×`,value=>{globalSettings.cloudSize=value;refreshClouds()});
  $('#blockPeakSelect').addEventListener('change',event=>{editorPeakId=event.target.value;syncBlockEditor()});
  $('#blockDiameter').addEventListener('input',event=>{const config=settingsFor(editorPeakId);config.diameter=+event.target.value;$('#blockDiameterValue').value=`${config.diameter} km`;syncOffsetLimits(config);scheduleRebuild()});
  $('#blockEast').addEventListener('input',event=>{const config=settingsFor(editorPeakId);config.centerEast=+event.target.value;$('#blockEastValue').value=formatSigned(config.centerEast,' km');scheduleRebuild()});
  $('#blockNorth').addEventListener('input',event=>{const config=settingsFor(editorPeakId);config.centerNorth=+event.target.value;$('#blockNorthValue').value=formatSigned(config.centerNorth,' km');scheduleRebuild()});
  $('#blockComment').addEventListener('input',event=>{settingsFor(editorPeakId).comment=event.target.value;saveProject();clearTimeout(rebuildTimer);rebuildTimer=setTimeout(refreshStatsBillboards,180)});
  $('#blockStatsToggle').addEventListener('change',event=>{settingsFor(editorPeakId).showStats=event.target.checked;saveProject();refreshStatsBillboards()});
  $('#gpxPlayButton').addEventListener('click',toggleGpxAnimation);$('#gpxFollowToggle').checked=gpxPlayer.follow;$('#gpxFollowToggle').addEventListener('change',event=>{gpxPlayer.follow=event.target.checked;if(!gpxPlayer.follow)controls.enabled=true});
  $('#gpxProgress').addEventListener('input',event=>{stopGpxAnimation();setGpxProgress(+event.target.value/1000,true)});$('#gpxDuration').addEventListener('change',event=>gpxPlayer.duration=+event.target.value);
  $('#rotateButton').addEventListener('click',()=>{stopGpxAnimation();controls.autoRotate=!controls.autoRotate;$('#rotateButton').classList.toggle('active',controls.autoRotate)});
  $('#resetCameraButton').addEventListener('click',()=>{stopGpxAnimation();fitCamera()});
  $('#filmButton').addEventListener('click',()=>{document.body.classList.toggle('film-mode');setTimeout(()=>{resize();fitCamera()},80);if(document.body.classList.contains('film-mode'))document.documentElement.requestFullscreen?.().catch(()=>{})});
  $('#menuButton').addEventListener('click',()=>setPanel(!document.body.classList.contains('panel-open')));$('#closePanelButton').addEventListener('click',()=>setPanel(false));$('#panelScrim').addEventListener('click',()=>setPanel(false));
  $('#addPeakButton').addEventListener('click',()=>$('#peakDialog').showModal());$('#confirmPeakButton').addEventListener('click',handleNewPeak);
  $('#gpxInput').addEventListener('change',event=>handleGpxFile(event.target.files[0]));
  const drop=$('#dropZone');['dragenter','dragover'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('dragging')}));['dragleave','drop'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('dragging')}));drop.addEventListener('drop',event=>handleGpxFile(event.dataTransfer.files[0]));
  $('#saveButton').addEventListener('click',saveActiveStats);window.addEventListener('resize',resize);canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();showError('Le moteur 3D a perdu le contexte graphique. Recharge la page ou baisse la qualité.')});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('film-mode');setTimeout(resize,50)});
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
  const peak={id:`custom-${Date.now()}`,name:$('#newName').value.trim(),elevation:+$('#newElevation').value,lat:+$('#newLat').value,lon:+$('#newLon').value,region:'Sommet personnalisé'};
  if(!peak.name||peak.elevation<=0||!Number.isFinite(peak.lat)||!Number.isFinite(peak.lon)){event.preventDefault();return}
  peaks.push(peak);settingsFor(peak.id);if(selected.length<MAX_PEAKS)selected.push(peak.id);editorPeakId=peak.id;renderPeakList();syncBlockEditor();saveProject();rebuildScene();$('#peakForm').reset();
}

async function handleGpxFile(file){
  if(!file)return;
  try{
    gpxTrack=parseGpx(await file.text());const stats=trackStats(gpxTrack);gpxPlayer.progress=0;
    $('#gpxStats').textContent=`${gpxTrack.length.toLocaleString('fr-CH')} points · ${stats.distance.toFixed(1)} km · +${Math.round(stats.gain).toLocaleString('fr-CH')} m`;$('#gpxStats').classList.add('loaded');
    buildGpxRoutes();setGpxProgress(0,false);
    if(!gpxPlayer.routeBlock)showError('Le GPX est chargé, mais son tracé ne traverse aucune découpe actuellement affichée.');
  }catch(error){showError(error.message)}
}

function saveActiveStats(){
  if(!editorPeakId)return;const config=settingsFor(editorPeakId);config.manualDistance=$('#distance').value;config.manualGain=$('#gain').value;config.manualDuration=$('#duration').value;config.manualDate=$('#date').value;config.manualNotes=$('#notes').value;saveProject();refreshStatsBillboards();const button=$('#saveButton');button.textContent='✓ Enregistré';setTimeout(()=>button.textContent='Enregistrer sur cet appareil',1500);
}

function saveProject(){
  try{localStorage.setItem('mountainAnimatorProjectV3',JSON.stringify({customPeaks:peaks.filter(peak=>!PEAKS.some(item=>item.id===peak.id)),selected,globalSettings,blockSettings:Object.fromEntries(blockSettings)}))}catch{}
}

function restoreProject(){
  try{
    const saved=JSON.parse(localStorage.getItem('mountainAnimatorProjectV3')||'null');if(!saved)return;
    if(Array.isArray(saved.customPeaks))peaks=[...PEAKS,...saved.customPeaks];if(Array.isArray(saved.selected))selected=saved.selected.filter(id=>peaks.some(peak=>peak.id===id)).slice(0,MAX_PEAKS);Object.assign(globalSettings,saved.globalSettings||{});if(!QUALITY[globalSettings.quality])globalSettings.quality='high';Object.entries(saved.blockSettings||{}).forEach(([id,value])=>blockSettings.set(id,{...defaultBlockSettings(),...value}));editorPeakId=selected[0]||'';
  }catch{}
}

function setPanel(open){document.body.classList.toggle('panel-open',open);$('#menuButton').setAttribute('aria-expanded',String(open))}
function showLoading(title,detail){$('#loadingPanel').hidden=false;$('#loadingTitle').textContent=title;$('#loadingDetail').textContent=detail}
function hideLoading(){$('#loadingPanel').hidden=true}
function showError(message){const panel=$('#errorPanel');panel.textContent=message;panel.hidden=false;clearTimeout(showError.timer);showError.timer=setTimeout(hideError,9000)}
function hideError(){$('#errorPanel').hidden=true}
function humanError(){return!navigator.onLine?'aucune connexion Internet':'les données de relief ou l’imagerie haute définition sont temporairement inaccessibles'}
function formatSigned(value,suffix=''){return `${value>0?'+':''}${Number(value).toFixed(2).replace(/\.00$/,'').replace('.',',')}${suffix}`}
function formatDuration(seconds){const hours=Math.floor(seconds/3600),minutes=Math.round((seconds%3600)/60);return hours?`${hours} h ${String(minutes).padStart(2,'0')}`:`${minutes} min`}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}

function resize(){const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}

function animate(){
  requestAnimationFrame(animate);const delta=Math.min(.05,clock.getDelta());cloudTime+=delta;
  if(gpxPlayer.playing){setGpxProgress(gpxPlayer.progress+delta/gpxPlayer.duration,false);if(gpxPlayer.follow)updateFollowCamera(false);if(gpxPlayer.progress>=1)stopGpxAnimation()}
  if(!gpxPlayer.playing||!gpxPlayer.follow)controls.update();
  blocks.forEach(block=>block.group.userData.clouds.children.forEach(cluster=>{cluster.position.x=cluster.userData.startX+Math.sin(cloudTime*cluster.userData.speed+cluster.userData.phase)*.25;cluster.position.z=cluster.userData.startZ+Math.cos(cloudTime*cluster.userData.speed*.7+cluster.userData.phase)*.16}));
  updatePeakLabels();renderer.render(scene,camera);
}
