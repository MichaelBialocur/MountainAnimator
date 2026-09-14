import test from 'node:test';
import assert from 'node:assert/strict';
import {measureRoute,sampleRoute,smoothRoutePoint,smootherstep,dampingAlpha,clipToBounds,distanceKm,pointInOutline} from '../route-motion.mjs';

const p=(x,z=0)=>({x,y:0,z});
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('a long edge takes time proportional to its distance, not one frame per GPX point',()=>{
  const route=measureRoute([{a:p(0),b:p(1),part:0},{a:p(1),b:p(10),part:0}]);
  near(route.total,10);
  near(sampleRoute(route,5).point.x,5);
  near(sampleRoute(route,5).t,4/9);
  near(sampleRoute(route,1).point.x,1);
});

test('inserting redundant points does not change position or speed',()=>{
  const sparse=measureRoute([{a:p(0),b:p(10)}]);
  const dense=measureRoute(Array.from({length:100},(_,i)=>({a:p(i/10),b:p((i+1)/10)})));
  for(let d=0;d<=10;d+=.137)near(sampleRoute(sparse,d).point.x,sampleRoute(dense,d).point.x);
});

test('duplicate stationary points and empty routes are safe',()=>{
  assert.equal(sampleRoute(measureRoute([]),0),null);
  const route=measureRoute([{a:p(0),b:p(0)},{a:p(0),b:p(3)}]);
  assert.equal(route.segments.length,1);near(sampleRoute(route,10).point.x,3);near(sampleRoute(route,-1).point.x,0);
});

test('distance smoothing attenuates a zigzag without bridging disconnected segments',()=>{
  const edges=Array.from({length:100},(_,i)=>({a:p(i*.02,i%2?.08:-.08),b:p((i+1)*.02,i%2?-.08:.08),length:.02,part:0}));
  const route=measureRoute(edges);
  assert.ok(Math.abs(smoothRoutePoint(route,1,.15).z)<.03);
  const separated=measureRoute([{a:p(0),b:p(1),part:0},{a:p(100),b:p(101),part:1}]);
  assert.ok(smoothRoutePoint(separated,.99,.4).x<=1);
  assert.ok(smoothRoutePoint(separated,1.01,.4).x>=100);
});

test('transition easing has exact endpoints and gentle starting/stopping velocities',()=>{
  near(smootherstep(0),0);near(smootherstep(1),1);near(smootherstep(.5),.5);
  assert.ok(smootherstep(.01)<.00002);assert.ok(1-smootherstep(.99)<.00002);
});

test('camera damping is frame-rate independent',()=>{
  const simulate=fps=>{let value=0;for(let i=0;i<fps*2;i++)value+=(1-value)*dampingAlpha(1/fps);return value;};
  near(simulate(30),simulate(144));
});

test('long edges crossing the visible cutout are clipped rather than dropped',()=>{
  const bounds={west:-1,east:1,south:-1,north:1};
  const interval=clipToBounds({lon:-2,lat:0},{lon:2,lat:0},bounds);
  near(interval[0],.25);near(interval[1],.75);
  assert.equal(clipToBounds({lon:2,lat:0},{lon:2,lat:1},bounds),null);
  assert.equal(pointInOutline(.9,.9,[{x:-1,z:0},{x:0,z:-1},{x:1,z:0},{x:0,z:1}]),false);
});

test('geographic distance is finite near zero and antipodes',()=>{
  near(distanceKm({lat:46,lon:7},{lat:46,lon:7}),0);
  near(distanceKm({lat:0,lon:0},{lat:0,lon:1}),111.19492664455873,1e-6);
  assert.ok(Number.isFinite(distanceKm({lat:0,lon:0},{lat:0,lon:180})));
});

test('live metrics interpolate altitude and gain by distance, without inventing missing elevation',async()=>{
 const {routeMetrics}=await import('../route-motion.mjs');
 const route=measureRoute([{a:{x:0,y:2.035,z:0},b:{x:1,y:2.135,z:0},length:1,part:0,fromGeo:{ele:2000},toGeo:{ele:2100}},{a:{x:1,y:2.135,z:0},b:{x:4,y:2.435,z:0},length:3,part:0,fromGeo:{ele:2100},toGeo:{ele:2400}}]);
 const stats=routeMetrics(route,2.5);assert.equal(stats.distance,2.5);assert.equal(stats.altitude,2250);assert.equal(stats.gain,250);
 const missing=measureRoute([{a:{x:0,y:2.035,z:0},b:{x:1,y:2.135,z:0},length:1,part:0}]);assert.equal(routeMetrics(missing,.5).gain,null);assert.ok(Math.abs(routeMetrics(missing,.5).altitude-2050)<1e-6);
});
