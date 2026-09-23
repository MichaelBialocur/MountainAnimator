import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {samplePinVideo,videoStopPlan,videoScreenRect,cleanPinVideo,drawVideoFrame} from '../story-video.mjs';
import {stopDuration} from '../gpx-story.mjs';
import {appHarness,fakeContext} from './harness.mjs';
const videoPin=(mode='in-out')=>({video:'video-test',videoDuration:6,videoStart:1,videoEnd:4,videoTransition:2,videoMode:mode,pause:2,angle:0,orbitDuration:4});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const track=[{lat:46.18,lon:7.09,ele:2400,segment:0},{lat:46.18,lon:7.15,ele:2600,segment:0}];
function setup(overrides={}){const a=appHarness(undefined,{mediaVideo:()=>({duration:6,videoWidth:320,videoHeight:180}),...overrides}),b=a.syntheticBlock();a.gpxTrack=track;a.buildGpxRoutes();a.camera.position.set(0,15,25);a.controls.target.set(0,2,0);a.camera.lookAt(a.controls.target);return {a,b};}
function pin(a,mode='in-out'){a.window.document.getElementById('storyPosition').value='50';a.window.document.getElementById('storyName').value='Col';a.saveStoryPin();const p=a.storyPinsFor()[0];Object.assign(p,videoPin(mode));return p;}

test('video timeline has exact full-screen endpoints and separate source trim time',()=>{
 for(const mode of ['in-out','in','out','card']){const p=videoPin(mode),plan=videoStopPlan(p);near(stopDuration(p),plan.total);const first=samplePinVideo(p,0),end=samplePinVideo(p,plan.total);near(first.time,1);assert.ok(end.time<4&&end.time>3.99);near(first.expand,mode==='out'?1:0);near(end.expand,mode==='in'?1:0);
 if(mode!=='card')near(samplePinVideo(p,plan.playAt+1).expand,1);if(mode==='in-out')near(samplePinVideo(p,plan.exitAt+1).expand,.5);}
 assert.equal(cleanPinVideo({...videoPin(),video:'https://remote.test/a.mp4'}).video,'');
});
test('full screen means every pixel in portrait, landscape and square without distortion',()=>{
 for(const [w,h] of [[1920,1080],[1080,1920],[500,500]])for(const aspect of [16/9,9/16]){
 const r=videoScreenRect({x:10,y:10},w,h,1,aspect);assert.deepEqual(r,{x:0,y:0,width:w,height:h});let args;const ctx=fakeContext();ctx.drawImage=(...a)=>args=a;drawVideoFrame(ctx,{videoWidth:900,videoHeight:1600},r);near(args[3]/args[4],w/h);assert.deepEqual(args.slice(5),[0,0,w,h]);}
});
test('a video holds GPX progress, pauses, then resumes or stays full screen as requested',()=>{
 for(const mode of ['in-out','out','in']){const {a}=setup(),p=pin(a,mode);a.startFromStoryPin(p);a.advancePlayback(1);near(a.gpxPlayer.progress,.5);a.toggleGpxAnimation();const elapsed=a.story.active.elapsed;a.advancePlayback(10);near(a.story.active.elapsed,elapsed);a.toggleGpxAnimation();a.advancePlayback(stopDuration(p));
 if(mode==='in'){assert.equal(a.gpxPlayer.phase,'video-end');near(a.gpxPlayer.progress,.5);a.toggleGpxAnimation();a.advancePlayback(.1);assert.ok(a.gpxPlayer.progress>.5);}else{assert.equal(a.story.active,null);assert.ok(a.gpxPlayer.progress>.5);}a.dom.window.close();}
});
test('export waits for a source frame and restores the paused video stop',async()=>{
 let a,seeks=[];const decoded={duration:6,videoWidth:320,videoHeight:180};
 class ExportStub{async start({renderFrame,duration}){for(let i=0;i<Math.ceil(duration*30);i++)await renderFrame({index:i,time:i/30,delta:i?1/30:0});return null;}cancel(){}}
 ({a}=setup({VideoExport:ExportStub,seekVideo:async(id,t)=>{await new Promise(r=>setTimeout(r,1));seeks.push(t);return decoded;},supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]}));const p=pin(a);a.startFromStoryPin(p);a.advancePlayback(7);a.toggleGpxAnimation();const before=a.story.active.elapsed;
 a.window.document.getElementById('loadingPanel').hidden=true;a.window.document.getElementById('exportMotion').value='current';a.window.document.getElementById('exportDuration').value='15';await a.runVideoExport();assert.ok(seeks.length>100);near(a.story.active.elapsed,before);assert.equal(a.gpxPlayer.paused,true);a.dom.window.close();
});
test('rounded spine bridges back and front covers throughout opening and remains solid',()=>{
 const {a,b}=setup();a.refreshStatsBillboards();const book=b.group.userData.statsCard,spine=book.getObjectByName('book-rounded-spine');assert.ok(book.getObjectByName('book-back-cover'));assert.ok(book.getObjectByName('book-back-cover-art'));assert.ok(spine.geometry.index.count>500);
 for(const open of [0,.25,.5,.75,1]){book.userData.setOpenness(open);const values=spine.geometry.attributes.position.array;assert.ok([...values].every(Number.isFinite));const height=new THREE.Box3().setFromBufferAttribute(spine.geometry.attributes.position).getSize(new THREE.Vector3()).y;assert.ok(height>.05);if(!open)assert.ok(height>.49);}
 a.dom.window.close();
});
