import {distanceKm,clipToBounds} from './route-motion.mjs?v=7';
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
  _replace(points){
    const implicit=this._stroke===null;if(implicit)this.beginStroke();
    this._points=Object.freeze(points);this._redo=[];
    if(implicit)this.endStroke();return true;
  }
  move(index,point){
    if(!Number.isInteger(index)||index<0||index>=this._points.length)return false;
    const before=this._points[index],p=routePoint({...point,segment:before.segment});
    if(p.lat===before.lat&&p.lon===before.lon&&Object.is(p.ele,before.ele))return false;
    const points=[...this._points];points[index]=p;return this._replace(points);
  }
  remove(index){
    if(!Number.isInteger(index)||index<0||index>=this._points.length)return false;
    const points=[...this._points],removed=points.splice(index,1)[0],before=points[index-1],after=points[index];
    // Labels can repeat after a recording break; deleting its singleton must
    // not accidentally join the two previously disconnected same-label runs.
    if(before&&after&&before.segment===after.segment&&removed.segment!==before.segment){
      const old=after.segment,fresh=Math.max(...this._points.map(p=>p.segment))+1;
      for(let i=index;i<points.length&&points[i].segment===old;i++)points[i]=routePoint({...points[i],segment:fresh});
    }
    return this._replace(points);
  }
  insert(index,point){
    if(!Number.isInteger(index)||index<0||index>this._points.length)return false;
    if(this._points.length>=MAX_ANCHORS)throw Error('Le dessin atteint 10 000 points. Supprime des points avant d’en insérer.');
    const segment=(index?this._points[index-1]:this._points[0])?.segment??0,p=routePoint({...point,segment});
    const points=[...this._points];points.splice(index,0,p);return this._replace(points);
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

// Keep the source index ranges as well as editing anchors: committing one
// mountain must not throw away the rest of an imported multi-mountain GPX.
export function prepareEditableRoute(points,data,{toleranceMeters=8,maxAnchors=2500,isInside=()=>true}={}){
  if(!Array.isArray(points)||points.length>150000)throw Error('Ce GPX dépasse la limite de 150 000 points modifiables.');
  if(!Number.isFinite(toleranceMeters)||toleranceMeters<0||!Number.isInteger(maxAnchors)||maxAnchors<2||maxAnchors>MAX_ANCHORS||typeof isInside!=='function')throw Error('Les limites de modification du tracé sont invalides.');
  densifyDrawnRoute([],data); // Validate the same DEM contract as drawn routes.
  const {bounds}=data,runs=[],ranges=[];let run=null,previousSource=null;
  for(let i=0;i<points.length;i++){
    const raw=points[i],valid=raw&&Number.isFinite(raw.lat)&&Number.isFinite(raw.lon)&&Math.abs(raw.lat)<=90&&Math.abs(raw.lon)<=180;
    const p=valid?routePoint(raw):null;
    const inside=p&&p.lon>=bounds.west&&p.lon<=bounds.east&&p.lat>=bounds.south&&p.lat<=bounds.north&&isInside(p);
    if(!inside){run=null;previousSource=p?.segment??null;continue;}
    if(!run||p.segment!==previousSource){run=[];runs.push(run);ranges.push({start:i,end:i,segment:runs.length-1,originalSegment:p.segment});}
    run.push(p);ranges.at(-1).end=i;previousSource=p.segment;
  }
  // A sparse edge can cross the complete mountain without a single original
  // GPX point inside it. Insert clipped editing anchors before its second
  // endpoint, using an empty source span so neither outside endpoint is lost.
  const inFootprint=p=>p.lon>=bounds.west&&p.lon<=bounds.east&&p.lat>=bounds.south&&p.lat<=bounds.north&&isInside(p);
  let crossingWork=0;
  for(let i=1;i<points.length;i++){
    const rawA=points[i-1],rawB=points[i];
    if(!rawA||!rawB||![rawA.lat,rawA.lon,rawB.lat,rawB.lon].every(Number.isFinite)||Math.abs(rawA.lat)>90||Math.abs(rawB.lat)>90||Math.abs(rawA.lon)>180||Math.abs(rawB.lon)>180)continue;
    const a=routePoint(rawA),b=routePoint(rawB);if(a.segment!==b.segment||inFootprint(a)||inFootprint(b))continue;
    const clipped=clipToBounds(a,b,bounds);if(!clipped)continue;
    const geo=t=>({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t,ele:NaN,time:NaN,segment:a.segment});
    const [lo,hi]=clipped,steps=Math.min(2048,Math.max(8,Math.ceil(distanceKm(a,b)*(hi-lo)*1000/Math.min(50,data.size*1000/data.grid/2))));
    const boundary=(left,right,rightInside)=>{for(let k=0;k<20;k++){const middle=(left+right)/2;if(inFootprint(geo(middle))===rightInside)right=middle;else left=middle;}return rightInside?right:left;};
    const addSpan=(start,finish)=>{if(finish-start<1e-12)return;if(ranges.length>=maxAnchors)throw Error('Ce tracé contient trop de sections. Simplifie le GPX avant de le modifier.');runs.push([geo(start),geo(finish)]);ranges.push({start:i,end:i-1,segment:runs.length-1,originalSegment:a.segment});};
    let previousT=lo,previousInside=inFootprint(geo(lo)),start=previousInside?lo:null;
    for(let j=1;j<=steps;j++){
      if(++crossingWork>500000)throw Error('Ce tracé contient trop de traversées du relief. Simplifie le GPX avant de le modifier.');
      const t=lo+(hi-lo)*j/steps,inside=inFootprint(geo(t));
      if(!previousInside&&inside)start=boundary(previousT,t,true);
      else if(previousInside&&!inside){addSpan(start,boundary(previousT,t,false));start=null;}
      previousT=t;previousInside=inside;
    }
    if(previousInside&&start!==null)addSpan(start,hi);
  }
  // Source order matters when a GPX alternates dense inside runs and sparse
  // crossings; insertion spans sort before the unchanged endpoint they precede.
  const ordered=ranges.map((range,i)=>({range,run:runs[i]})).sort((a,b)=>a.range.start-b.range.start||a.range.end-b.range.end);
  if(ordered.length>maxAnchors)throw Error('Ce tracé contient trop de sections. Simplifie le GPX avant de le modifier.');
  ranges.length=0;runs.length=0;ordered.forEach(({range,run},segment)=>{ranges.push({...range,segment});runs.push(run);});
  const latitude=(bounds.north+bounds.south)/2*Math.PI/180,mx=111320*Math.cos(latitude),mz=110574;
  let retained=0,work=0;
  const simplified=runs.map(run=>{
    if(run.length<3){retained+=run.length;if(retained>maxAnchors)throw Error('Ce tracé contient trop de sections. Simplifie le GPX avant de le modifier.');return run;}
    const xy=run.map(p=>({x:(p.lon-bounds.west)*mx,y:(p.lat-bounds.south)*mz})),keep=new Uint8Array(run.length);keep[0]=keep[run.length-1]=1;retained+=2;
    const stack=[[0,run.length-1]],limit=(toleranceMeters*.99)**2;
    while(stack.length){
      const [start,end]=stack.pop(),a=xy[start],b=xy[end],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let max=limit,pivot=-1;
      for(let i=start+1;i<end;i++){
        if(++work>15000000)throw Error('Ce tracé est trop complexe. Simplifie le GPX avant de le modifier.');
        const p=xy[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0,error=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
        if(error>max){max=error;pivot=i;}
      }
      if(pivot>=0){keep[pivot]=1;retained++;if(retained>maxAnchors)throw Error(`Ce tracé nécessite plus de ${maxAnchors.toLocaleString('fr-CH')} points de contrôle. Simplifie le GPX avant de le modifier.`);stack.push([start,pivot],[pivot,end]);}
    }
    if(retained>maxAnchors)throw Error('Ce tracé contient trop de points de contrôle.');
    return run.filter((_,i)=>keep[i]);
  });
  const anchors=simplified.flatMap((run,segment)=>run.map(p=>{
    const ele=sampleSurfaceTriangle(data,(p.lon-bounds.west)/(bounds.east-bounds.west),(bounds.north-p.lat)/(bounds.north-bounds.south)).altitude;
    if(!Number.isFinite(ele))throw Error('Une altitude du relief est invalide. Recharge le sommet.');
    return {lat:p.lat,lon:p.lon,ele,time:NaN,segment};
  }));
  return {anchors,ranges};
}
export function editableRouteAnchors(points,data,options){return prepareEditableRoute(points,data,options).anchors;}

export function mergeEditedRoute(original,edited,ranges){
  if(!Array.isArray(original)||!Array.isArray(edited)||!Array.isArray(ranges)||original.length>150000||edited.length>30000||ranges.length>10000)throw Error('Le tracé à fusionner est invalide.');
  const originalSafe=original.map(routePoint),changed=edited.map(routePoint);let end=-1;
  for(let i=0;i<ranges.length;i++){
    const r=ranges[i];if(!r||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<=end||r.start>original.length||r.end<r.start-1||r.end>=original.length||r.segment!==i||!Number.isInteger(r.originalSegment)||r.originalSegment<0)throw Error('Les sections du tracé à modifier sont invalides.');
    if(r.end<r.start&&(!originalSafe[r.start-1]||!originalSafe[r.start]||originalSafe[r.start-1].segment!==r.originalSegment||originalSafe[r.start].segment!==r.originalSegment))throw Error('Le GPX source ne correspond plus au brouillon.');
    for(let j=r.start;j<=r.end;j++)if(originalSafe[j].segment!==r.originalSegment)throw Error('Le GPX source ne correspond plus au brouillon.');
    end=r.end;
  }
  if(!ranges.length){if(changed.length)throw Error('Aucune section du GPX ne peut être remplacée.');return [...original];}
  const replacements=new Map(),extra=new Map();
  for(const p of changed){const target=p.segment<ranges.length?replacements:extra;if(!target.has(p.segment))target.set(p.segment,[]);target.get(p.segment).push(p);}
  let maxSegment=originalSafe.reduce((n,p)=>Math.max(n,p.segment),0),cursor=0;const result=[];
  for(const r of ranges){
    for(let i=cursor;i<r.start;i++)result.push(original[i]);
    for(const p of replacements.get(r.segment)||[])result.push({...p,segment:r.originalSegment});cursor=r.end+1;
  }
  // New strokes remain separate and are placed after the last edited span,
  // before the untouched suffix. A source recording break is never bridged.
  for(const run of extra.values()){
    maxSegment++;if(!Number.isSafeInteger(maxSegment))throw Error('Les identifiants des sections GPX sont invalides.');
    for(const p of run)result.push({...p,segment:maxSegment});
  }
  for(let i=cursor;i<original.length;i++)result.push(original[i]);
  if(result.length>150000)throw Error('Le GPX modifié dépasse 150 000 points. Réduis la longueur du dessin.');
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
