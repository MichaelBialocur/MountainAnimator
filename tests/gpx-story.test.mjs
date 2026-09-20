import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {appHarness} from './harness.mjs';
import {measureRoute} from '../route-motion.mjs';
import {nearestRoutePoint,trackFingerprint,stopDuration,nextStoryPin} from '../gpx-story.mjs';
const points=()=>[{lat:46.18,lon:7.09,ele:2400,segment:0},{lat:46.18,lon:7.12,ele:2700,segment:0},{lat:46.18,lon:7.15,ele:2600,segment:0}];
const field=(app,id,value)=>{app.window.document.querySelector('#'+id).value=String(value);};
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function setup(overrides){const app=appHarness(undefined,overrides);app.syntheticBlock();app.gpxTrack=points();app.buildGpxRoutes();app.camera.position.set(0,15,25);app.controls.target.set(0,2,0);app.camera.lookAt(app.controls.target);return app;}
function add(app,position,name,angle=180,pause=1,orbit=2){field(app,'storyPosition',position);field(app,'storyName',name);field(app,'storyComment','Dernier effort, vue sur les Alpes.');field(app,'storyPause',pause);field(app,'storyAngle',angle);field(app,'storyOrbitDuration',orbit);app.saveStoryPin();}
function tick(app,time,dt=.05){for(let t=0;t<time-1e-9;t+=dt)app.advancePlayback(Math.min(dt,time-t));}

test('nearest-route picking respects disconnected edges and repeated visits to the same place',()=>{
 const route=measureRoute([{a:{x:0,y:0,z:0},b:{x:1,y:0,z:0},part:0},{a:{x:10,y:0,z:0},b:{x:11,y:0,z:0},part:1},{a:{x:1,y:0,z:0},b:{x:0,y:0,z:0},part:2}]);
 assert.ok(nearestRoutePoint(route,{x:5,z:0}).error>=4);near(nearestRoutePoint(route,{x:.5,z:0},.9).progress,2.5/3);
 assert.notEqual(trackFingerprint(points()),trackFingerprint(points().map(p=>({...p,lon:p.lon+.001}))));
 assert.equal(nextStoryPin([{id:'a',progress:1}],[],.99,1).id,'a');assert.equal(nextStoryPin([{id:'a',progress:1}],['a'],.99,1),undefined);
});
test('ordered stops include start and endpoint, hold progress, and resume after the final orbit',()=>{
 const app=setup();add(app,100,'Dernier sommet');add(app,0,'Départ',0);add(app,50,'Premier sommet',90);app.gpxPlayer.duration=4;app.setGpxProgress(0);app.toggleGpxAnimation();
 const visited=[];let last=null,held=null;
 for(let i=0;i<650;i++){
   app.advancePlayback(.05);if(app.story.active){const active=app.story.active;if(active.pin.id!==last){visited.push(active.pin.name);last=active.pin.id;held=app.gpxPlayer.progress;}near(app.gpxPlayer.progress,held);app.updateStoryVisuals();assert.ok(active.pin.label.visible);assert.equal(active.pin.label.material.depthTest,false);}
 }
 assert.deepEqual(visited,['Départ','Premier sommet','Dernier sommet']);near(app.gpxPlayer.progress,1);assert.equal(app.story.active,null);assert.equal(app.gpxPlayer.playing,false);app.dom.window.close();
});
test('pause in an orbit freezes camera and stop time; resume finishes the same stop once',()=>{
 const app=setup();add(app,50,'Sommet',180);app.gpxPlayer.duration=4;app.setGpxProgress(0);app.toggleGpxAnimation();tick(app,7);
 assert.ok(app.story.active);const elapsed=app.story.active.elapsed,position=app.camera.position.clone(),progress=app.gpxPlayer.progress,id=app.story.active.pin.id;
 app.toggleGpxAnimation();tick(app,8);near(app.story.active.elapsed,elapsed);near(app.gpxPlayer.progress,progress);assert.ok(app.camera.position.equals(position));
 app.toggleGpxAnimation();assert.ok(app.camera.position.equals(position));tick(app,3);assert.equal(app.story.active,null);assert.equal(app.story.visited.filter(p=>p===id).length,1);assert.ok(app.gpxPlayer.progress>.5);app.dom.window.close();
});
test('saved pins return for the same GPX, survive a block rotation, and do not appear on another GPX',()=>{
 const app=setup();add(app,70,'<Sommet & col>');const pin=app.storyPinsFor()[0],saved=JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3'));
 const before=pin.marker.getWorldPosition(new THREE.Vector3());const block=app.gpxPlayer.routeBlock;block.group.rotation.y=Math.PI/2;block.group.updateWorldMatrix(true,true);const after=pin.marker.getWorldPosition(new THREE.Vector3());assert.ok(before.distanceTo(after)>.1);
 assert.equal(app.window.document.querySelector('[data-story-edit]').textContent,'Modifier / voir');assert.ok(app.window.document.querySelector('#storyList').textContent.includes('<Sommet & col>'));
 const restored=appHarness(saved);restored.syntheticBlock();restored.gpxTrack=points();restored.buildGpxRoutes();assert.equal(restored.storyPinsFor()[0].name,'<Sommet & col>');near(restored.storyPinsFor()[0].progress,.7);
 restored.gpxTrack=points().map(p=>({...p,lon:p.lon+.001}));restored.buildGpxRoutes();assert.equal(restored.storyPinsFor().length,0);app.dom.window.close();restored.dom.window.close();
});
test('GPX export includes all stops and restores the paused story state after cancellation',async()=>{
 let app,duration,completed=false;const seen=new Set();
 class ExportStub{active=false;cancelled=false;async start(options){duration=options.duration;this.active=true;try{for(let i=0;i<Math.round(duration*30);i++){options.renderFrame({index:i,time:i/30,delta:i?1/30:0});if(app.story.active)seen.add(app.story.active.pin.name);}completed=app.gpxPlayer.progress===1&&!app.gpxPlayer.playing;return null;}finally{this.active=false;}}cancel(){this.cancelled=true;}}
 app=setup({VideoExport:ExportStub,supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]});add(app,50,'Premier');add(app,100,'Dernier',0);app.gpxPlayer.duration=4;app.setGpxProgress(0);app.toggleGpxAnimation();tick(app,6);app.toggleGpxAnimation();
 const saved=app.saveExportView(),expected=4+2.4+3+.5+app.storyPinsFor().reduce((n,p)=>n+stopDuration(p),0);
 app.window.document.querySelector('#loadingPanel').hidden=true;field(app,'exportMotion','gpx');await app.runVideoExport();near(duration,expected);assert.deepEqual([...seen],['Premier','Dernier']);assert.equal(completed,true);
 assert.equal(app.gpxPlayer.paused,true);near(app.story.active.elapsed,saved.story.active.elapsed);assert.ok(app.camera.position.distanceTo(saved.position)<1e-6);near(app.gpxPlayer.progress,saved.player.progress);app.dom.window.close();
});

test('editing a precise pin position, disabling narration, and deleting a step work through the controls',()=>{
 const app=setup();add(app,33.3333,'Col',0);const firstId=app.storyPinsFor()[0].id;
 app.window.document.querySelector('[data-story-edit]').click();field(app,'storyName','Sommet renommé');field(app,'storyPosition',66.6667);app.window.document.querySelector('#storySave').click();
 assert.equal(app.storyPinsFor().length,1);assert.equal(app.storyPinsFor()[0].id,firstId);near(app.storyPinsFor()[0].progress,.666667);
 const enabled=app.window.document.querySelector('#storyEnabled');enabled.checked=false;enabled.dispatchEvent(new app.window.Event('change'));
 app.gpxPlayer.duration=2;app.setGpxProgress(0);app.toggleGpxAnimation();tick(app,4.5);assert.equal(app.story.active,null);near(app.gpxPlayer.progress,1);
 app.window.document.querySelector('[data-story-delete]').click();assert.equal(app.storyPinsFor().length,0);assert.equal(JSON.parse(app.window.localStorage.getItem('mountainAnimatorProjectV3')).narrativePins.length,0);app.dom.window.close();
});

test('a tap on the terrain route sets the pin position; a drag does not place a pin',()=>{
 const app=setup(),canvas=app.window.document.querySelector('#sceneCanvas'),route=app.gpxPlayer.routeBlock.group.userData.route;
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:750});canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
 const edge=route.motion.segments[Math.floor(route.motion.segments.length*.6)],expected=edge.start/route.motion.total*100;const point=edge.a.clone();point.y-=.035;app.gpxPlayer.routeBlock.group.localToWorld(point);
 app.camera.position.copy(point).add(new THREE.Vector3(0,12,20));app.controls.target.copy(point);app.camera.lookAt(point);app.camera.updateMatrixWorld(true);app.gpxPlayer.routeBlock.group.updateWorldMatrix(true,true);
 const click=(type,x,y)=>canvas.dispatchEvent(new app.window.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true}));
 app.window.document.querySelector('#storyPick').click();click('pointerdown',600,375);click('pointerup',650,375);assert.equal(canvas.style.cursor,'crosshair');
 click('pointerdown',600,375);click('pointerup',600,375);assert.equal(canvas.style.cursor,'');const value=+app.window.document.querySelector('#storyPosition').value;near(value,expected,.01);assert.equal(app.window.document.querySelector('#gpxSection').open,true);assert.equal(app.window.document.querySelector('#storyEditor').open,true);app.dom.window.close();
});
