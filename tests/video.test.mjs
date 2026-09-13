import test from 'node:test';
import assert from 'node:assert/strict';
import {videoDimensions,supportedVideoTypes,VideoExport} from '../video-export.mjs';
test('export resolution and orientation use exact output pixels',()=>{
 assert.deepEqual(videoDimensions('4k','portrait'),[2160,3840]);assert.deepEqual(videoDimensions('1080p','landscape'),[1920,1080]);
 assert.deepEqual(videoDimensions('4k','landscape'),[3840,2160]);assert.deepEqual(videoDimensions('1080p','portrait'),[1080,1920]);
 assert.deepEqual(supportedVideoTypes(null),[]);
 assert.ok(supportedVideoTypes({isTypeSupported:m=>m.includes('webm')}).every(t=>t.ext==='webm'));
});
test('recording stop downloads a blob, cancellation releases tracks without download',()=>{
 const previous=globalThis.MediaRecorder;let stopped=0,downloaded=0;
 globalThis.MediaRecorder=class {constructor(s,o){this.mimeType=o.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['frame'])});this.onstop();}};
 try{
 const exporter=new VideoExport(),options={canvas:{width:1920,height:1080,captureStream:()=>({getTracks:()=>[{stop:()=>stopped++}]})},mime:'video/webm',ext:'webm',onDone:url=>{downloaded++;URL.revokeObjectURL(url);},onError:e=>{throw e;}};
 exporter.start(options);assert.equal(exporter.active,true);exporter.stop();assert.equal(downloaded,1);assert.equal(stopped,1);assert.equal(exporter.active,false);
 exporter.start(options);exporter.stop(true);assert.equal(downloaded,1);assert.equal(stopped,2);
 }finally{globalThis.MediaRecorder=previous;}
});
