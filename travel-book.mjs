import * as THREE from 'three';
import {clamp,smootherstep} from './route-motion.mjs?v=7';
export const PAGE_TURN_SECONDS=2.2;
export const BOOK_OPEN_SECONDS=2.6;
export const BOOK_CLOSE_SECONDS=2.4;
export function cleanBookPages(value){
  if(!Array.isArray(value))return [];
  return value.slice(0,12).map(p=>({chapter:String(p?.chapter||'').slice(0,80),title:String(p?.title||'').slice(0,80),text:String(p?.text||'').slice(0,1000),caption:String(p?.caption||'').slice(0,160),image:typeof p?.image==='string'&&/^photo-[a-zA-Z0-9-]{1,80}$/.test(p.image)?p.image:''}));
}
// Integrate the tangent along the sheet. Arc length remains constant instead of
// stretching a plane. The free edge leads; a small diagonal curl lifts the corner.
export function sheetPoint(u,v,time,width,height){
  const t=smootherstep(clamp(time)),bend=Math.sin(Math.PI*t),steps=32;
  let x=0,y=0;
  for(let k=0;k<steps;k++){
    const s=u*(k+.5)/steps;
    const angle=Math.PI*t+bend*(.95*(2*s-1)+.22*v*s);
    x+=Math.cos(angle)*u*width/steps;y+=Math.sin(angle)*u*width/steps;
  }
  // Flat pages retain a slight natural fall away from their stitched spine.
  y+=.22+.035*Math.exp(-u*8)+.025*bend*u*u*v;
  return {x,y,z:(v-.5)*height};
}
export function sampleBookReading(count,time,duration){
  const lead=Math.min(2.4,duration*.2),available=Math.max(.01,duration-lead),n=Math.max(1,count);
  const turnLength=Math.min(PAGE_TURN_SECONDS,available/(n*2)),hold=(available-(n-1)*turnLength)/n;
  const interval=hold+turnLength,t=clamp(time-lead,0,available),index=Math.min(n-1,Math.floor(t/interval));
  return {index,turn:index<n-1?clamp((t-index*interval-hold)/turnLength):0};
}
export function bookNarrationDuration(count,hold,{openBook=false,closeBook=false}={}){
  return 2.4+(openBook?BOOK_OPEN_SECONDS:0)+Math.max(1,count)*hold+Math.max(0,count-1)*PAGE_TURN_SECONDS+(closeBook?BOOK_CLOSE_SECONDS:0);
}
export function sampleBookNarration(count,time,hold,options={}){
  const duration=bookNarrationDuration(count,hold,options),lead=2.4,opening=options.openBook?BOOK_OPEN_SECONDS:0;
  const reading=count*hold+Math.max(0,count-1)*PAGE_TURN_SECONDS;
  if(time<lead)return {index:0,turn:0,openness:options.openBook?0:1};
  if(opening&&time<lead+opening)return {index:0,turn:0,openness:smootherstep((time-lead)/opening)};
  if(time<lead+opening+reading){const state=sampleBookReading(count,time-opening,lead+reading);return {...state,openness:1};}
  return {index:Math.max(0,count-1),turn:0,openness:options.closeBook?1-smootherstep((time-(lead+opening+reading))/BOOK_CLOSE_SECONDS):1};
}
export function createTravelBook({width,height,paintSpread,spreadCount,anisotropy=4,document:doc,paintCover}){
  const book=new THREE.Group();book.name='travel-notebook';
  const leftHalf=new THREE.Group();leftHalf.name='book-front-half';leftHalf.position.y=.27;book.add(leftHalf);
  const toLeft=object=>{book.remove(object);object.position.y-=.27;leftHalf.add(object);return object;};
  const paper=new THREE.MeshStandardMaterial({color:0xd8c9a8,roughness:1});
  const leatherCanvas=doc.createElement('canvas');leatherCanvas.width=256;leatherCanvas.height=256;
  const c=leatherCanvas.getContext('2d');c.fillStyle='#533e2d';c.fillRect(0,0,256,256);
  let seed=37;for(let i=0;i<6500;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%256;seed=(Math.imul(seed,1664525)+1013904223)>>>0;c.fillStyle=i%2?'#634b35':'#423022';c.fillRect(x,seed%256,1,2);}
  const leatherMap=new THREE.CanvasTexture(leatherCanvas);leatherMap.colorSpace=THREE.SRGBColorSpace;leatherMap.wrapS=leatherMap.wrapT=THREE.RepeatWrapping;leatherMap.repeat.set(5,3);
  const leather=new THREE.MeshStandardMaterial({map:leatherMap,bumpMap:leatherMap,bumpScale:.015,roughness:.92});
  const addBox=(w,h,d,x,y,z,material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);book.add(m);return m;};
  for(const sign of [-1,1]){
    const cw=width/2+.1,ch=height+.2,r=.09,shape=new THREE.Shape();
    shape.moveTo(-cw/2+r,-ch/2);shape.lineTo(cw/2-r,-ch/2);shape.quadraticCurveTo(cw/2,-ch/2,cw/2,-ch/2+r);shape.lineTo(cw/2,ch/2-r);shape.quadraticCurveTo(cw/2,ch/2,cw/2-r,ch/2);shape.lineTo(-cw/2+r,ch/2);shape.quadraticCurveTo(-cw/2,ch/2,-cw/2,ch/2-r);shape.lineTo(-cw/2,-ch/2+r);shape.quadraticCurveTo(-cw/2,-ch/2,-cw/2+r,-ch/2);
    const coverGeo=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.018,bevelThickness:.018,curveSegments:5});coverGeo.rotateX(-Math.PI/2);
    const cover=new THREE.Mesh(coverGeo,leather);cover.position.set(sign*width/4,.025,0);book.add(cover);if(sign<0)toLeft(cover);
    const stack=addBox(width/2-.015,.11,height,sign*width/4,.14,0,paper);if(sign<0)toLeft(stack);
    const edgeMat=new THREE.LineBasicMaterial({color:0xaa9470,transparent:true,opacity:.48});
    const lines=[];
    for(let i=0;i<9;i++){const y=.093+i*.012,x0=sign<0?-width/2:0,x1=sign<0?0:width/2;lines.push(new THREE.Vector3(x0,y,height/2+.003),new THREE.Vector3(x1,y,height/2+.003),new THREE.Vector3(sign*width/2,y,-height/2),new THREE.Vector3(sign*width/2,y,height/2));}
    const edges=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines),edgeMat);book.add(edges);if(sign<0)toLeft(edges);
  }
  addBox(.13,.12,height+.14,0,.07,0,leather);
  const ribbon=addBox(.075,.009,height*.65,width*.16,.091,height*.4,new THREE.MeshStandardMaterial({color:0x8c4435,roughness:1}));ribbon.rotation.y=.05;
  const staticGeo=new THREE.PlaneGeometry(width/2,height,48,12);staticGeo.rotateX(-Math.PI/2);
  const makeStatic=sign=>{const geo=staticGeo.clone(),p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+sign*width/4;p.setXYZ(i,x,.22+.035*Math.exp(-Math.abs(x)/(width/2)*8),p.getZ(i));}geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({roughness:.96,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));book.add(mesh);return mesh;};
  const left=makeStatic(-1),right=makeStatic(1);toLeft(left);staticGeo.dispose();
  if(paintCover){const coverMap=new THREE.CanvasTexture(paintCover());coverMap.colorSpace=THREE.SRGBColorSpace;coverMap.anisotropy=anisotropy;const faceGeo=new THREE.PlaneGeometry(width/2+.07,height+.17);faceGeo.rotateX(Math.PI/2);faceGeo.translate(-width/4,.005,0);
    const uv=faceGeo.attributes.uv;for(let i=0;i<uv.count;i++){uv.setXY(i,1-uv.getX(i),1-uv.getY(i));}
    const face=new THREE.Mesh(faceGeo,new THREE.MeshStandardMaterial({map:coverMap,roughness:.8,side:THREE.FrontSide}));face.name='book-cover-art';book.add(face);toLeft(face);
  }
  const turnGeo=new THREE.PlaneGeometry(width/2,height,64,20);turnGeo.rotateX(-Math.PI/2);
  // Plane UVs run top to bottom opposite local Z; the back reads normally after turning.
  const backGeo=turnGeo.clone(),uv=backGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
  const front=new THREE.Mesh(turnGeo,new THREE.MeshStandardMaterial({roughness:.96,side:THREE.FrontSide,shadowSide:THREE.DoubleSide}));
  const back=new THREE.Mesh(backGeo,new THREE.MeshStandardMaterial({roughness:.96,side:THREE.BackSide,shadowSide:THREE.DoubleSide}));
  book.add(front,back);
  const stitches=[];for(let z=-height*.44;z<height*.44;z+=.16)stitches.push(new THREE.Vector3(-.025,.267,z),new THREE.Vector3(.025,.267,z+.05));
  book.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stitches),new THREE.LineBasicMaterial({color:0x8c7656})));
  book.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const cache=new Map();
  function maps(index){
    if(cache.has(index))return cache.get(index);
    const spread=paintSpread(index),pair=[0,1].map(side=>{const canvas=doc.createElement('canvas');canvas.width=spread.width/2;canvas.height=spread.height;canvas.getContext('2d').drawImage(spread,side*canvas.width,0,canvas.width,canvas.height,0,0,canvas.width,canvas.height);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=anisotropy;return map;});cache.set(index,pair);return pair;
  }
  const setMap=(mesh,map)=>{if(mesh.material.map!==map){mesh.material.map=map;mesh.material.needsUpdate=true;}};
  function setState(index,turn=0){
    index=Math.max(0,Math.min(spreadCount-1,Math.floor(index)));turn=index<spreadCount-1?clamp(turn):0;
    if(turn===1){index++;turn=0;}
    if(book.userData.index===index&&book.userData.turn===turn&&left.material.map)return;
    const next=Math.min(spreadCount-1,index+1),currentMaps=maps(index),nextMaps=turn>0?maps(next):currentMaps;
    setMap(left,currentMaps[0]);setMap(right,turn>0?nextMaps[1]:currentMaps[1]);front.visible=back.visible=turn>0;
    if(turn>0){setMap(front,currentMaps[1]);setMap(back,nextMaps[0]);
      const p=turnGeo.attributes.position,b=backGeo.attributes.position;
      for(let i=0;i<p.count;i++){const u=turnGeo.attributes.uv.getX(i),v=1-turnGeo.attributes.uv.getY(i),q=sheetPoint(u,v,turn,width/2,height);p.setXYZ(i,q.x,q.y+.003,q.z);b.setXYZ(i,q.x,q.y+.003,q.z);}
      p.needsUpdate=b.needsUpdate=true;turnGeo.computeVertexNormals();backGeo.computeVertexNormals();turnGeo.computeBoundingSphere();backGeo.computeBoundingSphere();
    }
    book.userData.index=index;book.userData.turn=turn;
    // Keep only visible and immediately neighbouring spreads in GPU memory.
    for(const [key,pair] of cache)if(Math.abs(key-index)>1){pair.forEach(t=>t.dispose());cache.delete(key);}
  }
  function setOpenness(value){const openness=clamp(value);leftHalf.rotation.z=-Math.PI*(1-openness);book.userData.openness=openness;front.visible=back.visible=openness>.999&&book.userData.turn>0;}
  book.userData={width,height,spreadCount,index:0,turn:0,openness:1,manualTurn:null,manualCover:null,surface:left,setState,setOpenness,dispose:()=>{for(const pair of cache.values())pair.forEach(t=>t.dispose());cache.clear();}};
  setState(0);return book;
}
