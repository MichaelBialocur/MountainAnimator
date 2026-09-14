import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as motion from '../route-motion.mjs';
import * as atmosphere from '../atmosphere.mjs';
import * as video from '../video-export.mjs';
import * as terrain from '../terrain-data.mjs';
import * as cinemaMath from '../camera-sequence.mjs';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as art from '../studio-art.mjs';

export function fakeContext(){
  return new Proxy({
    text:[],fillText(text){this.text.push(String(text));},measureText:text=>({width:String(text).length*17}),
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})
  },{get(target,key){return key in target?target[key]:(()=>{});}});
}

export function makeDom(){
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://example.test/'});
  const {window}=dom;
  window.HTMLCanvasElement.prototype.getContext=function(){return this.testContext??=fakeContext();};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(value){this.open=false;this.returnValue=value;this.dispatchEvent(new window.Event('close'));};
  return dom;
}

export function appHarness(saved,overrides={}){
  const dom=makeDom(),{window}=dom;
  const timers=[];
  Object.defineProperties(window.document.querySelector('#stage'),{clientWidth:{value:1200},clientHeight:{value:750}});
  if(saved)window.localStorage.setItem('mountainAnimatorProjectV3',JSON.stringify(saved));
  class Renderer {
    constructor(){this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>8};}
    setPixelRatio(){}getPixelRatio(){return 1;}getContext(){return {isContextLost:()=>false};}setSize(){}render(){}
  }
  const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'')
    .replace('\nrebuildScene();\n','\n// Network loading is replaced by explicit synthetic terrain in tests.\n');
  const sandbox={
    ...motion,...art,...terrain,...cinemaMath,LineSegments2,LineSegmentsGeometry,LineMaterial,...atmosphere,...video,paintGround:canvas=>canvas,THREE:{...THREE,WebGLRenderer:Renderer},OrbitControls,
    document:window.document,window,navigator:window.navigator,localStorage:window.localStorage,DOMParser:window.DOMParser,
    matchMedia:()=>({matches:false}),devicePixelRatio:1,requestAnimationFrame:()=>0,
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},Image:window.Image,URL,URLSearchParams,console,performance,...overrides
  };
  const names=['scene','camera','controls','floor','gpxPlayer','globalSettings','createBlock','settingsFor','clearBlocks','positionBlocks','buildGpxRoutes','parseGpx','trackStats','setGpxProgress','toggleGpxAnimation','stopGpxAnimation','advancePlayback','followPose','routeOverviewPose','updateFollowCamera','updateCameraTransition','safeCameraHeight','refreshStatsBillboards','makeStatsCanvas','handleGpxFile','restoreProject','saveProject','formatDuration','bindControls','createPeakLabels','updatePeakLabels','clearCloudTerrain','updateSnow','runVideoExport','saveExportView','restoreExportView','sun','ambient','rim','cinema','startCinema','stopCinema','advanceCinema','applyCinemaTime','mountainCameraPose','globalCameraPose','syncCinemaEditor','updateLiveStats'];
  const api=vm.runInNewContext(source+`\n;({${names.join(',')},get blocks(){return blocks;},set blocks(value){blocks=value;},get gpxTrack(){return gpxTrack;},set gpxTrack(value){gpxTrack=value;}})`,sandbox);
  api.window=window;api.dom=dom;api.timers=timers;
  api.syntheticBlock=(id='chavalard',lon=7.11312)=>{
    const peak={id,name:id,elevation:2899,lat:46.17869,lon};
    const data={grid:8,size:12,bounds:{west:lon-.08,east:lon+.08,north:46.24,south:46.12},heights:new Float32Array(81).fill(2400),textureCanvas:window.document.createElement('canvas')};
    const block=api.createBlock(data,peak,api.settingsFor(id));api.blocks.push(block);api.positionBlocks();return block;
  };
  return api;
}
