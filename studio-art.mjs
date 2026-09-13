// Deterministic, locally generated materials; no downloaded/decorative stock assets.
export function seededRandom(seed) {
  return () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
}

function lattice(x,y,seed) {
  let n=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}

function noise(x,y,seed=41) {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const a=lattice(ix,iy,seed),b=lattice(ix+1,iy,seed),c=lattice(ix,iy+1,seed),d=lattice(ix+1,iy+1,seed);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}

function fbm(x,y,seed=41) {
  return noise(x,y,seed)*.55+noise(x*2,y*2,seed+7)*.27+noise(x*4,y*4,seed+19)*.13+noise(x*8,y*8,seed+43)*.05;
}

export const GROUND_KINDS=['marble','dark-marble','slate','wood','studio'];

export function paintGround(canvas,kind='marble') {
  const {width,height}=canvas,ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const u=x/width,v=y/height,grain=lattice(x,y,571)-.5;
    const broad=fbm(u*9,v*9),warp=fbm(u*18+3,v*18+17,117);
    let r,g,b;
    if (kind==='marble'||kind==='dark-marble') {
      const band=u*24+v*13+(broad-.5)*10+(warp-.5)*2.8;
      const vein=Math.pow(1-Math.abs(Math.sin(band)),18);
      const threads=Math.pow(1-Math.abs(Math.sin(band*2.71+fbm(u*45,v*45,881)*3)),42)*.25;
      const cloudy=fbm(u*42,v*42,712);
      if (kind==='dark-marble') {
        const value=25+broad*15+vein*108+threads*85+grain*4;
        r=value*1.04;g=value;b=value*.94;
      } else {
        const value=236+cloudy*15-vein*(48+warp*70)-threads*46+grain*2.8;
        r=value+3;g=value+1;b=value-4;
      }
    } else if (kind==='wood') {
      const grainLine=Math.pow(Math.abs(Math.sin(v*320+fbm(u*7,v*25,12)*20)),16);
      const value=146+broad*35-grainLine*25+grain*5;
      r=value*1.13;g=value*.81;b=value*.51;
    } else if (kind==='slate') {
      const value=63+broad*24+warp*12+grain*9;
      r=value*.92;g=value;b=value*1.05;
    } else { r=109+grain*3;g=115+grain*3;b=114+grain*3; }
    const i=(y*width+x)*4;
    image.data[i]=r;image.data[i+1]=g;image.data[i+2]=b;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return canvas;
}

export function paintCloud(canvas,seed,detail=2) {
  const {width:s}=canvas,ctx=canvas.getContext('2d'),rng=seededRandom(seed);
  const family=seed%3; // billowy cumulus, elongated mist, fragmented cloud
  const count=[0,12,22,36][detail];
  for (let i=0;i<count;i++) {
    const x=s*(.19+rng()*.62),y=s*(.35+rng()*(family===1?.2:.36));
    const radius=s*(.055+rng()*(family===0?.16:.12));
    const gradient=ctx.createRadialGradient(x-radius*.2,y-radius*.35,0,x,y,radius);
    gradient.addColorStop(0,'rgba(255,255,252,.85)');
    gradient.addColorStop(.42,'rgba(248,249,245,.62)');
    gradient.addColorStop(.76,'rgba(217,225,226,.24)');
    gradient.addColorStop(1,'rgba(203,213,218,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,s,s);
  }
  return canvas;
}

function roundedRect(ctx,x,y,w,h,r) {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

function fitText(ctx,text,x,y,width,size,font) {
  while (size>18) {ctx.font=`${size}px ${font}`;if(ctx.measureText(text).width<=width)break;size-=2;}
  ctx.fillText(text,x,y,width);
}

function wrappedText(ctx,text,x,y,width,maxLines=3) {
  let line='',lines=[];
  for (const word of text.split(/\s+/)) {
    const next=line?`${line} ${word}`:word;
    if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  lines.slice(0,maxLines).forEach((value,index)=>ctx.fillText(value+(index===maxLines-1&&lines.length>maxLines?'…':''),x,y+index*36,width));
}

export function paintStatsCard(canvas,stats) {
  const ctx=canvas.getContext('2d'),rng=seededRandom(9817);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();roundedRect(ctx,20,18,984,568,16);ctx.clip();
  ctx.fillStyle='#f2ead7';ctx.fillRect(0,0,1024,610);
  for(let i=0;i<6500;i++){ctx.fillStyle=`rgba(101,75,39,${rng()*.09})`;ctx.fillRect(rng()*1024,rng()*610,1+rng()*2,1+rng()*2);}
  // Subtle contour lines: a paper topographic-map motif, not a headline.
  ctx.strokeStyle='rgba(91,109,79,.09)';ctx.lineWidth=2;
  for(let i=0;i<12;i++) {
    ctx.beginPath();
    for(let j=0;j<=100;j++){const a=j/100*Math.PI*2,r=50+i*19+13*Math.sin(a*3+i*.3)+8*Math.sin(a*7);const x=850+Math.cos(a)*r,y=122+Math.sin(a)*r*.55;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();
  }
  ctx.fillStyle='#3f5543';ctx.fillRect(20,18,11,568);
  ctx.strokeStyle='#b8aa8b';ctx.lineWidth=2;roundedRect(ctx,40,36,944,532,8);ctx.stroke();
  ctx.strokeStyle='#c0b598';ctx.setLineDash([4,7]);roundedRect(ctx,49,45,926,514,6);ctx.stroke();ctx.setLineDash([]);
  const rows=[['ALTITUDE',stats.altitude],['DISTANCE',stats.distance],['DÉNIVELÉ +',stats.gain],['DURÉE',stats.duration]];
  rows.forEach(([label,value],i)=>{
    const x=77+(i%2)*457,y=94+Math.floor(i/2)*132;
    ctx.fillStyle='#66715b';ctx.font='600 21px sans-serif';ctx.fillText(label,x,y);
    ctx.fillStyle='#303e32';fitText(ctx,String(value),x,y+56,402,47,'Georgia, serif');
  });
  ctx.strokeStyle='#bcad8d';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(76,343);ctx.lineTo(949,343);ctx.stroke();
  ctx.fillStyle='#705f47';ctx.font='italic 29px Georgia, serif';wrappedText(ctx,stats.comment||'—',77,395,870,4);
  if(stats.date){ctx.fillStyle='#66715b';ctx.font='20px sans-serif';ctx.textAlign='right';ctx.fillText(stats.date,945,546);}
  ctx.restore();
  return canvas;
}
