import {clamp,smootherstep} from './route-motion.mjs?v=7';
export const VIDEO_MODES=['in-out','in','out','card'];
export function cleanPinVideo(pin){
 const video=typeof pin.video==='string'&&/^video-[a-zA-Z0-9-]{1,80}$/.test(pin.video)?pin.video:'';
 const duration=clamp(Number(pin.videoDuration)||0,0,86400),start=clamp(Number(pin.videoStart)||0,0,Math.max(0,duration-.1));
 const end=clamp(Number(pin.videoEnd)||Math.min(duration,start+10),start+.1,Math.min(duration,start+180));
 return {video:duration>.1?video:'',videoName:String(pin.videoName||'Vidéo').slice(0,120),videoDuration:duration,videoStart:start,videoEnd:end,videoMode:VIDEO_MODES.includes(pin.videoMode)?pin.videoMode:'in-out',videoTransition:clamp(Number(pin.videoTransition)||2,.5,6)};
}
export function videoStopPlan(pin){
 const p=cleanPinVideo(pin);if(!p.video)return null;
 const lead=p.videoMode==='out'?0:1.2+(pin.pause||0)+(pin.angle?pin.orbitDuration||0:0);
 const enter=['in','in-out'].includes(p.videoMode)?p.videoTransition:0;
 const exit=['out','in-out'].includes(p.videoMode)?p.videoTransition:0;
 const play=p.videoEnd-p.videoStart,tail=p.videoMode==='in'?0:1.2;
 return {...p,lead,enter,exit,play,tail,playAt:lead+enter,exitAt:lead+enter+play,total:lead+enter+play+exit+tail};
}
export function samplePinVideo(pin,time){
 const p=videoStopPlan(pin);if(!p)return null;
 const t=clamp(time,0,p.total);let expand=0;
 if(p.videoMode==='out')expand=t<p.exitAt?1:1-smootherstep((t-p.exitAt)/p.exit);
 else if(p.videoMode!=='card')expand=t<p.playAt?smootherstep((t-p.lead)/p.enter):t<=p.exitAt||!p.exit?1:1-smootherstep((t-p.exitAt)/p.exit);
 const opacity=p.videoMode==='out'||expand>.999?1:Math.min(clamp(t/.5),p.videoMode==='in'?1:clamp((p.total-t)/.8));
 return {id:p.video,time:p.videoStart+clamp(t-p.playAt,0,Math.max(0,p.play-.001)),expand,opacity,terminal:p.videoMode==='in'&&t>=p.total-1e-9,plan:p};
}
// Full-frame endpoints are exact, independent of viewport/video aspect ratio.
export function videoScreenRect(anchor,width,height,expand,aspect=16/9){
 const w=Math.min(width*.55,height*.38*aspect,360*height/750),h=w/aspect;
 const x=clamp(anchor.x+20*height/750,8,Math.max(8,width-w-8)),y=clamp(anchor.y-h-30*height/750,8,Math.max(8,height-h-8));
 return {x:x*(1-expand),y:y*(1-expand),width:w+(width-w)*expand,height:h+(height-h)*expand};
}
export function drawVideoFrame(ctx,video,rect,opacity=1){
 const {x,y,width:w,height:h}=rect,vw=video.videoWidth,vh=video.videoHeight;if(!vw||!vh)return;
 const scale=Math.max(w/vw,h/vh),sw=w/scale,sh=h/scale;
 ctx.save();ctx.globalAlpha=opacity;ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle='#000';ctx.fillRect(x,y,w,h);
 ctx.drawImage(video,(vw-sw)/2,(vh-sh)/2,sw,sh,x,y,w,h);ctx.restore();
}
