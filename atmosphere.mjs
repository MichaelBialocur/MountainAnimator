import * as THREE from 'three';
export const CLOUD_TYPES=['cumulus','stratus','cirrus','cumulonimbus'];
// A stable seed changes the construction of a cloud, not merely its noise.
// Profiles stay in a compact unit box so terrain clearance can bound the volume.
export function cloudProfile(type,seed,variation=1){
  const amount=Math.max(0,Math.min(1,Number.isFinite(variation)?variation:1));
  let state=((Number(seed)||0)^0x9e3779b9)>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296),range=(a,b)=>a+(b-a)*random();
  const lobes=[];const add=(x,y,z,rx,ry,rz,strength=1)=>lobes.push({center:[x,y,z,strength],radius:[rx,ry,rz,0]});
  let base=-.31,erosion=range(.075,.145),shear=range(-.20,.20),fill=range(.75,1.18);
  const archetype=Math.floor(random()*3);
  if(type==='stratus'){
    const count=3+Math.floor(random()*4);
    for(let i=0;i<count;i++)add(range(-.27,.27),range(-.10,.08),range(-.23,.23),range(.17,.34),range(.08,.20),range(.12,.30),range(.83,1));
    base=-.45;erosion*=.65;
  }else if(type==='cirrus'){
    const count=2+Math.floor(random()*4),bend=range(-.18,.18);
    for(let i=0;i<count;i++){const z=(i/(count-1)-.5)*range(.35,.64);add(range(-.16,.16)+bend*z,range(-.08,.08),z,range(.28,.48),range(.065,.15),range(.035,.095),range(.80,1));}
    base=-.47;erosion*=.4;shear*=.3;fill=range(.7,1.1);
  }else if(type==='cumulonimbus'){
    const count=3+Math.floor(random()*3),lean=range(-.22,.22),offset=range(-.12,.12);
    for(let i=0;i<count;i++){const t=i/(count-1);add(offset+lean*t+range(-.07,.07),-.29+t*.51,range(-.10,.10),range(.14,.24)+(archetype===1?.04:0),range(.15,.23),range(.15,.25));}
    add(offset+lean+range(-.035,.035),range(.27,.34),range(-.04,.04),range(.34,.49),range(.055,.11),range(.25,.40));
    if(archetype===2)add(-offset-.15,-.08,range(-.10,.10),range(.17,.25),range(.18,.29),range(.16,.24));
    base=-.42;fill*=1.05;
  }else{
    const count=3+Math.floor(random()*5);
    for(let i=0;i<count;i++){
      const angle=range(0,Math.PI*2),spread=range(.04,archetype===2?.30:.23);
      const y=archetype===0?range(-.18,-.04):archetype===1?range(-.16,.20):range(-.16,.09);
      add(Math.cos(angle)*spread,y,Math.sin(angle)*spread,range(.13,archetype===0?.31:.24),range(archetype===0?.09:.15,archetype===1?.30:.21),range(.13,.26));
    }
    if(archetype!==2&&lobes.length<8)add(range(-.08,.08),-.21,range(-.06,.06),range(.28,.40),range(.10,.15),range(.24,.32));
    base=archetype===0?-.25:-.32;
  }
  const baseline=type==='stratus'?[
    {center:[-.16,0,0,1],radius:[.29,.15,.27,0]},{center:[.14,.02,.03,1],radius:[.29,.15,.27,0]}]:type==='cirrus'?[
    {center:[0,0,-.10,1],radius:[.43,.10,.07,0]},{center:[.03,.03,.12,1],radius:[.39,.10,.07,0]}]:type==='cumulonimbus'?[
    {center:[0,-.25,0,1],radius:[.22,.20,.22,0]},{center:[-.04,-.05,0,1],radius:[.23,.25,.23,0]},{center:[.03,.15,0,1],radius:[.25,.24,.24,0]},{center:[0,.31,0,1],radius:[.46,.08,.36,0]}]:[
    {center:[0,-.17,0,1],radius:[.40,.15,.33,0]},{center:[-.21,0,0,1],radius:[.20,.22,.20,0]},{center:[0,.06,0,1],radius:[.25,.27,.24,0]},{center:[.22,-.02,.04,1],radius:[.19,.20,.20,0]}];
  const count=amount===0?baseline.length:lobes.length,centers=[],radii=[];
  for(let i=0;i<count;i++){
    const a=baseline[i%baseline.length],b=lobes[i%lobes.length];
    centers.push(a.center.map((x,j)=>x+(b.center[j]-x)*amount));radii.push(a.radius.map((x,j)=>x+(b.radius[j]-x)*amount));
  }
  // Preserve aspect variation: one common fit factor, not independent axes.
  let bound=0;for(let i=0;i<count;i++)for(let j=0;j<3;j++)bound=Math.max(bound,Math.abs(centers[i][j])+radii[i][j]);
  const fit=Math.min(1,.455/bound);
  for(let i=0;i<count;i++)for(let j=0;j<3;j++){centers[i][j]*=fit;radii[i][j]*=fit;}
  while(centers.length<8){centers.push([0,0,0,0]);radii.push([1,1,1,0]);}
  return {count,centers,radii,params:[-.31+(base+.31)*amount,.10+(erosion-.10)*amount,shear*amount,1+(fill-1)*amount],archetype};
}
export function cloudVolume(type,detail,seed,size,variation=1){
  const family=Math.max(0,CLOUD_TYPES.indexOf(type)),profile=cloudProfile(type,seed,variation);
  const scale=type==='cumulonimbus'?[5.2,3.8,3.0]:type==='stratus'?[2.8,.36,1.6]:type==='cirrus'?[3.2,.2,1.1]:[1.8,1.1,1.35];
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.BackSide,
    uniforms:{lobeCount:{value:profile.count},lobeCenters:{value:profile.centers.map(p=>new THREE.Vector4(...p))},lobeRadii:{value:profile.radii.map(p=>new THREE.Vector4(...p))},shapeParams:{value:new THREE.Vector4(...profile.params)},storm:{value:type==='cumulonimbus'?1:0},cloudType:{value:family},cloudScale:{value:new THREE.Vector3(...scale).multiplyScalar(size)},eye:{value:new THREE.Vector3()},lightDir:{value:new THREE.Vector3(.5,1,.4)},opacity:{value:.7},seed:{value:((seed%4093)+4093)%4093},steps:{value:[0,32,56,96][detail]||56}},
    vertexShader:`varying vec3 localPos;void main(){localPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float;
    varying vec3 localPos;uniform vec3 eye,lightDir,cloudScale;uniform float opacity,seed,storm;uniform int steps,cloudType,lobeCount;uniform vec4 lobeCenters[8],lobeRadii[8],shapeParams;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+seed)*43758.5453);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float lobe(vec3 p,vec3 center,vec3 radius){return 1.-smoothstep(.74,1.,length((p-center)/radius));}
    float profileShape(vec3 p){
      float form=0.;
      for(int i=0;i<8;i++){if(i>=lobeCount)break;form=max(form,lobe(p,lobeCenters[i].xyz,lobeRadii[i].xyz)*lobeCenters[i].w);}
      return form;
    }
    float cloudShape(vec3 p){
      float edge=1.-smoothstep(.45,.499,max(abs(p.x),max(abs(p.y),abs(p.z))));
      if(edge<=0.)return 0.;
      float billows=noise(p*vec3(18.,15.,18.)+vec3(seed*.013,7.2,13.1))-.5;
      p+=normalize(p+vec3(.13,.11,.07))*billows*shapeParams.y;
      p.x+=shapeParams.z*p.y;
      float form=profileShape(p);
      if(cloudType==1){
        float breakup=noise(vec3(p.x*6.,p.z*7.,3.7));
        form*=smoothstep(.19,.54,breakup);
      }else if(cloudType==2){
        float curve=noise(vec3(p.x*4.,1.3,8.1))-.5;
        float fibres=noise(vec3(p.x*2.1,p.y*2.,(p.z+curve*.15)*25.));
        form*=smoothstep(.35,.73,fibres);
      }else{
        form*=smoothstep(shapeParams.x,shapeParams.x+.035,p.y);
      }
      return edge*form;
    }
    float density(vec3 p,bool detailed){
      float shape=cloudShape(p);if(shape<=.001)return 0.;
      vec3 q=p+vec3(seed*.013,seed*.007,seed*.019);
      vec3 frequency=cloudType==1?vec3(5.,2.5,8.):cloudType==2?vec3(2.,3.,17.):vec3(6.,4.,6.);
      float field=noise(q*frequency);
      if(detailed)field=.68*field+.32*noise(q*frequency*2.07+vec3(4.3,1.7,9.2));
      if(cloudType==2)return shape*smoothstep(.29,.70,field)*1.5;
      // A dense core with a narrow carved transition reads as cloud structure,
      // rather than multiplying every point by the same fog-like falloff.
      float boundary=shape-.43+(field-.5)*.40;
      if(detailed){float erosion=noise(q*vec3(23.,19.,26.)+vec3(3.1,8.4,2.7));boundary-=(erosion-.38)*.18;}
      float body=smoothstep(-.18,.28,boundary);
      return body*(cloudType==1?2.7:cloudType==3?3.8:3.6)*shapeParams.w;
    }
    float lightTransmission(vec3 p,vec3 light){
      // Coarse density for the secondary rays keeps the lighting cost bounded.
      float metric=length(light*cloudScale);
      float optical=density(p+light*.07,false)*.10+density(p+light*.22,false)*.18;
      return exp(-optical*metric*opacity*1.85);
    }
    void main(){
      vec3 rd=normalize(localPos-eye);vec3 inv=1./(rd+vec3(.000001));vec3 a=(-.5-eye)*inv,b=(.5-eye)*inv;vec3 lo=min(a,b),hi=max(a,b);
      float begin=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));if(end<=begin)discard;
      float dt=(end-begin)/float(steps),worldStep=dt*length(rd*cloudScale);
      vec4 sum=vec4(0.);vec3 light=normalize(lightDir/max(cloudScale,vec3(.001)));
      float mu=clamp(dot(normalize(rd*cloudScale),normalize(lightDir)),-1.,1.);
      float forward=.45+.55*pow(.5+.5*mu,4.);
      float jitter=mix(.2,.8,hash(vec3(gl_FragCoord.xy,0.)));
      for(int i=0;i<96;i++){
        if(i>=steps||sum.a>.985)break;
        vec3 p=eye+rd*(begin+(float(i)+jitter)*dt);float d=density(p,true);if(d<.002)continue;
        float transmission=lightTransmission(p,light);
        float sky=smoothstep(-.32,.36,p.y);
        vec3 ambient=mix(vec3(.30,.36,.44),vec3(.57,.64,.72),sky);
        ambient=mix(ambient,ambient*.72,storm);
        vec3 direct=vec3(1.,.96,.87)*(.26+.74*transmission);
        vec3 color=ambient*.48+direct*(.40+.24*forward)*transmission;
        // Small multiple-scattering fill preserves readable shaded interiors.
        color+=vec3(.16,.17,.18)*(1.-transmission);
        float alpha=1.-exp(-d*worldStep*opacity*1.85);
        sum.rgb+=(1.-sum.a)*alpha*color;sum.a+=(1.-sum.a)*alpha;
      }
      if(sum.a<.003)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.userData.cloudProfile=profile;mesh.scale.set(...scale.map(v=>v*size));
  mesh.onBeforeRender=(_r,_s,camera)=>{
    mesh.updateWorldMatrix(true,false);camera.getWorldPosition(material.uniforms.eye.value);mesh.worldToLocal(material.uniforms.eye.value);mesh.getWorldScale(material.uniforms.cloudScale.value);
  };
  return mesh;
}
// A deterministic weighted distribution: a non-zero mix gets representatives
// even when only a handful of clouds is requested.
export function cloudTypeFor(index,count,type,weights){
  if(type!=='mixed')return CLOUD_TYPES.includes(type)?type:'cumulus';
  const enabled=CLOUD_TYPES.filter(t=>Number(weights[t])>0);
  if(!enabled.length)return 'cumulus';
  if(index<enabled.length)return enabled[index];
  const sum=enabled.reduce((n,t)=>n+Number(weights[t]),0);
  let sample=((index-enabled.length+.5)/Math.max(1,count-enabled.length))*sum;
  for(const t of enabled){sample-=Number(weights[t]);if(sample<0)return t;}return enabled.at(-1);
}

export function addSnow(material,config,exaggeration){
  const uniforms={snowLine:{value:config.snowEnabled?config.snowAltitude:1e7},snowScale:{value:exaggeration},snowCoverage:{value:config.snowCoverage??.68}};
  material.userData.snow=uniforms;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 snowPosition;varying vec3 snowNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowPosition=position;snowNormal=normal;');
    shader.fragmentShader=`varying vec3 snowPosition;varying vec3 snowNormal;uniform float snowLine;uniform float snowScale;uniform float snowCoverage;
    float snHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float snNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(snHash(i),snHash(i+vec2(1,0)),f.x),mix(snHash(i+vec2(0,1)),snHash(i+vec2(1,1)),f.x),f.y);}
    float snFbm(vec2 p){return .55*snNoise(p)+.28*snNoise(p*2.07+19.)+.12*snNoise(p*4.31+7.)+.05*snNoise(p*9.13);}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 terrainXY=snowPosition.xz;
      // Undo vertical exaggeration before calculating the physical slope.
      vec3 realNormal=normalize(vec3(snowNormal.x/snowScale,snowNormal.y,snowNormal.z/snowScale));
      float patches=snFbm(terrainXY*8.7+vec2(snNoise(terrainXY*2.1)*2.,0.));
      float grain=snNoise(terrainXY*210.);
      float altitude=smoothstep(snowLine-130.,snowLine+240.,snowPosition.y*1000./snowScale+(patches-.5)*380.);
      float slope=smoothstep(.40,.91,realNormal.y);
      float rock=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      float exposure=mix(.48,1.,slope)*mix(.75,1.,smoothstep(.06,.55,rock));
      float cover=altitude*smoothstep(1.-snowCoverage-.10,1.-snowCoverage+.15,patches*exposure);
      cover*=mix(.78,.97,grain)*smoothstep(.12,.4,realNormal.y);
      vec3 snowColor=mix(vec3(.68,.75,.82),vec3(.92,.94,.96),.45+.55*grain);
      diffuseColor.rgb=mix(diffuseColor.rgb,snowColor,cover);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.94,cover);');
  };
  material.customProgramCacheKey=()=> 'alpine-snow-v6';
}
