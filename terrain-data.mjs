// Terrarium pixels are numeric data, never rescale or blend their RGB channels.
export function decodeTerrarium(rgba){
  const heights=new Float32Array(rgba.length/4);
  for(let i=0;i<heights.length;i++){
    const j=i*4,h=rgba[j]*256+rgba[j+1]+rgba[j+2]/256-32768;
    heights[i]=rgba[j+3]===255&&h>=-500&&h<=9000?h:NaN;
  }
  return heights;
}
export function sampleNumericTiles(tiles,size,x,y){
  const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  let sum=0,weight=0;
  for(const [px,py,w] of [[x0,y0,(1-tx)*(1-ty)],[x0+1,y0,tx*(1-ty)],[x0,y0+1,(1-tx)*ty],[x0+1,y0+1,tx*ty]]){
    const tile=tiles.get(`${Math.floor(px/size)},${Math.floor(py/size)}`);
    const value=tile?.[((py%size)+size)%size*size+((px%size)+size)%size];
    if(Number.isFinite(value)&&w>0){sum+=value*w;weight+=w;}
  }
  return weight>0?sum/weight:NaN;
}
const median=values=>{values.sort((a,b)=>a-b);return values.length%2?values[values.length>>1]:(values[values.length/2-1]+values[values.length/2])/2;};
export function cleanTerrain(raw,grid,spacingMeters,strength=.35){
  const n=grid+1;let heights=Float32Array.from(raw),repaired=0;
  const neighbours=(source,x,y)=>{const values=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!(dx||dy))continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=n||yy>=n)continue;const v=source[yy*n+xx];if(Number.isFinite(v))values.push(v);}return values;};
  for(let pass=0;pass<3;pass++){
    const out=heights.slice();
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,v=heights[i],values=neighbours(heights,x,y);if(values.length<3)continue;
      const mid=median(values),mad=median(values.map(a=>Math.abs(a-mid)));
      const isolated= v>=Math.max(...values)||v<=Math.min(...values);
      if(!Number.isFinite(v)||(isolated&&Math.abs(v-mid)>Math.max(180,spacingMeters*3,9*mad))){out[i]=mid;repaired++;}
    }heights=out;
  }
  if(heights.some(v=>!Number.isFinite(v)))throw Error('Zone altimétrique manquante : le relief ne peut pas être reconstruit correctement.');
  // Bilateral smoothing reduces stairsteps without flattening ridges wholesale.
  const blend=Math.max(0,Math.min(1,strength))*.48,sigma=Math.max(30,spacingMeters*.85);
  for(let pass=0;pass<2&&blend>0;pass++){
    const out=heights.slice();
    for(let y=1;y<grid;y++)for(let x=1;x<grid;x++){
      const i=y*n+x,v=heights[i];let sum=0,weight=0;
      for(const z of neighbours(heights,x,y)){const w=Math.exp(-(((z-v)/sigma)**2)/2);sum+=w*z;weight+=w;}
      if(weight)out[i]=v*(1-blend)+sum/weight*blend;
    }heights=out;
  }
  return {heights,repaired};
}
