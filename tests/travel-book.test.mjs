import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sheetPoint,sampleBookReading,PAGE_TURN_SECONDS,cleanBookPages} from '../travel-book.mjs';
import {appHarness} from './harness.mjs';
import {sanitizeStoryPins} from '../gpx-story.mjs';
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const field=(app,id,value,type='change')=>{const e=app.window.document.querySelector('#'+id);e.value=value;e.dispatchEvent(new app.window.Event(type));};
const click=(app,id)=>app.window.document.querySelector('#'+id).click();
function setup(overrides){const a=appHarness(undefined,overrides);const b=a.syntheticBlock();a.refreshStatsBillboards();a.syncNotebookEditor();return {a,b};}

test('page bends instead of rigidly rotating, preserves length and never penetrates the page stack',()=>{
 for(const t of [0,.05,.25,.5,.75,.95,1])for(const v of [0,.5,1]){
  let length=0,previous=sheetPoint(0,v,t,2.7,3.6);near(previous.x,0);near(previous.y,.255);
  for(let i=1;i<=128;i++){const p=sheetPoint(i/128,v,t,2.7,3.6);assert.ok(p.y>=.2199);length+=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);previous=p;}
  assert.ok(Math.abs(length/2.7-1)<.02);
 }
 near(sheetPoint(1,0,0,2.7,3.6).x,2.7);near(sheetPoint(1,0,1,2.7,3.6).x,-2.7);
 const root=sheetPoint(0,.5,.5,2.7,3.6),middle=sheetPoint(.5,.5,.5,2.7,3.6),tip=sheetPoint(1,.5,.5,2.7,3.6);
 const cross=(middle.x-root.x)*(tip.y-root.y)-(middle.y-root.y)*(tip.x-root.x);assert.ok(Math.abs(cross)>.4,'curved cross-section, not a hinged plate');
});

test('reading holds each spread, turns smoothly and ends on the final spread, independent of frame cadence',()=>{
 const n=3,duration=2.4+n*7+(n-1)*PAGE_TURN_SECONDS;
 assert.deepEqual(sampleBookReading(n,0,duration),{index:0,turn:0});assert.deepEqual(sampleBookReading(n,8,duration),{index:0,turn:0});
 near(sampleBookReading(n,2.4+7+PAGE_TURN_SECONDS/2,duration).turn,.5);
 assert.deepEqual(sampleBookReading(n,duration,duration),{index:2,turn:0});
 const a=sampleBookReading(n,15.6,duration);for(const t of [20,2,15.6])sampleBookReading(n,t,duration);assert.deepEqual(sampleBookReading(n,15.6,duration),a);
 assert.deepEqual(sampleBookReading(1,20,9.4),{index:0,turn:0});
});

test('notebook editor saves pages per mountain, turns both ways and restores them after reload',()=>{
 const {a,b}=setup();click(a,'bookAdd');field(a,'bookTitle','Sur l’arête');field(a,'bookText','Un beau passage avant le sommet.');field(a,'bookCaption','Lumière du soir');click(a,'bookSave');
 assert.equal(b.config.bookPages.length,1);assert.equal(b.config.bookPages[0].title,'Sur l’arête');
 click(a,'bookPrevious');a.advanceBookTurns(1.1);assert.ok(b.group.userData.statsCard.userData.turn>.4);a.advanceBookTurns(1.1);assert.equal(b.config.bookIndex,0);
 click(a,'bookNext');a.advanceBookTurns(2.2);assert.equal(b.config.bookIndex,1);
 const saved=JSON.parse(a.window.localStorage.getItem('mountainAnimatorProjectV3')),restored=appHarness(saved);assert.equal(restored.settingsFor('chavalard').bookPages[0].text,'Un beau passage avant le sommet.');
 const other=a.syntheticBlock('lagginhorn',8.0031);assert.equal(other.config.bookPages.length,0);
 click(a,'bookDelete');assert.equal(b.config.bookPages.length,0);assert.equal(b.config.bookIndex,0);a.dom.window.close();restored.dom.window.close();
});

test('book camera frames its pages in portrait and landscape and a book shot joins a mountain transfer',()=>{
 const {a,b}=setup();click(a,'bookAdd');
 for(const aspect of [16/9,9/16]){a.camera.aspect=aspect;a.camera.updateProjectionMatrix();const pose=a.notebookCameraPose(b.peak.id);a.camera.position.copy(pose.position);a.camera.lookAt(pose.target);a.camera.updateMatrixWorld(true);const book=b.group.userData.statsCard;
  for(const x of [-book.userData.width/2,book.userData.width/2])for(const z of [-book.userData.height/2,book.userData.height/2]){const p=book.localToWorld(new THREE.Vector3(x,.23,z)).project(a.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);}
 }
 a.syntheticBlock('lagginhorn',8.0031);a.startCinema([{type:'book',from:'chavalard',hold:4},{type:'transfer',from:'chavalard',to:'lagginhorn',duration:12}]);
 const duration=a.cinema.timeline.tracks[0].duration;a.applyCinemaTime(duration-.01);assert.equal(b.group.userData.statsCard.userData.index,1);const position=a.camera.position.clone();a.applyCinemaTime(duration);assert.ok(a.camera.position.distanceTo(position)<1e-5);a.dom.window.close();
});

test('photo references survive pin/page validation without accepting arbitrary remote URLs',()=>{
 assert.equal(cleanBookPages([{image:'photo-test-1'}])[0].image,'photo-test-1');assert.equal(cleanBookPages([{image:'https://bad.test/photo'}])[0].image,'');
 const pin={id:'a',track:'b',block:'c',lat:46,lon:7,image:'photo-test-2'};assert.equal(sanitizeStoryPins([pin])[0].image,'photo-test-2');assert.equal(sanitizeStoryPins([{...pin,image:'javascript:bad'}])[0].image,'');
});

test('GPX photo is shown during its stop, fades out before departure, and remains above terrain',async()=>{
 const {a,b}=setup({mediaImage:()=>null});a.gpxTrack=[{lat:46.18,lon:7.09,ele:2400,segment:0},{lat:46.18,lon:7.15,ele:2600,segment:0}];a.buildGpxRoutes();
 const saved=JSON.parse(a.window.localStorage.getItem('mountainAnimatorProjectV3')||'{}');
 field(a,'storyName','Sommet');field(a,'storyPosition','50');field(a,'storyPause','5');field(a,'storyAngle','0');a.saveStoryPin();
 const data=JSON.parse(a.window.localStorage.getItem('mountainAnimatorProjectV3'));data.narrativePins[0].image='photo-summit';
 const restored=appHarness(data,{mediaImage:()=>null,prepareMedia:async()=>{}});restored.syntheticBlock();restored.gpxTrack=a.gpxTrack;restored.buildGpxRoutes();
 const pin=restored.storyPinsFor()[0];assert.equal(pin.label.material.map.image.height,1040);assert.equal(pin.label.material.depthTest,false);
 restored.camera.position.set(0,14,26);restored.camera.lookAt(0,2,0);restored.setGpxProgress(.5);restored.toggleGpxAnimation();for(let i=0;i<60;i++)restored.advancePlayback(.05);
 restored.updateStoryVisuals();assert.equal(pin.label.visible,true);assert.ok(pin.label.material.opacity>0);
 restored.story.active.elapsed=restored.story.active.duration-.3;restored.updateStoryVisuals();near(pin.label.material.opacity,0);
 restored.stopGpxAnimation();restored.updateStoryVisuals();assert.equal(pin.label.visible,false);await new Promise(resolve=>setImmediate(resolve));a.dom.window.close();restored.dom.window.close();
});

test('offline book rendering matches absolute preview time and restores a half-turned page',async()=>{
 let a;const frames=[];
 class ExportStub{async start({renderFrame,duration}){for(const time of [0,5,10.5,duration-1/30]){await renderFrame({index:Math.round(time*30),time,delta:1/30});frames.push({...a.blocks[0].group.userData.statsCard.userData});}return null;}cancel(){}}
 const setupResult=setup({VideoExport:ExportStub,supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]});a=setupResult.a;const b=setupResult.b;click(a,'bookAdd');click(a,'bookAddShot');
 click(a,'bookPrevious');a.advanceBookTurns(.8);const before=a.saveExportView();a.window.document.querySelector('#loadingPanel').hidden=true;field(a,'exportMotion','sequence');await a.runVideoExport();
 assert.equal(frames[0].index,0);assert.ok(frames[2].turn>.4&&frames[2].turn<.6);assert.equal(frames.at(-1).index,1);
 const now=b.group.userData.statsCard.userData;near(now.turn,before.books[0].turn);near(now.manualTurn.elapsed,.8);a.dom.window.close();
});
