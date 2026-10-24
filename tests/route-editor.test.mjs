import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {appHarness} from './harness.mjs';
const input=(app,id,value,type='input')=>{const node=app.window.document.getElementById(id);node.value=value;node.dispatchEvent(new app.window.Event(type));};
function setup(){
 const a=appHarness(),b=a.syntheticBlock(),c=a.window.document.getElementById('sceneCanvas');a.routeEditor.mountOptions();
 c.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:750});c.setPointerCapture=()=>{};c.releasePointerCapture=()=>{};
 a.camera.position.set(0,20,.001);a.controls.target.set(0,2.4,0);a.camera.lookAt(a.controls.target);a.camera.updateMatrixWorld(true);a.camera.aspect=1200/750;a.camera.updateProjectionMatrix();
 const point=(x,z)=>{const p=new THREE.Vector3(x,2.4,z).project(a.camera);return{x:(p.x*.5+.5)*1200,y:(1-p.y)*375};};
 const event=(type,p)=>{const e=new a.window.MouseEvent(type,{clientX:p.x,clientY:p.y,button:0,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:1});c.dispatchEvent(e);};
 const click=(x,z)=>{event('pointerdown',point(x,z));event('pointerup',point(x,z));};return {a,b,c,point,event,click};
}
test('click and left-drag drawing, grouped undo, terrain GPX commit, draft recovery and cancellation',()=>{
 const {a,b,event,point,click}=setup(),doc=a.window.document;const original=[{lat:46.18,lon:7.09,ele:2400,segment:0},{lat:46.18,lon:7.1,ele:2400,segment:0}];a.applyGpx(original,{name:'original.gpx'});
 a.routeEditor.start();assert.equal(a.controls.enabled,false);assert.equal(doc.getElementById('controlPanel').inert,true);click(-1,0);click(0,0);
 event('pointerdown',point(1,0));event('pointermove',point(1.5,.5));event('pointermove',point(2,1));event('pointerup',point(2,1));
 assert.ok(a.routeEditor.snapshot().anchors.length>=5);doc.getElementById('drawUndo').click();assert.equal(a.routeEditor.snapshot().anchors.length,2);doc.getElementById('drawRedo').click();assert.ok(a.routeEditor.snapshot().anchors.length>=5);
 assert.equal(a.gpxTrack,original,'old GPX stays unchanged until use');const draft=a.projectSnapshot().routeDraft;assert.ok(a.window.mountainWorkspace.busy());
 doc.getElementById('drawToolCamera').click();assert.equal(a.controls.enabled,true);doc.getElementById('drawToolDraw').click();assert.equal(a.controls.enabled,false);
 const restored=appHarness();restored.syntheticBlock();restored.routeEditor.mountOptions();restored.routeEditor.restore(JSON.parse(JSON.stringify(draft)));assert.ok(restored.routeEditor.active);assert.equal(restored.routeEditor.snapshot().anchors.length,draft.anchors.length);restored.routeEditor.close();restored.dom.window.close();
 doc.getElementById('drawFinish').click();assert.equal(a.routeEditor.active,false);assert.equal(doc.getElementById('controlPanel').inert,false);assert.ok(a.gpxTrack.length>5);assert.ok(a.gpxTrack.every(p=>Math.abs(p.ele-2400)<1e-5));assert.ok(b.group.userData.route);
 const snapshot=a.projectSnapshot();assert.equal(snapshot.routeDraft,null);assert.equal(snapshot.gpxSource.origin,'drawn');assert.equal(a.parseGpx(snapshot.gpxSource.text).length,a.gpxTrack.length);assert.equal(doc.getElementById('gpxDownload').disabled,false);
 const applied=a.gpxTrack;a.routeEditor.start();click(-2,-2);doc.getElementById('drawCancel').click();assert.equal(a.gpxTrack,applied);assert.equal(b.group.getObjectByName('gpx-drawing-preview'),undefined);a.dom.window.close();
});
test('misses on the floor add no points and do not turn the camera, while right mouse remains untouched',()=>{
 const {a,c,event,click}=setup();a.routeEditor.start();const before=a.camera.position.clone();click(50,50);assert.equal(a.routeEditor.snapshot().anchors.length,0);assert.ok(a.camera.position.equals(before));
 const e=new a.window.MouseEvent('pointerdown',{button:2,bubbles:true,cancelable:true});Object.defineProperty(e,'pointerId',{value:1});c.dispatchEvent(e);assert.equal(e.defaultPrevented,false);assert.equal(a.routeEditor.snapshot().anchors.length,0);a.routeEditor.close();a.dom.window.close();
});
test('a slow file import cannot overwrite the latest import or a new drawing draft',async()=>{
 const {a}=setup();let resolve;const slow=new Promise(r=>resolve=r),gpx=(lon)=>`<gpx><trk><trkseg><trkpt lat="46.18" lon="${lon}"><ele>2400</ele></trkpt><trkpt lat="46.18" lon="${lon+.01}"><ele>2400</ele></trkpt></trkseg></trk></gpx>`;
 const old=a.handleGpxFile({name:'slow.gpx',size:100,text:()=>slow});await a.handleGpxFile({name:'new.gpx',size:100,text:async()=>gpx(7.1)});resolve(gpx(7.09));await old;assert.equal(a.projectSnapshot().gpxSource.name,'new.gpx');
 let finish;const pending=a.handleGpxFile({name:'pending.gpx',size:100,text:()=>new Promise(r=>finish=r)});a.routeEditor.start();finish(gpx(7.08));await pending;assert.equal(a.projectSnapshot().gpxSource.name,'new.gpx');a.routeEditor.close();a.dom.window.close();
});
test('GPX style follows the selected route mountain even if a different block is being edited',()=>{
 const a=appHarness(),first=a.syntheticBlock(),second=a.syntheticBlock('lagginhorn');a.applyGpx([{lat:46.18,lon:7.09,ele:2400,segment:0},{lat:46.18,lon:7.15,ele:2400,segment:0}],{name:'route.gpx'});
 input(a,'gpxTarget','lagginhorn','change');input(a,'gpxColor','#bb2244');input(a,'gpxWidth','7');assert.equal(second.config.gpxColor,'#bb2244');assert.equal(second.config.gpxWidth,7);assert.equal(first.config.gpxWidth,4);assert.match(a.window.document.getElementById('gpxStyleTarget').textContent,/lagginhorn/);a.dom.window.close();
});
