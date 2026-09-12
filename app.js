const PEAKS=[
 {id:'chavalard',name:'Grand Chavalard',elevation:2899,lat:46.17869,lon:7.11312},
 {id:'lagginhorn',name:'Lagginhorn',elevation:4010,lat:46.15706,lon:8.00310},
 {id:'jegihorn',name:'Jegihorn',elevation:3206,lat:46.2055,lon:7.9564},
 {id:'barrhorn',name:'Barrhorn',elevation:3610,lat:46.1803,lon:7.7358},
 {id:'bigerhorn',name:'Bigerhorn',elevation:3626,lat:46.1924,lon:7.7627},
 {id:'mettelhorn',name:'Mettelhorn',elevation:3406,lat:46.0551,lon:7.7168},
 {id:'rinderhorn',name:'Rinderhorn',elevation:3448,lat:46.4420,lon:7.6536}
];
let peaks=[...PEAKS],selected=['chavalard','lagginhorn'],viewers=[],heading=0,rotating=false,terrainReady=false,gpx=[];
const $=s=>document.querySelector(s); const viewersEl=$('#viewers');
function active(){return selected.map(id=>peaks.find(p=>p.id===id)).filter(Boolean)}
function renderPeakList(){
 $('#peakList').innerHTML=peaks.map(p=>`<label class="peak-row"><input type="checkbox" data-id="${p.id}" ${selected.includes(p.id)?'checked':''}><span><b>${p.name}</b><small>${p.elevation.toLocaleString('fr-CH')} m</small></span>${PEAKS.some(x=>x.id===p.id)?'':`<button class="remove" data-remove="${p.id}">×</button>`}</label>`).join('');
 document.querySelectorAll('[data-id]').forEach(el=>el.onchange=()=>{if(el.checked&&selected.length>=4){el.checked=false;return alert('Maximum 4 sommets.')}selected=el.checked?[...selected,el.dataset.id]:selected.filter(x=>x!==el.dataset.id);renderViewers()});
 document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=e=>{e.preventDefault();peaks=peaks.filter(p=>p.id!==el.dataset.remove);selected=selected.filter(x=>x!==el.dataset.remove);renderPeakList();renderViewers()});
}
async function makeTerrain(){try{const t=await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer');terrainReady=true;return t}catch(e){console.warn('Relief détaillé indisponible, ellipsoïde utilisé',e);return new Cesium.EllipsoidTerrainProvider()}}
async function renderViewers(){
 viewers.forEach(v=>v.destroy());viewers=[];viewersEl.innerHTML='';const list=active();viewersEl.style.setProperty('--count',Math.max(1,list.length));
 if(!list.length){viewersEl.innerHTML='<div style="margin:auto">Sélectionnez au moins un sommet.</div>';updateComparison();return}
 const terrain=await makeTerrain();
 for(const p of list){const wrap=document.createElement('div');wrap.className='viewer';wrap.innerHTML=`<div class="cesium-container"></div><div class="mountain-title"><strong>${p.name}</strong><span>${p.elevation.toLocaleString('fr-CH')} m</span></div>`;viewersEl.appendChild(wrap);
  const v=new Cesium.Viewer(wrap.querySelector('.cesium-container'),{terrainProvider:terrain,baseLayer:new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'})),animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false});
  v.scene.globe.baseColor=Cesium.Color.fromCssColorString('#263746');v.scene.backgroundColor=Cesium.Color.fromCssColorString('#03070b');v.scene.globe.enableLighting=true;v.scene.highDynamicRange=true;v.scene.verticalExaggeration=Number($('#exaggeration').value);v.entities.add({position:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.elevation+80),point:{pixelSize:9,color:Cesium.Color.fromCssColorString('#ffc66d'),outlineColor:Cesium.Color.WHITE,outlineWidth:2}});viewers.push(v);setCamera(v,p);
 }
 drawGpx();updateComparison();$('#status').textContent=terrainReady?'Relief réel chargé':'Mode de secours actif';setTimeout(()=>$('#status').style.display='none',2500);
}
function setCamera(v,p){v.camera.lookAt(Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.elevation),new Cesium.HeadingPitchRange(heading,Cesium.Math.toRadians(-24),Number($('#range').value)));}
function updateCameras(){active().forEach((p,i)=>viewers[i]&&setCamera(viewers[i],p))}
function updateComparison(){const a=active();$('#comparison').innerHTML=a.map(p=>`<span class="compare-item">${p.name} <b>${p.elevation} m</b></span>`).join('<span>↔</span>')}
function drawGpx(){if(!gpx.length)return;viewers.forEach(v=>v.entities.add({polyline:{positions:gpx.map(x=>Cesium.Cartesian3.fromDegrees(x.lon,x.lat,x.ele+8)),width:5,material:new Cesium.PolylineGlowMaterialProperty({glowPower:.18,color:Cesium.Color.fromCssColorString('#69d5ff')}),clampToGround:false}}))}
function parseGpx(text){const doc=new DOMParser().parseFromString(text,'application/xml');const pts=[...doc.querySelectorAll('trkpt')].map(n=>({lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon'),ele:+(n.querySelector('ele')?.textContent||0)}));if(pts.length<2)throw Error('Trace GPX vide');let dist=0,gain=0;const R=6371;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;dist+=2*R*Math.asin(Math.sqrt(h));if(b.ele>a.ele)gain+=b.ele-a.ele}return{pts,dist,gain}}
$('#gpxInput').onchange=async e=>{try{const r=parseGpx(await e.target.files[0].text());gpx=r.pts;$('#distance').value=r.dist.toFixed(1);$('#gain').value=Math.round(r.gain);$('#gpxStats').textContent=`${gpx.length} points · ${r.dist.toFixed(1)} km · +${Math.round(r.gain)} m`;renderViewers()}catch(err){alert(err.message)}};
$('#exaggeration').oninput=e=>{$('#exaggerationValue').value=`${(+e.target.value).toFixed(1)}×`;viewers.forEach(v=>v.scene.verticalExaggeration=+e.target.value)};$('#range').oninput=updateCameras;
$('#rotateBtn').onclick=()=>{rotating=!rotating;$('#rotateBtn').textContent=rotating?'❚❚ Pause':'▶ Rotation'};function animate(){if(rotating){heading+=.0025;updateCameras()}requestAnimationFrame(animate)}animate();
$('#filmBtn').onclick=()=>{document.body.classList.toggle('film');setTimeout(()=>viewers.forEach(v=>v.resize()),100);if(document.body.classList.contains('film'))document.documentElement.requestFullscreen?.()};
$('#addPeakBtn').onclick=()=>$('#peakDialog').showModal();$('#confirmPeak').onclick=e=>{const p={id:`custom-${Date.now()}`,name:$('#newName').value,elevation:+$('#newElevation').value,lat:+$('#newLat').value,lon:+$('#newLon').value};if(!p.name||!p.elevation||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)){e.preventDefault();return}peaks.push(p);selected.push(p.id);renderPeakList();renderViewers()};
const fields=['distance','gain','duration','date','notes'];$('#saveBtn').onclick=()=>{localStorage.setItem('mountainAnimatorStats',JSON.stringify(Object.fromEntries(fields.map(x=>[x,$('#'+x).value]))));$('#saveBtn').textContent='✓ Enregistré';setTimeout(()=>$('#saveBtn').textContent='Enregistrer localement',1500)};const saved=JSON.parse(localStorage.getItem('mountainAnimatorStats')||'{}');fields.forEach(x=>$('#'+x).value=saved[x]||'');
window.addEventListener('error',e=>{$('#status').style.display='block';$('#status').textContent='Erreur de chargement — vérifiez la connexion Internet'});renderPeakList();renderViewers();
