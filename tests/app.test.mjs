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
  const route=block.group.userData.route;assert.ok(route.line.isLineSegments);
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

test('each cloud has its own texture and reshuffling frees the previous materials',()=>{
  const app=appHarness(),block=app.syntheticBlock(),old=block.group.userData.clouds;
  const textures=old.children.map(cluster=>cluster.userData.material.map);
  assert.equal(new Set(textures).size,old.children.length);let disposed=0;textures.forEach(texture=>texture.addEventListener('dispose',()=>disposed++));
  app.window.document.querySelector('#randomizeClouds').click();assert.equal(disposed,textures.length);
  assert.notEqual(block.group.userData.clouds,old);assert.equal(app.globalSettings.cloudSeed,2);app.dom.window.close();
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
