export function videoDimensions(resolution,orientation){
  const pair=resolution==='4k'?[3840,2160]:[1920,1080];return orientation==='portrait'?pair.reverse():pair;
}
export function supportedVideoTypes(Recorder=globalThis.MediaRecorder){
  if(!Recorder)return [];
  return [{mime:'video/mp4;codecs=avc1.420033',ext:'mp4'}, {mime:'video/mp4',ext:'mp4'}, {mime:'video/webm;codecs=vp9',ext:'webm'}, {mime:'video/webm;codecs=vp8',ext:'webm'}].filter(t=>Recorder.isTypeSupported(t.mime));
}
// Capture a fixed-resolution canvas; UI and CSS are never encoded.
export class VideoExport {
  constructor(){this.active=false;this.url=null;}
  start({canvas,mime,ext,onDone,onError,onCancel=()=>{}}){
    if(this.active)throw Error('Un export est déjà en cours.');
    let stream;
    try{
      stream=canvas.captureStream(30);this.recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:canvas.width>2000||canvas.height>2000?45000000:16000000});
      this.chunks=[];this.active=true;this.started=performance.now();this.cancelled=false;
      this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
      this.recorder.onerror=e=>{this.cancelled=true;onError(e.error||Error('Encodage vidéo impossible'));this.stop();};
      this.recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());this.active=false;if(!this.cancelled){if(this.url)URL.revokeObjectURL(this.url);this.url=URL.createObjectURL(new Blob(this.chunks,{type:this.recorder.mimeType}));onDone(this.url,ext);}else onCancel();this.chunks=[];};
      this.recorder.start(1000);
    }catch(e){stream?.getTracks().forEach(t=>t.stop());this.active=false;throw e;}
  }
  stop(cancel=false){this.cancelled ||= cancel;if(this.recorder?.state!=='inactive')this.recorder?.stop();}
}
