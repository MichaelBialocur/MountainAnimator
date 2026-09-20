import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {appHarness} from './harness.mjs';

const routePoints=()=>[
  {lat:46.18,lon:7.09,ele:2400,time:0,segment:0},
  {lat:46.18,lon:7.095,ele:2420,time:60000,segment:0},
  {lat:46.18,lon:7.15,ele:2600,time:720000,segment:0}
];
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const input=(app,id,value,type='input')=>{const node=app.window.document.querySelector('#'+id);node.value=value;node.dispatchEvent(new app.window.Event(type));};
const tick=(app,seconds,dt=.05)=>{for(let t=0;t<seconds;t+=dt)app.advancePlayback(dt);};

test('GPX distance widens the camera smoothly during approach and following, and persists',()=>{
 const app=appHarness();app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();app.camera.position.set(12,12,30);app.controls.target.set(0,2,0);
 app.toggleGpxAnimation();tick(app,.5);const before=app.camera.position.clone(),target=app.controls.target.clone();
 input(app,'gpxFollowDistance','3');assert.ok(app.camera.position.equals(before));assert.ok(app.controls.target.equals(target));tick(app,2.5);
 const wide=app.followPose();input(app,'gpxFollowDistance','1');const nearPose=app.followPose();near(wide.position.distanceTo(wide.target),3*nearPose.position.distanceTo(nearPose.target));
 const beforeChange=app.camera.position.clone();input(app,'gpxFollowDistance','4');assert.ok(app.camera.position.equals(beforeChange));app.advancePlayback(.05);assert.ok(app.gpxPlayer.playing);assert.ok(app.camera.position.distanceTo(beforeChange)<1);
 const saved=JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3'));near(saved.globalSettings.gpxFollowDistance,4);const restored=appHarness(saved);near(restored.globalSettings.gpxFollowDistance,4);restored.dom.window.close();app.dom.window.close();
});

test('live GPX text stays in the same screen corner across zooms and route progress',()=>{
 const app=appHarness(),block=app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();block.config.gpxLiveStats=true;app.setGpxProgress(.5);
 const route=block.group.userData.route;app.camera.position.set(0,14,26);app.controls.target.set(0,2,0);app.camera.lookAt(app.controls.target);app.updateLiveStats();
 assert.equal(route.liveLabel.material.depthTest,false);assert.equal(route.liveLabel.material.depthWrite,false);assert.equal(route.liveLabel.material.fog,false);assert.ok(route.liveLabel.renderOrder>100);
 const words=route.liveCanvas.getContext('2d').text;for(const label of ['Altitude','Dénivelé +','Distance'])assert.ok(words.some(text=>text.startsWith(label)));
 const projectedWidth=()=>{const center=route.liveLabel.getWorldPosition(new THREE.Vector3()),depth=-center.clone().applyMatrix4(app.camera.matrixWorldInverse).z;return route.liveLabel.scale.x/depth/(2*Math.tan(THREE.MathUtils.degToRad(app.camera.fov)/2))*750;};
 near(projectedWidth(),185);const originalScreen=route.liveLabel.getWorldPosition(new THREE.Vector3()).project(app.camera);app.setGpxProgress(.9);app.camera.position.multiplyScalar(3);app.camera.lookAt(app.controls.target);app.updateLiveStats();near(projectedWidth(),185);
 const p=route.liveLabel.getWorldPosition(new THREE.Vector3()).project(app.camera);near(p.x,originalScreen.x);near(p.y,originalScreen.y);assert.ok(Math.abs(p.x)+185/1200<1);assert.ok(Math.abs(p.y)+(185*320/720)/750<1);app.dom.window.close();
});

test('GPX parsing preserves recording breaks, missing elevations and namespaced elements',()=>{
  const app=appHarness();
  const parsed=app.parseGpx('<g:gpx xmlns:g="urn:gpx"><g:trk><g:trkseg><g:trkpt lat="46" lon="7"/><g:trkpt lat="46.001" lon="7.001"/></g:trkseg><g:trkseg><g:trkpt lat="47" lon="8"/><g:trkpt lat="47.001" lon="8.001"/></g:trkseg></g:trk></g:gpx>');
  assert.equal(parsed.length,4);assert.ok(Number.isNaN(parsed[0].ele));assert.notEqual(parsed[1].segment,parsed[2].segment);
  assert.ok(app.trackStats(parsed).distance<.3);assert.equal(app.trackStats(parsed).hasElevation,false);
  assert.throws(()=>app.parseGpx('<gpx><broken>'));assert.throws(()=>app.parseGpx('<gpx><trk><trkseg><trkpt lon="7"/><trkpt lat="46" lon="7"/></trkseg></trk></gpx>'));
  app.dom.window.close();
});

test('a sparse GPX is draped on terrain and reveals a fractional edge without jumping',()=>{
  const app=appHarness(),block=app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();
  const route=block.group.userData.route;assert.ok(route.motion.segments.length>2);
  app.setGpxProgress(.45);const halfway=route.cursor.position.x;
  app.setGpxProgress(.46);assert.ok(route.cursor.position.x>halfway);assert.ok(route.cursor.position.x-halfway<.06);
  near(route.cursor.position.y,2.435); // DEM, not missing/incorrect GPS altitude.
  app.setGpxProgress(1);const complete=route.geometry.attributes.position.array.slice();
  app.setGpxProgress(.03);app.setGpxProgress(.8);app.setGpxProgress(1);
  assert.deepEqual(route.geometry.attributes.position.array,complete);near(block.group.userData.routeStats.distance,app.trackStats(app.gpxTrack).distance);
  app.dom.window.close();
});

test('segments separated in the GPX never create a false straight connecting line',()=>{
  const app=appHarness(),block=app.syntheticBlock();
  app.gpxTrack=[...routePoints().slice(0,2),{lat:46.18,lon:7.13,segment:1},{lat:46.18,lon:7.14,segment:1}];app.buildGpxRoutes();
  const route=block.group.userData.route;assert.ok(route.line.isLineSegments2);
  assert.equal(new Set(route.motion.segments.map(edge=>edge.part)).size,2);
  assert.ok(route.motion.total<1.2);app.dom.window.close();
});

test('stationary repeated GPS points do not introduce a camera transition',()=>{
  const app=appHarness(),block=app.syntheticBlock(),points=routePoints();
  app.gpxTrack=[points[0],points[1],{...points[1]},points[2]];app.buildGpxRoutes();
  assert.equal(new Set(block.group.userData.route.motion.segments.map(edge=>edge.part)).size,1);app.dom.window.close();
});

test('individual rotation transforms terrain, route, marker and labels without moving a neighbour',()=>{
  const app=appHarness(),first=app.syntheticBlock(),second=app.syntheticBlock('lagginhorn',8.00310);
  app.gpxTrack=routePoints();app.buildGpxRoutes();app.createPeakLabels();
  const before=second.group.rotation.y;input(app,'blockRotation','90');
  near(first.group.rotation.y,Math.PI/2);near(second.group.rotation.y,before);
  assert.equal(first.group.userData.route.root.parent,first.group);assert.equal(first.group.userData.summitMarker.parent,first.group);
  const local=new THREE.Vector3(1,0,0);first.group.localToWorld(local);near(local.x,first.group.position.x);near(local.z,-1);
  app.updatePeakLabels();assert.match(first.group.userData.label.style.left,/px$/);
  app.dom.window.close();
});

test('route colour and floor selection persist, old projects inherit marble and zero rotation',()=>{
  const app=appHarness({selected:['chavalard'],blockSettings:{chavalard:{diameter:10,comment:'Une ascension'}}});
  const block=app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();input(app,'gpxColor','#bb2244');input(app,'groundTexture','wood','change');
  assert.equal(block.group.userData.route.material.color.getHexString(),'bb2244');assert.equal(block.group.userData.route.cursor.material.color.getHexString(),'bb2244');
  const saved=JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3'));
  assert.equal(saved.blockSettings.chavalard.gpxColor,'#bb2244');assert.equal(saved.globalSettings.groundTexture,'wood');near(saved.blockSettings.chavalard.rotation,0);
  assert.equal(appHarness({blockSettings:{}}).globalSettings.groundTexture,'marble');app.dom.window.close();
});

test('clouds are varied volumes, clear all terrain, and release GPU resources',()=>{
  const app=appHarness(),block=app.syntheticBlock(),old=block.group.userData.clouds;
  const materials=old.children.map(cluster=>cluster.userData.volume.material);
  assert.equal(new Set(materials).size,old.children.length);let disposed=0;materials.forEach(material=>material.addEventListener('dispose',()=>disposed++));
  for(const c of old.children)assert.ok(c.position.y-c.userData.volume.scale.y/2>2.4);
  app.window.document.querySelector('#randomizeClouds').click();assert.equal(disposed,materials.length);
  assert.notEqual(block.group.userData.clouds,old);assert.equal(app.globalSettings.cloudSeed,2);app.dom.window.close();
});

test('snow altitude and panel offsets persist independently and panels respect depth',()=>{
  const app=appHarness(),first=app.syntheticBlock(),second=app.syntheticBlock('lagginhorn',8.00310);
  input(app,'snowAltitude','3200');const enabled=app.window.document.querySelector('#snowEnabled');enabled.checked=true;enabled.dispatchEvent(new app.window.Event('change'));
  assert.equal(first.group.userData.top.material.userData.snow.snowLine.value,3200);
  assert.equal(second.group.userData.top.material.userData.snow.snowLine.value,1e7);
  app.refreshStatsBillboards();const before=first.group.userData.statsCard.position.clone();input(app,'statsZ','-8');
  assert.equal(first.group.userData.statsCard.position.z,before.z-8);assert.equal(second.config.statsZ,0);
  assert.equal(first.group.userData.statsCard.userData.surface.material.depthTest,true);
  assert.equal(first.group.userData.statsLeader,null);
  assert.equal(JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3')).blockSettings.chavalard.statsZ,-8);
  app.dom.window.close();
});

test('alpine stats contain metrics and comments, without a repeated name or heading',()=>{
  const app=appHarness(),block=app.syntheticBlock();block.config.comment='Mon carnet d’ascension';
  const canvas=app.makeStatsCanvas(block),text=canvas.testContext.text.join(' ');
  assert.match(text,/ALTITUDE/);assert.match(text,/Mon carnet d’ascension/);assert.doesNotMatch(text,/chavalard|SOMMET ACCOMPLI/i);app.dom.window.close();
});

test('camera enters from the exact current pose, pauses distance during approach and frames the full route at the end',()=>{
  const app=appHarness(),block=app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();
  app.camera.position.set(8,12,30);app.controls.target.set(0,2,0);const starting=app.camera.position.clone();
  app.toggleGpxAnimation();assert.equal(app.gpxPlayer.phase,'intro');assert.ok(app.camera.position.equals(starting));
  tick(app,1);near(app.gpxPlayer.progress,0);assert.ok(app.camera.position.distanceTo(starting)>0);
  tick(app,1.5);assert.equal(app.gpxPlayer.phase,'follow');assert.ok(app.gpxPlayer.progress<.01);
  tick(app,25);assert.equal(app.gpxPlayer.phase,'outro');near(app.gpxPlayer.progress,1);
  const endPose=app.routeOverviewPose();tick(app,3.1);assert.equal(app.gpxPlayer.playing,false);assert.equal(app.controls.enabled,true);
  assert.ok(app.camera.position.distanceTo(endPose.position)<1e-5);
  app.camera.updateMatrixWorld();
  for(const edge of block.group.userData.route.motion.segments){const p=block.group.localToWorld(edge.a.clone()).project(app.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,'all GPX points fit in the final view');}
  app.dom.window.close();
});

test('zigzags do not reverse the camera bearing, and pause/resume has no snap',()=>{
  const app=appHarness();app.syntheticBlock();app.gpxTrack=Array.from({length:40},(_,i)=>({lat:46.17+i*.0004,lon:7.11+(i%2?.003:-.003),segment:0}));app.buildGpxRoutes();
  app.camera.position.set(12,12,30);app.controls.target.set(0,2,0);app.toggleGpxAnimation();tick(app,2.45);
  let min=Infinity,max=-Infinity;
  for(let i=0;i<200;i++){app.advancePlayback(.05);const delta=app.camera.position.clone().sub(app.controls.target),bearing=Math.atan2(delta.x,delta.z);min=Math.min(min,bearing);max=Math.max(max,bearing);}
  assert.ok(max-min<.01);app.toggleGpxAnimation();const paused=app.camera.position.clone(),progress=app.gpxPlayer.progress;tick(app,2);near(app.gpxPlayer.progress,progress);
  app.toggleGpxAnimation();assert.ok(app.camera.position.distanceTo(paused)<1e-6);app.dom.window.close();
});

test('turning camera follow on and off during playback leaves a coherent animation state',()=>{
  const app=appHarness();app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();app.toggleGpxAnimation();tick(app,.5);
  const checkbox=app.window.document.querySelector('#gpxFollowToggle');checkbox.checked=false;checkbox.dispatchEvent(new app.window.Event('change'));
  assert.equal(app.gpxPlayer.transition,null);assert.equal(app.controls.enabled,true);tick(app,.5);assert.ok(app.gpxPlayer.progress>0);
  checkbox.checked=true;checkbox.dispatchEvent(new app.window.Event('change'));assert.equal(app.gpxPlayer.phase,'intro');assert.equal(app.controls.enabled,false);
  tick(app,1.6);assert.equal(app.gpxPlayer.phase,'follow');app.stopGpxAnimation();app.clearBlocks();assert.equal(app.gpxPlayer.routeBlock,null);assert.ok(app.window.document.querySelector('#gpxPlayButton').disabled);app.dom.window.close();
});

test('cloud altitude, spread and mixed types are deterministic and avoid terrain',()=>{
 const app=appHarness(),block=app.syntheticBlock();
 input(app,'cloudHeight','5000');input(app,'cloudSpread','0');
 for(const c of block.group.userData.clouds.children)near(c.position.y,5);
 input(app,'cloudType','mixed','change');
 const kinds=new Set(block.group.userData.clouds.children.map(c=>c.userData.kind));assert.equal(kinds.size,4);
 input(app,'cloudStratus','0');assert.ok(block.group.userData.clouds.children.every(c=>c.userData.kind!=='stratus'));
 input(app,'cloudHeight','100');for(const c of block.group.userData.clouds.children)assert.ok(c.position.y-c.userData.volume.scale.y/2>2.4);
 const saved=JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3'));assert.equal(saved.globalSettings.cloudType,'mixed');assert.equal(saved.globalSettings.cloudHeight,100);app.dom.window.close();
});

test('snow coverage remains independent and ambient fill does not disable terrain shadow reception',()=>{
 const app=appHarness(),block=app.syntheticBlock(),other=app.syntheticBlock('lagginhorn',8.00310);
 input(app,'snowCoverage','.35');near(block.group.userData.top.material.userData.snow.snowCoverage.value,.35);near(other.group.userData.top.material.userData.snow.snowCoverage.value,.68);
 input(app,'fillLight','.2');near(app.globalSettings.fillLight,.2);assert.equal(block.group.userData.top.receiveShadow,true);assert.equal(block.group.userData.top.castShadow,true);
 app.dom.window.close();
});

test('offline GPX render advances fixed steps and restores the exact editor state on cancellation',async()=>{
 let rendered=0;
 class ExportStub{active=false;cancelled=false;async start({renderFrame}){this.active=true;try{for(let i=0;i<100;i++){await renderFrame({index:i,time:i/30,delta:i?1/30:0,total:100});rendered++;}return null;}finally{this.active=false;}}cancel(){this.cancelled=true;}}
 const app=appHarness(undefined,{VideoExport:ExportStub,supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]});const block=app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();app.setGpxProgress(.4);
 app.window.document.querySelector('#loadingPanel').hidden=true;input(app,'exportMotion','gpx','change');
 const before=app.saveExportView(),cloud=block.group.userData.clouds.children[0].position.clone();await app.runVideoExport();
 assert.equal(rendered,100);near(app.gpxPlayer.progress,.4);assert.ok(app.camera.position.distanceTo(before.position)<1e-6);assert.ok(app.controls.target.distanceTo(before.target)<1e-6);
 assert.equal(app.controls.autoRotate,before.autoRotate);assert.equal(app.controls.enableDamping,before.damping);assert.equal(app.window.document.querySelector('#renderPanel').hidden,true);
 // Drift is restored to the original film time rather than the time spent rendering.
 assert.ok(Number.isFinite(block.group.userData.clouds.children[0].position.x));app.dom.window.close();
});

test('shadow camera fits all terrain after individual rotation, with subdued fill lighting',()=>{
 const app=appHarness(),block=app.syntheticBlock();input(app,'blockRotation','75');input(app,'sunAzimuth','110');
 app.sun.shadow.updateMatrices(app.sun);const shadowCamera=app.sun.shadow.camera;
 const bounds=new THREE.Box3().setFromObject(block.group.userData.top);
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const v=new THREE.Vector3(x,y,z).project(shadowCamera);assert.ok(Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&Math.abs(v.z)<=1);
 }
 assert.ok(app.ambient.intensity<1);assert.ok(app.rim.intensity<.3);assert.ok(app.sun.shadow.normalBias<.005);app.dom.window.close();
});

test('travel notebooks sit on the floor in front of each block and stay there when it rotates',()=>{
 const app=appHarness(),block=app.syntheticBlock();app.refreshStatsBillboards();
 const book=block.group.userData.statsCard,before=book.getWorldPosition(new THREE.Vector3());assert.equal(book.name,'travel-notebook');assert.ok(book.children.every(c=>c.isMesh));near(before.y,-.44);assert.ok(before.z>block.data.size/2);
 input(app,'blockRotation','95');const after=book.getWorldPosition(new THREE.Vector3());assert.ok(before.distanceTo(after)<1e-6);assert.equal(block.group.userData.statsLeader,null);app.dom.window.close();
});
test('fat GPX thickness and live metrics follow fractional progress without extra connecting segments',()=>{
 const app=appHarness(),block=app.syntheticBlock();app.gpxTrack=routePoints();app.buildGpxRoutes();
 app.camera.position.set(0,14,26);app.camera.lookAt(0,2,0);
 input(app,'gpxWidth','9');const route=block.group.userData.route;near(route.material.linewidth,9*750/1080);
 const toggle=app.window.document.querySelector('#gpxLiveStats');toggle.checked=true;toggle.dispatchEvent(new app.window.Event('change'));
 app.setGpxProgress(.25);assert.ok(route.liveLabel.visible);assert.match(route.liveText,/D\+/);const old=route.liveText;app.setGpxProgress(.75);assert.notEqual(route.liveText,old);
 assert.equal(route.fatGeometry.instanceCount,route.partialIndex+1);const sample=route.fatGeometry.attributes.instanceEnd;near(sample.getX(route.partialIndex),route.cursor.position.x);
 app.dom.window.close();
});
test('cinema preview has a stable start, pauses, reaches a different mountain and saves the shot list',()=>{
 const app=appHarness();app.syntheticBlock();app.syntheticBlock('lagginhorn',8.0031);app.camera.position.set(0,20,50);app.controls.target.set(0,2,0);const start=app.camera.position.clone();
 input(app,'shotType','transfer','change');input(app,'shotFrom','chavalard','change');input(app,'shotTo','lagginhorn','change');app.window.document.querySelector('#shotAdd').click();
 const saved=JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3'));assert.equal(saved.cameraShots.length,1);
 app.window.document.querySelector('#sequencePlay').click();assert.ok(app.camera.position.distanceTo(start)<1e-6);assert.equal(app.cinema.playing,true);
 app.advanceCinema(6.5);const middle=app.camera.position.clone();app.window.document.querySelector('#cinemaPause').click();assert.equal(app.cinema.playing,false);assert.ok(app.camera.position.equals(middle));
 app.window.document.querySelector('#cinemaPause').click();app.advanceCinema(5.5);assert.equal(app.cinema.playing,false);assert.ok(app.controls.target.x>0);app.dom.window.close();
});

test('offline composition samples absolute film time and restores a paused editor on cancellation',async()=>{
 let app,duration;const poses=[];
 class ExportStub{active=false;cancelled=false;async start(options){duration=options.duration;this.active=true;try{
   for(const time of [0,2.4,6,9,12]){await options.renderFrame({index:Math.round(time*30),time,delta:1/30});poses.push({position:app.camera.position.clone(),target:app.controls.target.clone()});}
   return null;
 }finally{this.active=false;}}cancel(){this.cancelled=true;}}
 app=appHarness(undefined,{VideoExport:ExportStub,supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]});app.syntheticBlock();app.syntheticBlock('lagginhorn',8.0031);
 app.camera.position.set(0,20,50);app.controls.target.set(0,2,0);
 input(app,'shotType','transfer','change');input(app,'shotFrom','chavalard','change');input(app,'shotTo','lagginhorn','change');app.window.document.querySelector('#shotAdd').click();
 app.window.document.querySelector('#sequencePlay').click();app.advanceCinema(3);app.window.document.querySelector('#cinemaPause').click();
 const saved=app.saveExportView();app.window.document.querySelector('#loadingPanel').hidden=true;input(app,'exportMotion','sequence','change');input(app,'exportOrientation','portrait','change');
 await app.runVideoExport();near(duration,12+1/30);assert.ok(poses[0].position.distanceTo(saved.position)<1e-6);assert.ok(poses.at(-1).target.x>0);assert.ok(poses[2].position.distanceTo(poses[2].target)>poses.at(-1).position.distanceTo(poses.at(-1).target));
 assert.ok(app.camera.position.distanceTo(saved.position)<1e-6);assert.ok(app.controls.target.distanceTo(saved.target)<1e-6);assert.equal(app.cinema.paused,true);assert.equal(app.cinema.playing,false);near(app.cinema.time,3);near(app.camera.aspect,1200/750);
 assert.equal(app.window.document.querySelector('#cinemaStatus').textContent,saved.cinemaStatus);assert.equal(app.window.document.querySelector('#cinemaPause').textContent,'Reprendre');
 app.stopCinema();app.window.document.querySelector('#cinemaPause').click();assert.equal(app.cinema.playing,false);app.dom.window.close();
});
