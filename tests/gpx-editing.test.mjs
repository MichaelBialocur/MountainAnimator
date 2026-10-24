import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawingDraft,prepareEditableRoute,editableRouteAnchors,mergeEditedRoute} from '../gpx-drawing.mjs';
const data={grid:1,size:1,heights:new Float32Array([100,300,500,100]),bounds:{west:7,east:7.01,north:46.01,south:46}};
const point=(u,v,segment=0)=>({lat:46.01-v*.01,lon:7+u*.01,ele:9999,time:12345,segment});

test('move, insert and delete are immutable, segment-safe and undoable as whole drags',()=>{
 const source=[point(.1,.1),point(.2,.2),point(.3,.3,1)],d=new DrawingDraft(source),before=d.points;
 d.beginStroke();d.move(1,point(.4,.3,4));d.move(1,point(.5,.3,5));d.endStroke();assert.equal(d.points[1].segment,0);assert.equal(before[1].lon,source[1].lon);d.undo();assert.equal(d.points,before);d.redo();assert.equal(d.points[1].lon,point(.5,.3).lon);
 d.insert(2,point(.6,.3,10));assert.equal(d.points[2].segment,0);d.remove(2);assert.equal(d.points[2].segment,1);d.undo();assert.equal(d.points.length,4);
 const breaks=new DrawingDraft([point(.1,.1,0),point(.2,.2,1),point(.3,.3,0)]);breaks.remove(1);assert.notEqual(breaks.points[0].segment,breaks.points[1].segment);breaks.undo();assert.equal(breaks.points.length,3);
});
test('preparing an imported GPX clips edit spans without false bridges and keeps turns with sampled elevations',()=>{
 const points=[point(-.1,.1),point(.1,.1),point(.2,.1),point(.3,.1),point(.3,.3),point(.3,.5),point(1.1,.5),point(.5,.5),point(.6,.6,1),point(.7,.7,1)];
 const {anchors,ranges}=prepareEditableRoute(points,data);assert.deepEqual(ranges,[{start:1,end:5,segment:0,originalSegment:0},{start:7,end:7,segment:1,originalSegment:0},{start:8,end:9,segment:2,originalSegment:1}]);
 assert.ok(anchors.some(p=>Math.abs(p.lon-point(.3,.1).lon)<1e-10&&Math.abs(p.lat-point(.3,.1).lat)<1e-10));assert.ok(Math.abs(anchors[0].ele-160)<1e-7);assert.ok(anchors.every(p=>Number.isNaN(p.time)&&p.ele!==9999));assert.deepEqual(editableRouteAnchors(points,data),anchors);
 assert.throws(()=>prepareEditableRoute(points,data,{toleranceMeters:0,maxAnchors:2}),/points|sections/);
 const masked=prepareEditableRoute(points,data,{isInside:p=>p.lon<7.004});assert.equal(masked.ranges.length,1);
});
test('merging preserves outside source, recording breaks and appends new strokes as fresh segments',()=>{
 const original=[point(-.1,.1),point(.1,.1),point(.3,.3),point(1.1,.5),point(.5,.5,1),point(.6,.6,1),point(1.1,.8,1)],{anchors,ranges}=prepareEditableRoute(original,data);
 const edited=[...anchors.map(p=>({...p,ele:p.ele+1})),{...point(.4,.6),segment:2},{...point(.5,.7),segment:2}],merged=mergeEditedRoute(original,edited,ranges);
 assert.equal(merged[0],original[0]);assert.equal(merged[3],original[3]);assert.equal(merged.at(-1),original.at(-1));assert.equal(merged[1].segment,0);assert.equal(merged[4].segment,1);assert.equal(merged.at(-2).segment,2);assert.equal(merged.at(-3).segment,2);
 assert.throws(()=>mergeEditedRoute(original,edited,[{...ranges[0],end:6}]),/source|sections/);
});

test('a sparse outside-to-outside edge gets clipped editing anchors without losing either source endpoint',()=>{
 const original=[point(-1,.5,4),point(2,.5,4)];
 const inside=p=>Math.abs((p.lon-7)/.01-.5)<.45;
 const {anchors,ranges}=prepareEditableRoute(original,data,{isInside:inside});
 assert.equal(anchors.length,2);assert.deepEqual(ranges,[{start:1,end:0,segment:0,originalSegment:4}]);assert.ok(anchors.every(inside));
 const merged=mergeEditedRoute(original,anchors,ranges);assert.equal(merged[0],original[0]);assert.equal(merged.at(-1),original[1]);assert.equal(merged.length,4);assert.ok(merged.every(p=>p.segment===4));
});
