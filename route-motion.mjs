// Pure distance-based path math: no renderer, frame rate or point-count dependency.
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const smootherstep = value => { const t = clamp(value); return t*t*t*(t*(t*6-15)+10); };
export const dampingAlpha = (dt, seconds = .7) => 1 - Math.exp(-Math.max(0, dt) / seconds);
export const lerpPoint = (a, b, t) => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t });

export function distanceKm(a, b) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat-a.lat)*radians/2)**2 + Math.cos(a.lat*radians)*Math.cos(b.lat*radians)*Math.sin((b.lon-a.lon)*radians/2)**2;
  return 12742 * Math.asin(Math.sqrt(clamp(h)));
}

export function measureRoute(edges) {
  let total = 0;
  const segments = [];
  for (const edge of edges) {
    const length = edge.length ?? Math.hypot(edge.b.x-edge.a.x, edge.b.y-edge.a.y, edge.b.z-edge.a.z);
    if (!Number.isFinite(length) || length < 1e-10) continue;
    const start = total;
    total += length;
    segments.push({ ...edge, start, end:total });
  }
  // Cached ranges keep camera smoothing inside a recorded, visible segment.
  let first = 0;
  while (first < segments.length) {
    let last = first;
    while (last+1 < segments.length && segments[last+1].part === segments[first].part) last++;
    for (let i=first; i<=last; i++) {
      segments[i].partStart = segments[first].start;
      segments[i].partEnd = segments[last].end;
    }
    first = last+1;
  }
  return { segments, total };
}

export function sampleRoute(route, distance) {
  if (!route.segments.length) return null;
  const d = clamp(distance, 0, route.total);
  let lo=0, hi=route.segments.length-1;
  while (lo<hi) {
    const mid=(lo+hi)>>1;
    if (route.segments[mid].end < d) lo=mid+1; else hi=mid;
  }
  const segment=route.segments[lo];
  const t=clamp((d-segment.start)/(segment.end-segment.start));
  return { index:lo, t, point:lerpPoint(segment.a,segment.b,t), part:segment.part, distance:d };
}

export function smoothRoutePoint(route, distance, radius=.18) {
  const current=sampleRoute(route,distance);
  if (!current) return null;
  const segment=route.segments[current.index];
  const width=Math.min(radius,(segment.partEnd-segment.partStart)*.2);
  const result={x:0,y:0,z:0};
  let sum=0;
  const epsilon=Math.min(1e-10,(segment.partEnd-segment.partStart)*.01);
  for (let i=-16;i<=16;i++) {
    const weight=Math.exp(-i*i/128);
    const d=clamp(distance+i*width/16,segment.partStart+epsilon,segment.partEnd-epsilon);
    const point=sampleRoute(route,d).point;
    result.x+=point.x*weight; result.y+=point.y*weight; result.z+=point.z*weight; sum+=weight;
  }
  return {x:result.x/sum,y:result.y/sum,z:result.z/sum};
}

// Clip an edge against a square before sampling relief. Returns source fractions.
export function clipToBounds(a, b, bounds) {
  const dx=b.lon-a.lon, dy=b.lat-a.lat;
  let lo=0,hi=1;
  for (const [p,q] of [[-dx,a.lon-bounds.west],[dx,bounds.east-a.lon],[-dy,a.lat-bounds.south],[dy,bounds.north-a.lat]]) {
    if (Math.abs(p)<1e-14) { if (q<0) return null; continue; }
    const t=q/p;
    if (p<0) lo=Math.max(lo,t); else hi=Math.min(hi,t);
    if (lo>=hi) return null;
  }
  return [lo,hi];
}

export function pointInOutline(x, z, outline) {
  let inside=false;
  for (let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const a=outline[i],b=outline[j];
    if ((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside=!inside;
  }
  return inside;
}

export function interpolateGeo(a,b,t) {
  return {
    lat:a.lat+(b.lat-a.lat)*t, lon:a.lon+(b.lon-a.lon)*t,
    ele:Number.isFinite(a.ele)&&Number.isFinite(b.ele)?a.ele+(b.ele-a.ele)*t:NaN,
    time:Number.isFinite(a.time)&&Number.isFinite(b.time)?a.time+(b.time-a.time)*t:NaN
  };
}
