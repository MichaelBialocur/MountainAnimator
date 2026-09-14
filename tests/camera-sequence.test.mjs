import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {compileCameraSequence,sampleCameraSequence} from '../camera-sequence.mjs';
const pose=x=>({position:new THREE.Vector3(x,12,25),target:new THREE.Vector3(x,2,0)});
const resolve=id=>pose(id==='a'?-10:10);
test('orbit and connection are continuous at every phase and at shot boundaries',()=>{
 const start=pose(-8),overview={position:new THREE.Vector3(0,25,60),target:new THREE.Vector3(0,2,0)};
 const timeline=compileCameraSequence([{type:'orbit',from:'a',duration:12,angle:360},{type:'transfer',from:'a',to:'b',duration:12}],start,resolve,overview);
 assert.ok(sampleCameraSequence(timeline,0).position.equals(start.position));
 for(const t of [2,12,12+12*.16,18,12+12*.62,24]){const a=sampleCameraSequence(timeline,t-1e-5),b=sampleCameraSequence(timeline,t+1e-5);assert.ok(a.position.distanceTo(b.position)<.001);}
 assert.ok(sampleCameraSequence(timeline,24).position.distanceTo(resolve('b').position)<1e-8);
 assert.ok(sampleCameraSequence(timeline,18.5).position.equals(overview.position));
});
test('negative orbit keeps the selected mountain as pivot and maintains radius',()=>{
 const start=pose(0),timeline=compileCameraSequence([{type:'orbit',from:'b',angle:-180,duration:10}],start,resolve,pose(0));
 const end=sampleCameraSequence(timeline,10);assert.ok(end.target.equals(resolve('b').target));assert.ok(Math.abs(end.position.distanceTo(end.target)-resolve('b').position.distanceTo(resolve('b').target))<1e-8);assert.ok(end.position.z<0);
 assert.throws(()=>compileCameraSequence([{type:'transfer',from:'a',to:'a'}],start,resolve,pose(0)),/différentes/);
});
