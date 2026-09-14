import test from 'node:test';
import assert from 'node:assert/strict';
import {videoDimensions,supportedVideoTypes,VideoExport,frameTiming,encoderConfiguration} from '../video-export.mjs';

test('output resolution and portrait orientation use exact pixels',()=>{
 assert.deepEqual(videoDimensions('4k','portrait'),[2160,3840]);assert.deepEqual(videoDimensions('1080p','landscape'),[1920,1080]);
 assert.deepEqual(videoDimensions('4k','landscape'),[3840,2160]);assert.deepEqual(videoDimensions('1080p','portrait'),[1080,1920]);assert.deepEqual(supportedVideoTypes(null),[]);
});
function fakeRuntime({delay=0,drop=false,fail=false}={}){
 const rendered=[],encoded=[],closed=[],outputs=[];let finalized=0,encoderClosed=0;
 class Frame{constructor(canvas,init){Object.assign(this,init);}close(){closed.push(this.timestamp);}}
 class Encoder{
   static async isConfigSupported(config){return {supported:true,config};}
   constructor(callbacks){Object.assign(this,callbacks);this.state='unconfigured';this.queue=[];}
   configure(){this.state='configured';}get encodeQueueSize(){return this.queue.length;}
   encode(frame){encoded.push(frame.timestamp);this.queue.push({...frame,byteLength:10,type:'key'});}
   async flush(){await new Promise(r=>setTimeout(r,delay));if(fail){this.error(Error('encoder failed'));this.queue=[];return;}
     for(const chunk of this.queue){if(!drop)this.output(chunk,{});}this.queue=[];
   }
   close(){this.state='closed';encoderClosed++;}
 }
 const exporter=new VideoExport({Encoder,Frame,makeMuxer:async()=>({add:c=>outputs.push(c.timestamp),finish:()=>{finalized++;return new Blob(['film']);}}),yieldTask:async()=>{}});
 const options={canvas:{width:1920,height:1080},ext:'mp4',fps:30,duration:1,renderFrame:async frame=>{if(delay)await new Promise(r=>setTimeout(r,delay));rendered.push(frame);}};
 return {exporter,options,rendered,encoded,closed,outputs,get finalized(){return finalized;},get encoderClosed(){return encoderClosed;}};
}
test('slow rendering and encoding keep every timestamp identical to a fast render',async()=>{
 const fast=fakeRuntime(),slow=fakeRuntime({delay:3});await fast.exporter.start(fast.options);await slow.exporter.start(slow.options);
 assert.equal(slow.rendered.length,30);assert.deepEqual(slow.encoded,fast.encoded);assert.deepEqual(slow.outputs,fast.outputs);
 assert.deepEqual(slow.closed,slow.encoded);assert.equal(slow.rendered[0].delta,0);assert.ok(slow.rendered.slice(1).every(f=>f.delta===1/30));
 assert.equal(slow.finalized,1);assert.equal(slow.encoderClosed,1);assert.equal(slow.exporter.active,false);
 const last=frameTiming(29,30);assert.equal(last.timestamp+last.duration,1000000);
 const last60=frameTiming(599,60);assert.equal(last60.timestamp+last60.duration,10000000);
});
test('cancellation during render does not encode or deliver an incomplete file',async()=>{
 const r=fakeRuntime();const result=await r.exporter.start({...r.options,renderFrame:frame=>{if(frame.index===5)r.exporter.cancel();}});
 assert.equal(result,null);assert.equal(r.encoded.length,5);assert.equal(r.finalized,0);assert.equal(r.encoderClosed,1);assert.equal(r.exporter.active,false);
});
test('encoder error and dropped output are explicit failures, never a choppy success',async()=>{
 for(const settings of [{drop:true},{fail:true}]){const r=fakeRuntime(settings);await assert.rejects(r.exporter.start(r.options),/incomplet|encoder failed/);assert.equal(r.finalized,0);assert.equal(r.encoderClosed,1);assert.equal(r.exporter.active,false);}
});
test('unsupported exact dimensions/codec fail before starting a render',async()=>{
 await assert.rejects(encoderConfiguration('mp4',2160,3840,60,{isConfigSupported:async()=>({supported:false})}),/2160 × 3840/);
});
