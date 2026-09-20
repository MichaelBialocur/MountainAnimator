import {clamp} from './route-motion.mjs?v=7';

// Bind saved annotations to a particular track rather than its file name.
export function trackFingerprint(points){
  let hash=2166136261;
  for(const p of points){const text=`${p.lat.toFixed(7)},${p.lon.toFixed(7)},${p.segment??0};`;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}}
  return `${points.length}-${(hash>>>0).toString(16)}`;
}
export function nearestRoutePoint(route,point,hint=0){
  let best=null;
  for(const e of route.segments){
    const dx=e.b.x-e.a.x,dz=e.b.z-e.a.z,length=dx*dx+dz*dz;
    const t=length?clamp(((point.x-e.a.x)*dx+(point.z-e.a.z)*dz)/length):0;
    const x=e.a.x+dx*t,z=e.a.z+dz*t,error=Math.hypot(x-point.x,z-point.z),progress=(e.start+(e.end-e.start)*t)/route.total;
    if(!best||error<best.error-1e-8||Math.abs(error-best.error)<1e-8&&Math.abs(progress-hint)<Math.abs(best.progress-hint))best={error,progress,t,edge:e};
  }
  return best;
}
export const stopDuration=pin=>2.4+pin.pause+(pin.angle?pin.orbitDuration:0);
export function nextStoryPin(pins,visited,progress,end){
  return pins.find(p=>!visited.includes(p.id)&&p.progress>=progress-1e-9&&p.progress<=end+1e-9);
}
export function sanitizeStoryPins(values){
  if(!Array.isArray(values))return [];
  return values.filter(p=>p&&typeof p.id==='string'&&typeof p.track==='string'&&typeof p.block==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>({...p,
    name:String(p.name||'Étape').slice(0,80),comment:String(p.comment||'').slice(0,240),progress:clamp(Number(p.progress)||0),
    pause:clamp(Number(p.pause)||0,0,30),angle:clamp(Number(p.angle)||0,-360,360),orbitDuration:clamp(Number(p.orbitDuration)||6,2,30)
  }));
}
