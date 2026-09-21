import {sampleBookNarration} from './travel-book.mjs?v=12';
import * as THREE from 'three';
import {clamp,smootherstep} from './route-motion.mjs?v=7';
const mix=(a,b,t)=>({position:a.position.clone().lerp(b.position,smootherstep(t)),target:a.target.clone().lerp(b.target,smootherstep(t))});
export function sampleCameraShot(shot,time){
  const t=clamp(time/shot.duration);
  if(shot.type==='book'){
    const options={openBook:shot.openBook,closeBook:shot.closeBook};
    if(time<2.4)return mix(shot.start,shot.openBook?shot.closed:shot.from,clamp(time/2.4));
    const state=sampleBookNarration(shot.pageCount||1,time,shot.hold||7,options);
    // Page/cover easing is already applied; camera follows that same opening angle.
    return {position:shot.closed.position.clone().lerp(shot.from.position,state.openness),target:shot.closed.target.clone().lerp(shot.from.target,state.openness)};
  }
  if(shot.type==='transfer'){
    if(t<.16)return mix(shot.start,shot.from,t/.16);
    if(t<.5)return mix(shot.from,shot.overview,(t-.16)/.34);
    if(t<.62)return mix(shot.overview,shot.overview,0);
    return mix(shot.overview,shot.to,(t-.62)/.38);
  }
  const lead=Math.min(2,shot.duration*.2)/shot.duration;
  if(t<lead)return mix(shot.start,shot.from,t/lead);
  const angle=THREE.MathUtils.degToRad(shot.angle)*smootherstep((t-lead)/(1-lead));
  return {position:shot.from.position.clone().sub(shot.from.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(shot.from.target),target:shot.from.target.clone()};
}
export function compileCameraSequence(shots,start,resolve,overview){
  if(!shots.length)throw Error('Ajoute au moins une séquence.');
  let cursor=0,previous=start;const tracks=[];
  for(const spec of shots){
    const shot={...spec,blockId:spec.from,duration:clamp(Number(spec.duration)||12,4,295),angle:clamp(Number(spec.angle)||360,-720,720),start:previous,from:resolve(spec.from,spec),overview};
    if(spec.type==='book')shot.closed=resolve(spec.from,{...spec,bookOpenness:0});
    if(spec.type==='transfer'){if(spec.from===spec.to)throw Error('Choisis deux montagnes différentes pour la liaison.');shot.to=resolve(spec.to,spec);}
    tracks.push({...shot,at:cursor});cursor+=shot.duration;previous=sampleCameraShot(shot,shot.duration);
  }
  return {tracks,duration:cursor};
}
export function sampleCameraSequence(timeline,time){
  const track=timeline.tracks.find(t=>time<t.at+t.duration)||timeline.tracks.at(-1);
  return sampleCameraShot(track,clamp(time-track.at,0,track.duration));
}

