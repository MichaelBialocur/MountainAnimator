import {pointInOutline} from './route-motion.mjs?v=7';

export const SURFACE_DEFAULTS={surfaceEnabled:false,surfaceTrees:true,surfaceRocks:true,surfaceTreeDensity:55,surfaceRockDensity:50,surfaceTreeHeight:25,surfaceRockSize:3,surfaceTreeAltitude:2400,surfaceSensitivity:.5,surfaceSeed:1};
export const SURFACE_LIMITS={balanced:{tree:1000,rock:500},high:{tree:2500,rock:1200},ultra:{tree:4500,rock:2000}};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function cleanSurfaceSettings(config={}){
  const result={...SURFACE_DEFAULTS};
  for(const k of ['surfaceEnabled','surfaceTrees','surfaceRocks'])if(typeof config[k]==='boolean')result[k]=config[k];
  for(const [key,lo,hi] of [['surfaceTreeDensity',0,100],['surfaceRockDensity',0,100],['surfaceTreeHeight',8,60],['surfaceRockSize',.5,12],['surfaceTreeAltitude',500,4000],['surfaceSensitivity',.2,.85],['surfaceSeed',1,2147483647]]){
    const n=Number(config[key]);if(Number.isFinite(n))result[key]=clamp(n,lo,hi);
  }
  result.surfaceSeed=Math.floor(result.surfaceSeed);return result;
}
// RGB estimation, not a land-cover survey. Dark textured greens favour woodland
// over bright pasture; neutral/warm colours favour stone. Species are unknown.
export function classifySurface(r,g,b,alpha=255,contrast=0){
  const high=Math.max(r,g,b),low=Math.min(r,g,b),light=.2126*r+.7152*g+.0722*b,saturation=(high-low)/Math.max(1,high);
  if(alpha<245||light<24)return {forest:0,rock:0,excluded:true};
  const snow=low>175&&light>185&&saturation<.24;
  const water=b>r*1.12&&b>g*.96||g>r*1.35&&b>r*1.3;
  if(snow||water)return {forest:0,rock:0,excluded:true};
  const green=clamp((g-r+4)/11)*clamp((g-b+1)/18);
  const forest=green*clamp((155-light)/70)*(.72+.28*clamp(contrast/24));
  const neutral=clamp((.34-saturation)/.22),warm=r>=g*.98&&g>=b*1.02?clamp((.52-saturation)/.3):0;
  const vegetation=g-r>2&&g-b>8;
  const rock=vegetation?0:Math.max(neutral,warm)*clamp((light-38)/50);
  return {forest,rock,excluded:false};
}
export function analyzeSurfacePixels(image){
  const {width,height,data}=image||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||!data||data.length!==width*height*4)throw Error('Image satellite illisible');
  const forest=new Float32Array(width*height),rock=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,k=i*4,l=data[k]+data[k+1]+data[k+2];let contrast=0;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const n=(clamp(y+dy,0,height-1)*width+clamp(x+dx,0,width-1))*4;contrast+=Math.abs(l-data[n]-data[n+1]-data[n+2])/12;}
    const c=classifySurface(data[k],data[k+1],data[k+2],data[k+3],contrast);forest[i]=c.forest;rock[i]=c.rock;
  }
  return {width,height,forest,rock};
}
// Match a,c,b / b,c,d triangles exactly. Bilinear interpolation floats over
// saddle cells even when all four corner heights are correct.
export function sampleSurfaceTriangle(data,u,v,exaggeration=1){
  const {grid,size,heights}=data,gx=clamp(u)*grid,gz=clamp(v)*grid,x=Math.min(grid-1,Math.floor(gx)),z=Math.min(grid-1,Math.floor(gz)),tx=gx-x,tz=gz-z;
  const a=heights[z*(grid+1)+x],b=heights[z*(grid+1)+x+1],c=heights[(z+1)*(grid+1)+x],d=heights[(z+1)*(grid+1)+x+1],step=size*1000/grid;
  const first=tx+tz<=1,altitude=first?a+tx*(b-a)+tz*(c-a):d+(1-tx)*(c-d)+(1-tz)*(b-d);
  const dx=(first?b-a:d-c)/step,dz=(first?c-a:d-b)/step,length=Math.hypot(dx*exaggeration,1,dz*exaggeration);
  return {altitude,y:altitude/1000*exaggeration,slope:Math.atan(Math.hypot(dx,dz))*180/Math.PI,normal:[-dx*exaggeration/length,1/length,-dz*exaggeration/length]};
}
export function planSurfaceDecor(data,mask,outline,config,{seed=1,exaggeration=1,quality='high'}={}){
  const s=cleanSurfaceSettings(config),items=[];if(!s.surfaceEnabled||!mask)return items;
  const limits=SURFACE_LIMITS[quality]||SURFACE_LIMITS.high;
  let state=(seed^Math.imul(s.surfaceSeed,2654435761))>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const cell=.065,occupied=new Map(),key=(x,z)=>`${x},${z}`;
  const inside=(x,z)=>pointInOutline(x/(data.size/2),z/(data.size/2),outline);
  for(const type of ['tree','rock']){
    if(!s[type==='tree'?'surfaceTrees':'surfaceRocks'])continue;
    const field=type==='tree'?mask.forest:mask.rock,threshold=type==='tree'?1-s.surfaceSensitivity:.52,candidates=[];
    for(let i=0;i<field.length;i++)if(field[i]>=threshold)candidates.push(i);
    const desired=Math.round(limits[type]*s[type==='tree'?'surfaceTreeDensity':'surfaceRockDensity']/100*Math.min(1,data.size**2/144));
    if(!candidates.length||!desired)continue;
    let added=0;
    for(let attempt=0;attempt<desired*24&&added<desired;attempt++){
      const pixel=candidates[Math.floor(random()*candidates.length)],u=(pixel%mask.width+random())/mask.width,v=(Math.floor(pixel/mask.width)+random())/mask.height;
      const x=(u-.5)*data.size,z=(v-.5)*data.size,sample=sampleSurfaceTriangle(data,u,v,exaggeration);
      if(!Number.isFinite(sample.y)||sample.slope>(type==='tree'?39:52))continue;
      if(type==='tree'&&sample.altitude>s.surfaceTreeAltitude)continue;
      if(config.snowEnabled&&sample.altitude>config.snowAltitude-100)continue;
      const variation=.72+random()*.56;
      // Metres -> scene kilometres; model tree ~1.5 high, rock footprint <= .52.
      const size=type==='tree'?s.surfaceTreeHeight/1500*variation:s.surfaceRockSize/520*variation;
      const radius=size*(type==='tree'?.56:.26),ix=Math.floor(x/cell),iz=Math.floor(z/cell);
      let valid=inside(x,z);
      for(let a=0;valid&&a<8;a++){const angle=a*Math.PI/4;valid=inside(x+Math.cos(angle)*(radius+.002),z+Math.sin(angle)*(radius+.002));}
      for(let dx=-2;valid&&dx<=2;dx++)for(let dz=-2;valid&&dz<=2;dz++)for(const p of occupied.get(key(ix+dx,iz+dz))||[])if(Math.hypot(p.x-x,p.z-z)<p.radius+radius){valid=false;break;}
      if(!valid)continue;
      const item={type,x,z,y:sample.y-(type==='tree'?.00025:radius*.22),size,radius,altitude:sample.altitude,angle:random()*Math.PI*2,tint:random(),variant:Math.floor(random()*3)};
      if(type==='rock')item.normal=sample.normal;
      items.push(item);const k=key(ix,iz);if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(item);added++;
    }
  }
  return items;
}
