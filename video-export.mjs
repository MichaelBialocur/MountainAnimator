export function videoDimensions(resolution,orientation){
  const pair=resolution==='4k'?[3840,2160]:[1920,1080];return orientation==='portrait'?pair.reverse():pair;
}
export function frameTiming(index,fps){
  const timestamp=Math.round(index*1e6/fps);
  return {timestamp,duration:Math.round((index+1)*1e6/fps)-timestamp};
}
export function supportedVideoTypes(Encoder=globalThis.VideoEncoder){
  return Encoder?[{ext:'mp4',label:'MP4 · H.264'},{ext:'webm',label:'WebM · VP9 / VP8'}]:[];
}
export async function encoderConfiguration(ext,width,height,fps,Encoder=globalThis.VideoEncoder){
  if(!Encoder)throw Error('Le rendu image par image nécessite WebCodecs. Ouvre cette page dans Chrome ou Edge récent.');
  const codecs=ext==='mp4'?(Math.max(width,height)>1920?['avc1.640034','avc1.420034']:['avc1.64002a','avc1.42002a']):['vp09.00.51.08','vp8'];
  for(const codec of codecs){
    const config={codec,width,height,framerate:fps,bitrate:Math.max(width,height)>2000?45000000:16000000,latencyMode:'quality',hardwareAcceleration:'no-preference'};
    if(ext==='mp4')config.avc={format:'avc'};
    try{const result=await Encoder.isConfigSupported(config);if(result.supported)return result.config;}catch{}
  }
  throw Error(`Aucun encodeur ${ext.toUpperCase()} disponible pour ${width} × ${height} à ${fps} i/s. Essaie WebM, 1080p ou 30 i/s.`);
}
export async function createVideoMuxer(ext,config,fps,totalFrames){
  const module=ext==='mp4'?await import('./vendor/mp4-muxer.mjs'):await import('./vendor/webm-muxer.mjs');
  const target=new module.ArrayBufferTarget();
  const muxer=new module.Muxer({target,video:{codec:ext==='mp4'?'avc':config.codec==='vp8'?'V_VP8':'V_VP9',width:config.width,height:config.height,frameRate:fps},
    ...(ext==='mp4'?{fastStart:{expectedVideoChunks:totalFrames}}:{}),firstTimestampBehavior:'strict'});
  return {add(chunk,meta){
    const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);
    if(ext==='mp4')muxer.addVideoChunkRaw(bytes,chunk.type,chunk.timestamp,chunk.duration??frameTiming(Math.round(chunk.timestamp*fps/1e6),fps).duration,meta);
    else muxer.addVideoChunkRaw(bytes,chunk.type,chunk.timestamp,meta);
  },finish(){muxer.finalize();return new Blob([target.buffer],{type:`video/${ext}`});}};
}

// The wall clock never enters the film timeline. Every frame is rendered and
// encoded with its own prescribed timestamp, with bounded encoder backpressure.
export class VideoExport {
  constructor({Encoder=globalThis.VideoEncoder,Frame=globalThis.VideoFrame,makeMuxer=createVideoMuxer,yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
    Object.assign(this,{Encoder,Frame,makeMuxer,yieldTask});this.active=false;this.cancelled=false;
  }
  cancel(){this.cancelled=true;}
  async start({canvas,ext,fps=30,duration,renderFrame,onProgress=()=>{}}){
    if(this.active)throw Error('Un rendu est déjà en cours.');
    if(![30,60].includes(fps)||!Number.isFinite(duration)||duration<=0||duration>300)throw Error('Durée ou cadence vidéo invalide.');
    this.active=true;this.cancelled=false;let encoder;
    try{
      const config=await encoderConfiguration(ext,canvas.width,canvas.height,fps,this.Encoder);
      if(this.cancelled)return null;
      const total=Math.round(duration*fps),muxer=await this.makeMuxer(ext,config,fps,total);
      let error=null,outputCount=0,bytes=0;
      encoder=new this.Encoder({output:(chunk,meta)=>{
        if(this.cancelled||error)return;
        try{bytes+=chunk.byteLength;if(bytes>512*1024*1024)throw Error('Le fichier dépasse 512 Mo. Réduis la durée ou la résolution.');muxer.add(chunk,meta);outputCount++;}catch(e){error=e;}
      },error:e=>{error=e;}});
      encoder.configure(config);
      for(let index=0;index<total;index++){
        if(this.cancelled)return null;if(error)throw error;
        await renderFrame({index,time:index/fps,delta:index===0?0:1/fps,total});
        if(this.cancelled)return null;
        const frame=new this.Frame(canvas,frameTiming(index,fps));
        try{encoder.encode(frame,{keyFrame:index%(fps*2)===0});}finally{frame.close();}
        // Waiting for the encoder can take any amount of time without moving
        // the next frame's animation timestamp or dropping a rendered frame.
        if(encoder.encodeQueueSize>=4)await encoder.flush();
        if(error)throw error;
        onProgress(index+1,total);await this.yieldTask();
      }
      await encoder.flush();if(this.cancelled)return null;if(error)throw error;
      if(outputCount!==total)throw Error(`Encodage incomplet : ${outputCount} / ${total} images. Aucun fichier incomplet n’a été livré.`);
      return muxer.finish();
    }finally{if(encoder&&encoder.state!=='closed')encoder.close();this.active=false;}
  }
}
