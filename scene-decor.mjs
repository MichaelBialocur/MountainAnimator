import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const DECOR_DEFAULTS={decorEnabled:false,decorPebbles:true,decorRocks:true,decorGrass:true,decorTrees:true,decorDensity:45,decorScale:1,decorSpread:4,decorSeed:1};
export const DECOR_PRESETS={
  meadow:{groundTexture:'meadow',decorEnabled:true,decorPebbles:true,decorRocks:true,decorGrass:true,decorTrees:false,decorDensity:60,decorScale:1,decorSpread:4},
  scree:{groundTexture:'gravel',decorEnabled:true,decorPebbles:true,decorRocks:true,decorGrass:false,decorTrees:false,decorDensity:75,decorScale:1,decorSpread:4},
  forest:{groundTexture:'earth',decorEnabled:true,decorPebbles:true,decorRocks:true,decorGrass:true,decorTrees:true,decorDensity:65,decorScale:1.2,decorSpread:5}
};
const rngFor=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function cleanDecorSettings(settings={}){
  const result={...DECOR_DEFAULTS};
  for(const k of ['decorEnabled','decorPebbles','decorRocks','decorGrass','decorTrees'])if(typeof settings[k]==='boolean')result[k]=settings[k];
  for(const [k,lo,hi] of [['decorDensity',0,100],['decorScale',.4,2],['decorSpread',2,8],['decorSeed',1,2147483647]]){
    const n=Number(settings[k]);if(Number.isFinite(n))result[k]=Math.max(lo,Math.min(hi,n));
  }
  result.decorSeed=Math.floor(result.decorSeed);return result;
}

// All footprints include the complete object, not only its centre. The mountain
// circle encloses every organic outline at any rotation. Book rectangles enclose
// both covers and the moving page, independent of the currently open spread.
export function decorPositionAllowed(x,z,radius,mountains,books){
  if(mountains.some(m=>Math.hypot(x-m.x,z-m.z)<m.radius+radius+.18))return false;
  if(books.some(b=>Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ))<radius+.35))return false;
  return true;
}
export function planDecor(settings,mountains=[],books=[]){
  const s=cleanDecorSettings(settings),items=[];if(!s.decorEnabled||!mountains.length)return items;
  const random=rngFor(s.decorSeed),countScale=s.decorDensity/100*Math.min(2,mountains.length);
  const types=[['tree','decorTrees',38,.56],['rock','decorRocks',75,.26],['pebble','decorPebbles',240,.075],['grass','decorGrass',380,.16]];
  for(const [type,key,max,r] of types){
    if(!s[key])continue;
    for(let i=0;i<Math.round(max*countScale);i++){
      const size=s.decorScale*(.65+random()*.7),radius=r*size;
      for(let attempt=0;attempt<65;attempt++){
        const m=mountains[Math.floor(random()*mountains.length)],a=random()*Math.PI*2;
        // Trees grow behind and at the sides; the narrative foreground stays open.
        const distance=m.radius+radius+.25+s.decorSpread*Math.sqrt(random());
        const x=m.x+Math.cos(a)*distance,z=m.z+Math.sin(a)*distance;
        if(type==='tree'&&z>m.z+m.radius*.15)continue;
        if(Math.abs(x)+radius>98||Math.abs(z)+radius>68)continue;
        if(!decorPositionAllowed(x,z,radius,mountains,books))continue;
        if(items.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+radius+.025))continue;
        items.push({type,x,z,size,radius,angle:random()*Math.PI*2,tint:random(),variant:Math.floor(random()*3)});break;
      }
    }
  }
  return items;
}

function rockGeometry(variant,detail=2){
  const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=1+.13*Math.sin(x*6+variant*7)*Math.cos(z*5+y*4)+.05*Math.sin(y*13+x*3);
    p.setXYZ(i,x*n*.8,Math.max(0,(y*n+1.2)*.39),z*n*.72);
  }
  g.computeBoundingBox();g.translate(0,-g.boundingBox.min.y,0);g.computeVertexNormals();return g;
}
function firGeometry(compact=false){
  const parts=[];
  const tiers=compact?5:9;
  for(let layer=0;layer<tiers;layer++){
    const tier=layer*8/(tiers-1);
    const radius=.43*(1-tier/10),g=new THREE.ConeGeometry(radius,compact?.5:.39,compact?8:18,compact?1:2),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),a=Math.atan2(z,x),f=1+.16*Math.sin(a*7+tier*2)+.08*Math.cos(a*11);
      p.setXYZ(i,x*f,p.getY(i)+.03*Math.sin(a*9+tier),z*f);
    }
    g.translate(.017*Math.sin(tier*2),.33+tier*.118,.012*Math.cos(tier));parts.push(g);
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());merged.computeVertexNormals();return merged;
}
function grassGeometry(){
  const random=rngFor(902),positions=[],colors=[];
  for(let i=0;i<10;i++){
    const a=random()*Math.PI*2,h=.12+random()*.19,w=.009+random()*.01,lean=.045+random()*.07;
    const x=(random()-.5)*.07,z=(random()-.5)*.07,c=Math.cos(a),s=Math.sin(a);
    const point=(t,side)=>[x+c*lean*t*t-s*w*side*(1-t),h*t,z+s*lean*t*t+c*w*side*(1-t)];
    for(let j=0;j<3;j++)for(const [t,side] of [[j/3,-1],[j/3,1],[(j+1)/3,1],[j/3,-1],[(j+1)/3,1],[(j+1)/3,-1]]){positions.push(...point(t,side));colors.push(.45+t*.45,.52+t*.4,.29+t*.3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
export function createSceneDecor(items,{floorY=-.455,shadows=true,surface=false}={}){
  const root=new THREE.Group();root.name='natural-ground-decor';root.userData.items=items;
  const matrix=new THREE.Object3D(),color=new THREE.Color();
  function batch(name,list,geometry,material,factor,palette){
    if(!list.length){geometry.dispose();material.dispose();return;}
    const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name=name;
    mesh.castShadow=shadows;mesh.receiveShadow=true;
    list.forEach((p,i)=>{
      matrix.position.set(p.x,p.y??floorY,p.z);matrix.rotation.set(0,p.angle,0);
      if(p.normal)matrix.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...p.normal)));matrix.scale.setScalar(p.size*factor);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);
      color.set(palette[0]).lerp(new THREE.Color(palette[1]),p.tint);mesh.setColorAt(i,color);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);
  }
  const stone=()=>new THREE.MeshStandardMaterial({roughness:.96});
  for(const type of ['rock','pebble'])for(let v=0;v<3;v++)batch(type+'-'+v,items.filter(p=>p.type===type&&p.variant===v),rockGeometry(v,surface?1:2),stone(),type==='rock'?.26:.075,['#696759','#b2aaa0']);
  const trees=items.filter(p=>p.type==='tree');
  const trunk=new THREE.CylinderGeometry(.022,.052,1.2,7);trunk.translate(0,.6,0);
  batch('tree-trunks',trees,trunk,new THREE.MeshStandardMaterial({roughness:1}),1,['#4d3c29','#807052']);
  batch('tree-foliage',trees,firGeometry(surface),new THREE.MeshStandardMaterial({roughness:1}),1,['#233c27','#587044']);
  batch('grass',items.filter(p=>p.type==='grass'),grassGeometry(),new THREE.MeshStandardMaterial({roughness:1,side:THREE.DoubleSide,vertexColors:true}),1,['#79824a','#b0a770']);
  root.userData.dispose=()=>{root.children.forEach(mesh=>{mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();});root.clear();};return root;
}
