import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SURFACE_DEFAULTS,SURFACE_LIMITS,cleanSurfaceSettings,classifySurface,analyzeSurfacePixels,sampleSurfaceTriangle,planSurfaceDecor} from '../surface-decor.mjs';
import {createSceneDecor} from '../scene-decor.mjs';
import {pointInOutline} from '../route-motion.mjs';
import {appHarness} from './harness.mjs';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const outline=Array.from({length:80},(_,i)=>({x:.95*Math.cos(i*Math.PI/40),z:.95*Math.sin(i*Math.PI/40)}));
const terrain={grid:1,size:12,heights:new Float32Array([1800,2200,2000,2150])};
function image(){
 const width=64,height=64,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=x<32?[48,66,39,255]:[123,118,105,255];if(y<8)color.splice(0,4,...[230,238,242,255]);data.set(color,(y*width+x)*4);}
 return {width,height,data};
}
const settings={...SURFACE_DEFAULTS,surfaceEnabled:true};
function inject(b){b.data.surfaceImage=image();b.data.surfaceMask=analyzeSurfacePixels(b.data.surfaceImage);}
const input=(app,id,value,type='input')=>{const el=app.window.document.getElementById(id);el.value=value;el.dispatchEvent(new app.window.Event(type));};
const enable=(app,id,value)=>{const el=app.window.document.getElementById(id);el.checked=value;el.dispatchEvent(new app.window.Event('change'));};

test('colour estimates separate dark green, mineral, bright pasture, snow, water and transparent pixels',()=>{
 assert.ok(classifySurface(48,66,39).forest>.5);assert.equal(classifySurface(48,66,39).rock,0);
 assert.ok(classifySurface(123,118,105).rock>.52);assert.ok(classifySurface(95,120,63).forest<.5);
 for(const rgba of [[232,240,248,255],[35,65,85,255],[0,0,0,255],[48,66,39,0]]){const c=classifySurface(...rgba);assert.equal(c.forest,0);assert.equal(c.rock,0);}
 assert.throws(()=>analyzeSurfacePixels(null));
});
test('height sampling matches both rendered triangles of a saddle, including normal and vertical scale',()=>{
 const t={grid:1,size:1,heights:new Float32Array([100,300,500,100])};
 near(sampleSurfaceTriangle(t,.2,.3).altitude,260);near(sampleSurfaceTriangle(t,.8,.7).altitude,240);
 near(sampleSurfaceTriangle(t,.8,.7,2).y,.48);near(sampleSurfaceTriangle(t,1,1).altitude,100);
 const n=sampleSurfaceTriangle(t,.2,.3,2).normal;near(new THREE.Vector3(...n).length(),1);assert.ok(n[0]<0&&n[2]<0);
});
test('objects follow image orientation, stay inside cut edges, respect budget and repeat deterministically',()=>{
 const mask=analyzeSurfacePixels(image()),items=planSurfaceDecor(terrain,mask,outline,settings,{quality:'balanced'});
 assert.ok(items.filter(p=>p.type==='tree').length>100);assert.ok(items.filter(p=>p.type==='rock').length>100);
 assert.ok(items.length<=SURFACE_LIMITS.balanced.tree+SURFACE_LIMITS.balanced.rock);
 for(const p of items){assert.equal(p.x<0,p.type==='tree');assert.ok(p.z> -4.5);assert.ok(pointInOutline(p.x/6,p.z/6,outline));const sample=sampleSurfaceTriangle(terrain,p.x/12+.5,p.z/12+.5);near(p.y+(p.type==='tree'?.00025:p.radius*.22),sample.y);}
 assert.deepEqual(items,planSurfaceDecor(terrain,mask,outline,settings,{quality:'balanced'}));assert.notDeepEqual(items,planSurfaceDecor(terrain,mask,outline,{...settings,surfaceSeed:2},{quality:'balanced'}));
});
test('altitude, cliffs, added snow and density zero suppress unsuitable placements',()=>{
 const mask=analyzeSurfacePixels(image());
 assert.ok(planSurfaceDecor(terrain,mask,outline,{...settings,surfaceTreeAltitude:500},{quality:'balanced'}).every(p=>p.type==='rock'));
 const cliff={grid:1,size:1,heights:new Float32Array([0,4000,0,4000])};assert.equal(planSurfaceDecor(cliff,mask,outline,settings).length,0);
 assert.equal(planSurfaceDecor(terrain,mask,outline,{...settings,snowEnabled:true,snowAltitude:1500}).length,0);
 assert.equal(planSurfaceDecor(terrain,mask,outline,{...settings,surfaceTreeDensity:0,surfaceRockDensity:0}).length,0);
 assert.equal(cleanSurfaceSettings({surfaceRockSize:Infinity}).surfaceRockSize,3);assert.equal(cleanSurfaceSettings({surfaceTreeDensity:1e9}).surfaceTreeDensity,100);
});
test('tree trunks remain vertical and metre sized while rocks align to the terrain normal',()=>{
 const items=planSurfaceDecor(terrain,analyzeSurfacePixels(image()),outline,settings,{quality:'balanced'}),root=createSceneDecor(items,{surface:true});
 const mesh=root.getObjectByName('tree-trunks'),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();mesh.getMatrixAt(0,matrix);scale.setFromMatrixScale(matrix);assert.ok(scale.y*1.5>.018&&scale.y*1.5<.033);
 const up=new THREE.Vector3(0,1,0).transformDirection(matrix);near(up.y,1);
 const rockMesh=root.children.find(m=>m.name.startsWith('rock-'));rockMesh.getMatrixAt(0,matrix);const pos=new THREE.Vector3().setFromMatrixPosition(matrix),p=items.find(p=>p.type==='rock'&&Math.hypot(p.x-pos.x,p.z-pos.z)<1e-5);assert.ok(p);assert.ok(new THREE.Vector3(0,1,0).transformDirection(matrix).distanceTo(new THREE.Vector3(...p.normal))<1e-6);
 root.userData.dispose();assert.equal(root.children.length,0);
});
test('per-mountain controls persist; rotation and exaggeration keep objects anchored and release replaced instances',()=>{
 const app=appHarness(),b=app.syntheticBlock();inject(b);enable(app,'surfaceEnabled',true);let root=b.group.userData.surfaceDecor;assert.ok(root);const first=root.userData.items[0],coords=root.userData.items.map(p=>[p.x,p.z]);
 let disposed=0;root.children.forEach(m=>m.addEventListener('dispose',()=>disposed++));
 input(app,'exaggeration',2);root=b.group.userData.surfaceDecor;assert.ok(disposed>0);assert.deepEqual(root.userData.items.map(p=>[p.x,p.z]),coords);near(root.userData.items[0].y,first.altitude/1000*2-.00025);
 const top=b.group.userData.top;top.updateWorldMatrix(true,false);for(const p of root.userData.items.slice(0,30)){
   const ray=new THREE.Raycaster(new THREE.Vector3(p.x,20,p.z),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(top)[0];assert.ok(hit);near(hit.point.y,p.y+.00025,1e-5);
 }
 input(app,'blockRotation',75);assert.equal(root.parent,b.group);near(root.getWorldQuaternion(new THREE.Quaternion()).angleTo(b.group.getWorldQuaternion(new THREE.Quaternion())),0);
 input(app,'surfaceTreeHeight',33);app.flushSurfaceDecor();const saved=JSON.parse(JSON.stringify(app.projectSnapshot())),restored=appHarness(saved);assert.equal(restored.settingsFor('chavalard').surfaceTreeHeight,33);assert.equal(restored.settingsFor('chavalard').surfaceEnabled,true);assert.equal(restored.settingsFor('lagginhorn').surfaceEnabled,false);
 const again=restored.syntheticBlock();inject(again);restored.refreshSurfaceDecor(again);assert.deepEqual(JSON.parse(JSON.stringify(again.group.userData.surfaceDecor.userData.items)),JSON.parse(JSON.stringify(b.group.userData.surfaceDecor.userData.items)));
 app.clearBlocks();assert.equal(app.scene.getObjectByName('mountain-surface-decor'),undefined);app.dom.window.close();restored.dom.window.close();
});
test('image read failure keeps terrain usable and reports the analysis problem',()=>{
 const app=appHarness(undefined,{console:{...console,warn(){}}}),b=app.syntheticBlock();const proto=app.window.HTMLCanvasElement.prototype,previous=proto.getContext;
 proto.getContext=function(){const ctx=previous.call(this);ctx.getImageData=()=>{throw Error('tainted image');};return ctx;};
 enable(app,'surfaceEnabled',true);assert.ok(b.group.userData.top);assert.equal(b.group.userData.surfaceDecor,undefined);assert.match(app.window.document.getElementById('surfaceStatus').textContent,/indisponible/);app.dom.window.close();
});
test('video export flushes pending surface changes before frame zero, preserving layout through all frames',async()=>{
 let app,frames=0,root;
 class ExportStub{active=false;async start({renderFrame}){this.active=true;try{for(let i=0;i<3;i++){await renderFrame({index:i,time:i/30,delta:i?1/30:0,total:3});const b=app.blocks[0],current=b.group.userData.surfaceDecor;assert.ok(current);assert.ok(current.userData.items.every(p=>p.type==='rock'));if(root)assert.equal(root,current);root=current;frames++;}return null;}finally{this.active=false;}}}
 app=appHarness(undefined,{VideoExport:ExportStub,supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]});const b=app.syntheticBlock();inject(b);enable(app,'surfaceEnabled',true);input(app,'surfaceTreeDensity',0);
 assert.ok(b.group.userData.surfaceDecor.userData.items.some(p=>p.type==='tree'));app.window.document.getElementById('loadingPanel').hidden=true;input(app,'exportMotion','still','change');await app.runVideoExport();assert.equal(frames,3);app.dom.window.close();
});
