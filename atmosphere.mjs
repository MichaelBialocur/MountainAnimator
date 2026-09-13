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
export function addSnow(material,config,exaggeration){
  const uniforms={snowLine:{value:config.snowEnabled?config.snowAltitude:1e7},snowScale:{value:exaggeration}};
  material.userData.snow=uniforms;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 snowPosition;varying float snowSlope;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowPosition=position;snowSlope=normal.y;');
    shader.fragmentShader='varying vec3 snowPosition;varying float snowSlope;uniform float snowLine;uniform float snowScale;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float breakup=sin(snowPosition.x*29.)*sin(snowPosition.z*37.)*30.;
      float cover=smoothstep(snowLine-60.,snowLine+100.,snowPosition.y*1000./snowScale+breakup)*smoothstep(.25,.72,snowSlope);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.91,.95,1.),cover);`);
  };
  material.customProgramCacheKey=()=> 'alpine-snow-v5';
}
