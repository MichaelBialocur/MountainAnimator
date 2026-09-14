import * as THREE from 'three';
export const CLOUD_TYPES=['cumulus','stratus','cirrus'];
export function cloudVolume(type,detail,seed,size){
  const scale=type==='stratus'?[2.8,.36,1.6]:type==='cirrus'?[3.2,.2,1.1]:[1.5,.95,1.2];
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.BackSide,
    uniforms:{eye:{value:new THREE.Vector3()},lightDir:{value:new THREE.Vector3(.5,1,.4)},opacity:{value:.7},seed:{value:seed%1000},steps:{value:[0,24,40,64][detail]||40}},
    vertexShader:`varying vec3 localPos;void main(){localPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float;
    varying vec3 localPos;uniform vec3 eye,lightDir;uniform float opacity,seed;uniform int steps;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+seed)*43758.5453);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float density(vec3 p){float edge=1.-smoothstep(.27,.5,length(p));float n=.57*noise(p*7.)+.28*noise(p*16.)+.15*noise(p*35.);return edge*smoothstep(.27,.65,n)*5.;}
    void main(){vec3 rd=normalize(localPos-eye);vec3 inv=1./(rd+vec3(.000001));vec3 a=(-.5-eye)*inv,b=(.5-eye)*inv;vec3 lo=min(a,b),hi=max(a,b);float t=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));if(end<=t)discard;
    float dt=(end-t)/float(steps);vec4 sum=vec4(0.);vec3 light=normalize(lightDir);
    for(int i=0;i<64;i++){if(i>=steps||sum.a>.98)break;vec3 p=eye+rd*(t+(float(i)+.5)*dt);float d=density(p);float shade=exp(-density(p+light*.12)*.7-density(p+light*.25)*.3);vec3 color=mix(vec3(.39,.47,.56),vec3(1.,.97,.91),shade);float alpha=1.-exp(-d*dt*opacity*5.);sum.rgb+=(1.-sum.a)*alpha*color;sum.a+=(1.-sum.a)*alpha;}
    if(sum.a<.003)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.scale.set(...scale.map(v=>v*size));
  mesh.onBeforeRender=(_r,_s,camera)=>{mesh.updateWorldMatrix(true,false);material.uniforms.eye.value.copy(camera.position);mesh.worldToLocal(material.uniforms.eye.value);};
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
