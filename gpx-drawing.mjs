import {distanceKm} from './route-motion.mjs?v=7';
import {sampleSurfaceTriangle} from './surface-decor.mjs?v=15';

const MAX_ANCHORS=10000;
function routePoint(point){
  if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180)throw Error('Le tracé contient un point géographique invalide.');
  return Object.freeze({lat:point.lat,lon:point.lon,ele:Number.isFinite(point.ele)?point.ele:NaN,time:Number.isFinite(point.time)?point.time:NaN,segment:Number.isInteger(point.segment)&&point.segment>=0?point.segment:0});
}

// Immutable snapshots keep history grouped by a complete drag, without copying
// every point object or undoing a long stroke one sample at a time.
export class DrawingDraft {
  constructor(points=[]){
    if(!Array.isArray(points)||points.length>MAX_ANCHORS)throw Error('Le dessin est limité à 10 000 points de contrôle.');
    this._points=Object.freeze(points.map(routePoint));this._undo=[];this._redo=[];this._stroke=null;
  }
  get points(){return this._points;}
  get canUndo(){return this._undo.length>0||this._stroke!==null&&this._points!==this._stroke;}
  get canRedo(){return this._redo.length>0&&!(this._stroke!==null&&this._points!==this._stroke);}
  beginStroke(){if(this._stroke!==null)return false;this._stroke=this._points;return true;}
  append(point,minDistanceMeters=0){
    const p=routePoint(point),last=this._points.at(-1),minimum=Number.isFinite(minDistanceMeters)?Math.max(0,minDistanceMeters):0;
    if(last&&last.segment===p.segment&&distanceKm(last,p)*1000<Math.max(1e-6,minimum))return false;
    if(this._points.length>=MAX_ANCHORS)throw Error('Le dessin atteint 10 000 points. Termine ce tracé ou annule le dernier trait.');
    const implicit=this._stroke===null;if(implicit)this.beginStroke();
    this._points=Object.freeze([...this._points,p]);this._redo=[];
    if(implicit)this.endStroke();return true;
  }
  endStroke(){
    if(this._stroke===null)return false;
    const before=this._stroke;this._stroke=null;
    if(before===this._points)return false;
    this._undo.push({before,after:this._points});if(this._undo.length>100)this._undo.shift();this._redo=[];return true;
  }
  undo(){this.endStroke();const entry=this._undo.pop();if(!entry)return false;this._points=entry.before;this._redo.push(entry);return true;}
  redo(){this.endStroke();const entry=this._redo.pop();if(!entry)return false;this._points=entry.after;this._undo.push(entry);return true;}
  clear(){this.endStroke();if(!this._points.length)return false;this.beginStroke();this._points=Object.freeze([]);return this.endStroke();}
}

// Insert distance-spaced samples and recover physical elevation from the same
// triangles rendered on screen. No invented speed or recording times are added.
export function densifyDrawnRoute(anchors,data,{spacingMeters=25,maxPoints=30000}={}){
  if(!Array.isArray(anchors)||anchors.length>MAX_ANCHORS)throw Error('Le dessin est limité à 10 000 points de contrôle.');
  const {bounds,grid,size,heights}=data||{};
  if(!bounds||!Number.isInteger(grid)||grid<1||!Number.isFinite(size)||size<=0||!heights||heights.length!==(grid+1)**2||![bounds.west,bounds.east,bounds.north,bounds.south].every(Number.isFinite)||bounds.west>=bounds.east||bounds.south>=bounds.north)throw Error('Le relief du tracé est indisponible.');
  if(!Number.isFinite(spacingMeters)||spacingMeters<=0||!Number.isInteger(maxPoints)||maxPoints<1)throw Error('Les limites de précision du tracé sont invalides.');
  const points=anchors.map(routePoint),spacing=Math.min(25,spacingMeters,size*1000/grid/2),steps=[];
  for(const p of points)if(p.lon<bounds.west-1e-10||p.lon>bounds.east+1e-10||p.lat<bounds.south-1e-10||p.lat>bounds.north+1e-10)throw Error('Un point du dessin se trouve hors de cette découpe.');
  let count=points.length?1:0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],n=a.segment===b.segment?Math.ceil(distanceKm(a,b)*1000/spacing):1;
    steps.push(n);count+=n;
    if(count>maxPoints)throw Error(`Ce tracé dépasse ${maxPoints.toLocaleString('fr-CH')} points. Réduis sa longueur ou simplifie le dessin.`);
  }
  if(count>maxPoints)throw Error('Ce tracé dépasse la limite de points.');
  const result=[];
  function sample(lat,lon,segment){
    const u=(lon-bounds.west)/(bounds.east-bounds.west),v=(bounds.north-lat)/(bounds.north-bounds.south),ele=sampleSurfaceTriangle(data,u,v).altitude;
    if(!Number.isFinite(ele))throw Error('Une altitude du relief est invalide. Recharge la montagne avant de créer le GPX.');
    result.push({lat,lon,ele,time:NaN,segment});
  }
  if(points.length)sample(points[0].lat,points[0].lon,points[0].segment);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(a.segment!==b.segment){sample(b.lat,b.lon,b.segment);continue;}
    for(let j=1;j<=steps[i-1];j++){const t=j/steps[i-1];sample(a.lat+(b.lat-a.lat)*t,a.lon+(b.lon-a.lon)*t,b.segment);}
  }
  return result;
}

function xmlText(value){return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
export function gpxDocument(points,name='Tracé dessiné'){
  if(!Array.isArray(points)||points.length>150000)throw Error('Le nombre de points du GPX est invalide.');
  const safe=points.map(routePoint),title=xmlText(name),lines=['<?xml version="1.0" encoding="UTF-8"?>','<gpx version="1.1" creator="Mountain Animator" xmlns="http://www.topografix.com/GPX/1/1">',`  <metadata><name>${title}</name></metadata>`,`  <trk><name>${title}</name>`];
  let segment=null;
  for(const p of safe){
    if(p.segment!==segment){if(segment!==null)lines.push('    </trkseg>');lines.push('    <trkseg>');segment=p.segment;}
    const elevation=Number.isFinite(p.ele)?`<ele>${p.ele.toFixed(2)}</ele>`:'',date=new Date(p.time),time=Number.isFinite(p.time)&&Number.isFinite(date.getTime())?`<time>${date.toISOString()}</time>`:'';
    lines.push(`      <trkpt lat="${p.lat.toFixed(8)}" lon="${p.lon.toFixed(8)}">${elevation}${time}</trkpt>`);
  }
  if(segment!==null)lines.push('    </trkseg>');lines.push('  </trk>','</gpx>');return lines.join('\n');
}
