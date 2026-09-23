// Deterministic, locally generated materials; no downloaded/decorative stock assets.
export function seededRandom(seed) {
  return () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
}

// Transparent typography remains legible on both rock and snow.
export function paintLiveGpxCard(canvas,metrics){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();
  ctx.scale(canvas.width/720,canvas.height/320);ctx.font='500 53px sans-serif';ctx.textAlign='left';
  ctx.fillStyle='#ffffff';ctx.strokeStyle='rgba(8,15,20,.65)';ctx.lineWidth=4;ctx.lineJoin='round';
  ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=8;ctx.shadowOffsetY=2;
  const n=value=>Math.round(value).toLocaleString('fr-CH');
  const rows=[`Altitude  ${n(metrics.altitude)} m`,`Dénivelé +  ${metrics.gain===null?'—':n(metrics.gain)+' m'}`,`Distance  ${metrics.distance.toFixed(2).replace('.',',')} km`];
  rows.forEach((text,i)=>{ctx.strokeText(text,22,75+i*94,672);ctx.fillText(text,22,75+i*94,672);});ctx.restore();return canvas;
}
export function paintStoryLabel(canvas,pin){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();
  ctx.scale(canvas.width/900,canvas.height/440);ctx.fillStyle='#ffffff';ctx.strokeStyle='rgba(4,12,17,.75)';ctx.lineWidth=4;ctx.lineJoin='round';ctx.textAlign='left';
  ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=8;ctx.shadowOffsetY=2;
  const wrap=(text,font,y,lineHeight,maxLines)=>{ctx.font=font;let lines=[],line='';for(const word of text.trim().split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>850&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
    const shown=lines.slice(0,maxLines);if(lines.length>maxLines)shown[maxLines-1]+='…';shown.forEach((text,i)=>{ctx.strokeText(text,20,y+i*lineHeight,850);ctx.fillText(text,20,y+i*lineHeight,850);});return y+shown.length*lineHeight;};
  const y=wrap(pin.name,'600 64px sans-serif',78,76,2);if(pin.comment)wrap(pin.comment,'44px sans-serif',y+12,57,4);
  ctx.restore();return canvas;
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

export const GROUND_KINDS=['marble','dark-marble','slate','wood','studio','meadow','earth','gravel'];

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
    } else if (['meadow','earth','gravel'].includes(kind)) {
      // Crossfade opposite edges of the noise field, so repeated tiles join.
      const tile=(freq,seed)=>{
        const a=fbm(u*freq,v*freq,seed),b=fbm((u-1)*freq,v*freq,seed),c=fbm(u*freq,(v-1)*freq,seed),d=fbm((u-1)*freq,(v-1)*freq,seed);
        return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
      };
      const patches=tile(5,341),detail=tile(44,928),fleck=grain*16;
      if(kind==='meadow'){
        const dirt=Math.max(0,(patches-.54)*4),dry=detail*23;
        r=70+patches*33+dry+dirt*22+fleck;g=79+patches*44+dry-dirt*8+fleck;b=36+patches*22+dry*.6+fleck;
      }else if(kind==='earth'){
        const light=patches*34+detail*24+fleck;
        r=61+light;g=47+light*.88;b=32+light*.71;
      }else{
        const pebble=detail> .52 ? 22: -8,light=patches*30+detail*42+fleck+pebble;
        r=98+light;g=94+light;b=81+light;
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

function wrappedText(ctx,text,x,y,width,maxLines=3,lineHeight=36) {
  let line='',lines=[];
  for (const word of text.split(/\s+/)) {
    const next=line?`${line} ${word}`:word;
    if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  lines.slice(0,maxLines).forEach((value,index)=>ctx.fillText(value+(index===maxLines-1&&lines.length>maxLines?'…':''),x,y+index*lineHeight,width));
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

export function paintTravelNotebook(canvas,stats,route=[]){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.fillStyle='#f1e7ce';ctx.fillRect(0,0,w,h);
  const rng=seededRandom(2147);for(let i=0;i<7000;i++){ctx.fillStyle=`rgba(104,82,43,${rng()*.06})`;ctx.fillRect(rng()*w,rng()*h,2,2);}
  ctx.strokeStyle='#c8b991';ctx.lineWidth=2;
  for(let y=120;y<h-80;y+=55){ctx.beginPath();ctx.moveTo(w*.54,y);ctx.lineTo(w*.94,y);ctx.stroke();}
  ctx.fillStyle='#495f4b';ctx.font='italic 42px Georgia, serif';ctx.fillText('Souvenirs d’ascension',w*.07,100);
  // Hand-drawn contour map on the left page.
  ctx.strokeStyle='rgba(82,107,77,.3)';ctx.lineWidth=3;
  for(let k=0;k<14;k++){ctx.beginPath();for(let i=0;i<=100;i++){const a=i/100*Math.PI*2,r=60+k*16+12*Math.sin(a*3+k*.3);const x=w*.26+Math.cos(a)*r,y=h*.46+Math.sin(a)*r*.8;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  if(route.length>1){const xs=route.map(p=>p.x),zs=route.map(p=>p.z),minX=Math.min(...xs),minZ=Math.min(...zs),dx=Math.max(.01,Math.max(...xs)-minX),dz=Math.max(.01,Math.max(...zs)-minZ);ctx.strokeStyle='#b95734';ctx.lineWidth=6;ctx.beginPath();route.forEach((p,i)=>{const x=w*.10+(p.x-minX)/dx*w*.32,y=h*.25+(p.z-minZ)/dz*h*.45;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  ctx.fillStyle='#756747';ctx.font='italic 30px Georgia, serif';ctx.fillText(stats.date||'Au fil des sommets',w*.10,h*.86);
  const rows=[['ALTITUDE',stats.altitude],['DISTANCE',stats.distance],['DÉNIVELÉ +',stats.gain],['DURÉE',stats.duration]];
  rows.forEach(([label,value],i)=>{const y=115+i*140;ctx.fillStyle='#64705a';ctx.font='600 24px sans-serif';ctx.fillText(label,w*.56,y);ctx.fillStyle='#343e31';fitText(ctx,String(value),w*.56,y+62,w*.37,53,'Georgia, serif');});
  ctx.fillStyle='#63533b';ctx.font='italic 31px Georgia, serif';wrappedText(ctx,stats.comment||'—',w*.56,760,w*.37,5);
  const binding=ctx.createLinearGradient(w*.46,0,w*.54,0);binding.addColorStop(0,'rgba(80,55,26,0)');binding.addColorStop(.5,'rgba(80,55,26,.35)');binding.addColorStop(1,'rgba(80,55,26,0)');ctx.fillStyle=binding;ctx.fillRect(w*.46,0,w*.08,h);
  ctx.strokeStyle='#9d8261';ctx.lineWidth=3;ctx.setLineDash([8,10]);ctx.beginPath();ctx.moveTo(w*.5,25);ctx.lineTo(w*.5,h-25);ctx.stroke();ctx.setLineDash([]);
  return canvas;
}

export function containPhoto(ctx,image,x,y,w,h){
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(!iw||!ih)return;const scale=Math.min(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
export function paintBookSpread(canvas,page,image,index){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.fillStyle='#eee4ca';ctx.fillRect(0,0,w,h);
  const rng=seededRandom(914+index);for(let i=0;i<5000;i++){ctx.fillStyle=`rgba(116,83,39,${rng()*.075})`;ctx.fillRect(rng()*w,rng()*h,1+rng()*3,1);}
  const shade=ctx.createLinearGradient(w*.45,0,w*.55,0);shade.addColorStop(0,'#76522a00');shade.addColorStop(.5,'#76522a55');shade.addColorStop(1,'#76522a00');ctx.fillStyle=shade;ctx.fillRect(w*.45,0,w*.1,h);
  ctx.strokeStyle='#b7a984';ctx.lineWidth=1;for(let y=239;y<h-120;y+=36){ctx.beginPath();ctx.moveTo(w*.065,y);ctx.lineTo(w*.45,y);ctx.stroke();}
  ctx.fillStyle='#7c6d4f';ctx.font='600 22px sans-serif';ctx.fillText((page.chapter||'CARNET DE VOYAGE').toUpperCase(),w*.065,54,w*.37);
  ctx.fillStyle='#42503e';ctx.font='italic 47px Georgia, serif';wrappedText(ctx,page.title||'Au fil des sommets',w*.065,119,w*.37,2);
  ctx.fillStyle='#4d493c';ctx.font='30px Georgia, serif';
  let textY=234;for(const paragraph of (page.text||'').split(/\n/)){let line='';for(const word of paragraph.split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w*.37&&line){if(textY<h-85)ctx.fillText(line,w*.065,textY,w*.37);textY+=36;line=word;}else line=next;}if(line&&textY<h-85)ctx.fillText(line,w*.065,textY,w*.37);textY+=36;}
  if(textY>=h-85){ctx.fillStyle='#eee4ca';ctx.fillRect(w*.40,h-112,w*.05,40);ctx.fillStyle='#4d493c';ctx.fillText('…',w*.415,h-86);}
  const x=w*.545,y=90,pw=w*.40,ph=h*.68;
  ctx.save();ctx.translate(x+pw/2,y+ph/2);ctx.rotate(-.018);ctx.shadowColor='#45371e44';ctx.shadowBlur=18;ctx.shadowOffsetX=6;ctx.shadowOffsetY=8;ctx.fillStyle='#fcf9ee';ctx.fillRect(-pw/2-15,-ph/2-15,pw+30,ph+65);ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  if(image)containPhoto(ctx,image,-pw/2,-ph/2,pw,ph);else{ctx.strokeStyle='#9eab93';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-pw*.4,ph*.2);ctx.lineTo(-pw*.1,-ph*.12);ctx.lineTo(pw*.05,ph*.03);ctx.lineTo(pw*.22,-ph*.3);ctx.lineTo(pw*.43,ph*.2);ctx.stroke();ctx.fillStyle='#82755f';ctx.font='italic 28px Georgia';ctx.fillText('Un souvenir à raconter',-pw*.35,ph*.36);}
  ctx.restore();ctx.fillStyle='#625741';ctx.font='italic 29px Georgia, serif';wrappedText(ctx,page.caption||'',x,h*.86,pw,3);
  ctx.font='23px Georgia';ctx.fillText(String(index*2+1),w*.08,h-38);ctx.fillText(String(index*2+2),w*.92,h-38);return canvas;
}
export function paintStoryPhoto(canvas,pin,image){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.scale(canvas.width/900,canvas.height/1040);
  // A small photographic print, above the pin, separate from the unobtrusive counters.
  ctx.shadowColor='#0008';ctx.shadowBlur=16;ctx.fillStyle='#f5f0e3';ctx.fillRect(24,18,852,590);ctx.shadowBlur=0;
  if(image)containPhoto(ctx,image,40,34,820,554);else{ctx.fillStyle='#716d62';ctx.font='34px sans-serif';ctx.fillText('Photo indisponible · réimporte-la',95,310);}
  ctx.restore();const text=canvas.ownerDocument.createElement('canvas');text.width=900;text.height=440;paintStoryLabel(text,pin);ctx.drawImage(text,0,canvas.height*600/1040,canvas.width,canvas.height*440/1040);return canvas;
}

export function paintBookCover(canvas,cover,image){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.fillStyle=cover.color||'#334e43';ctx.fillRect(0,0,w,h);
  const rng=seededRandom(778);for(let i=0;i<20000;i++){ctx.fillStyle=i%2?'rgba(0,0,0,.08)':'rgba(255,246,220,.08)';ctx.fillRect(rng()*w,rng()*h,1+rng()*3,1+rng()*2);}
  const shadow=ctx.createLinearGradient(0,0,w,0);shadow.addColorStop(0,'#0008');shadow.addColorStop(.10,'#0000');shadow.addColorStop(.9,'#0000');shadow.addColorStop(1,'#0004');ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#c6ad76';ctx.lineWidth=2;ctx.strokeRect(w*.07,h*.05,w*.86,h*.90);ctx.setLineDash([5,7]);ctx.strokeStyle='#c6ad7677';ctx.strokeRect(w*.045,h*.033,w*.91,h*.934);ctx.setLineDash([]);
  ctx.fillStyle='#dec996';ctx.font='600 22px sans-serif';ctx.textAlign='center';ctx.fillText('CARNET D’ASCENSION',w/2,h*.13,w*.75);
  ctx.font='italic 52px Georgia, serif';ctx.textAlign='left';wrappedText(ctx,cover.title||'Au fil des sommets',w*.14,h*.23,w*.72,3,60);
  if(image){ctx.fillStyle='#e4d5b7';ctx.fillRect(w*.16,h*.41,w*.68,h*.34);containPhoto(ctx,image,w*.17,h*.42,w*.66,h*.32);}
  else{ctx.strokeStyle='#d1b985';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.20,h*.67);ctx.lineTo(w*.37,h*.48);ctx.lineTo(w*.48,h*.59);ctx.lineTo(w*.62,h*.43);ctx.lineTo(w*.80,h*.67);ctx.stroke();ctx.beginPath();ctx.moveTo(w*.33,h*.525);ctx.lineTo(w*.37,h*.54);ctx.lineTo(w*.40,h*.516);ctx.stroke();}
  ctx.fillStyle='#d5c298';ctx.font='italic 28px Georgia, serif';wrappedText(ctx,cover.subtitle||'Récits, chemins et souvenirs',w*.14,h*.83,w*.72,3);
  return canvas;
}
