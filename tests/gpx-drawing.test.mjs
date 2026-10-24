import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {DrawingDraft,densifyDrawnRoute,gpxDocument} from '../gpx-drawing.mjs';
import {distanceKm} from '../route-motion.mjs';
import {sampleSurfaceTriangle} from '../surface-decor.mjs';

const data={grid:1,size:1,heights:new Float32Array([100,300,500,100]),bounds:{west:7,east:7.01,north:46.01,south:46}};
const point=(u,v,segment=0)=>({lat:46.01-v*.01,lon:7+u*.01,ele:9999,segment});
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('drawing clicks and complete drag strokes undo independently, with redo and duplicate filtering',()=>{
  const draft=new DrawingDraft();assert.equal(draft.canUndo,false);
  assert.equal(draft.append(point(.1,.1)),true);assert.equal(draft.canUndo,true);
  draft.beginStroke();draft.append(point(.2,.2));draft.append(point(.3,.3));draft.append(point(.4,.4));draft.endStroke();
  assert.equal(draft.points.length,4);assert.equal(draft.append(point(.4,.4)),false);
  assert.equal(draft.undo(),true);assert.equal(draft.points.length,1);assert.equal(draft.canRedo,true);
  assert.equal(draft.redo(),true);assert.equal(draft.points.length,4);
  assert.equal(draft.clear(),true);assert.equal(draft.points.length,0);draft.undo();assert.equal(draft.points.length,4);
  draft.undo();draft.append(point(.5,.5));assert.equal(draft.canRedo,false);
  draft.undo();draft.undo();assert.equal(draft.points.length,0);assert.equal(draft.undo(),false);
});

test('stroke history rejects tiny repeated movements without disturbing a pending undo and protects snapshots',()=>{
  const draft=new DrawingDraft([point(.1,.1)]),p=draft.points[0];draft.beginStroke();
  assert.equal(draft.append({...p,lon:p.lon+.000001},10),false);assert.equal(draft.endStroke(),false);assert.equal(draft.canUndo,false);
  assert.throws(()=>{draft.points.push(point(.2,.2));},TypeError);
  assert.throws(()=>{draft.points[0].lat=0;},TypeError);
  draft.beginStroke();draft.append(point(.2,.2));draft.undo();assert.equal(draft.points.length,1);
  draft.append(point(.1,.1,1));assert.equal(draft.points.length,2,'coincident points of disconnected segments are retained');
});

test('densification follows distance and rendered saddle triangles rather than anchor elevations or bilinear heights',()=>{
  const anchors=[point(.2,.3),point(.8,.7)],route=densifyDrawnRoute(anchors,data);
  assert.ok(route.length>20);near(route[0].ele,260);near(route.at(-1).ele,240);
  near(route[0].lon,anchors[0].lon);near(route.at(-1).lat,anchors[1].lat);
  for(let i=0;i<route.length;i++){
    const p=route[i],u=(p.lon-data.bounds.west)/.01,v=(data.bounds.north-p.lat)/.01;
    near(p.ele,sampleSurfaceTriangle(data,u,v).altitude,1e-6);assert.equal(Number.isNaN(p.time),true);
    if(i)assert.ok(distanceKm(route[i-1],p)*1000<=25.0001);
  }
  const reversed=densifyDrawnRoute([...anchors].reverse(),data);assert.equal(reversed.length,route.length);
  for(let i=0;i<route.length;i++)near(route[i].ele,reversed.at(-1-i).ele,1e-6);
  assert.equal(anchors[0].ele,9999,'input anchors remain unchanged');
});

test('fine grids tighten sampling, segment breaks remain disconnected and budget overflow fails without modifying inputs',()=>{
  const fine={...data,grid:100,heights:new Float32Array(101**2).fill(1200)},anchors=[point(.1,.1),point(.2,.2),point(.8,.8,1),point(.9,.9,1)];
  const route=densifyDrawnRoute(anchors,fine),breakIndex=route.findIndex(p=>p.segment===1);assert.ok(breakIndex>1);
  near(route[breakIndex-1].lon,anchors[1].lon);near(route[breakIndex].lon,anchors[2].lon);
  for(let i=1;i<route.length;i++)if(route[i].segment===route[i-1].segment)assert.ok(distanceKm(route[i-1],route[i])*1000<=5.0001);
  assert.throws(()=>densifyDrawnRoute(anchors,fine,{maxPoints:10}),/dépasse/);assert.equal(anchors.length,4);
  assert.throws(()=>densifyDrawnRoute([{lat:0,lon:0}],data),/hors/);
  assert.throws(()=>densifyDrawnRoute(anchors,data,{spacingMeters:0}),/invalides/);
});

test('GPX 1.1 roundtrip retains coordinates, segment breaks, Unicode and escaped titles without invented times',()=>{
  const points=densifyDrawnRoute([point(.1,.1),point(.2,.2),point(.8,.8,2),point(.9,.9,2)],data);
  const title='Crête & sommet <A> "été"',xml=gpxDocument(points,title),dom=new JSDOM(''),doc=new dom.window.DOMParser().parseFromString(xml,'application/xml');
  assert.equal(doc.querySelector('parsererror'),null);assert.equal(doc.documentElement.namespaceURI,'http://www.topografix.com/GPX/1/1');assert.equal(doc.documentElement.getAttribute('version'),'1.1');
  assert.equal(doc.querySelector('metadata > name').textContent,title);assert.equal(doc.querySelectorAll('trkseg').length,2);assert.equal(doc.querySelectorAll('trkpt').length,points.length);assert.equal(doc.querySelectorAll('time').length,0);
  const parsed=[...doc.querySelectorAll('trkpt')];parsed.forEach((p,i)=>{near(+p.getAttribute('lat'),points[i].lat,1e-8);near(+p.getAttribute('lon'),points[i].lon,1e-8);near(+p.querySelector('ele').textContent,points[i].ele,.006);});
  assert.ok(!xml.includes('NaN'));assert.throws(()=>gpxDocument([{lat:Infinity,lon:0}]),/invalide/);dom.window.close();
});
