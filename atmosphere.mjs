import * as THREE from 'three';
export const CLOUD_TYPES=['cumulus','stratus','cirrus','cumulonimbus'];
export function cloudVolume(type,detail,seed,size){
  const family=Math.max(0,CLOUD_TYPES.indexOf(type));
  const scale=type==='cumulonimbus'?[5.2,3.8,3.0]:type==='stratus'?[2.8,.36,1.6]:type==='cirrus'?[3.2,.2,1.1]:[1.8,1.1,1.35];
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.BackSide,
    uniforms:{storm:{value:type==='cumulonimbus'?1:0},cloudType:{value:family},cloudScale:{value:new THREE.Vector3(...scale).multiplyScalar(size)},eye:{value:new THREE.Vector3()},lightDir:{value:new THREE.Vector3(.5,1,.4)},opacity:{value:.7},seed:{value:((seed%4093)+4093)%4093},steps:{value:[0,32,56,96][detail]||56}},
    vertexShader:`varying vec3 localPos;void main(){localPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float;
    varying vec3 localPos;uniform vec3 eye,lightDir,cloudScale;uniform float opacity,seed,storm;uniform int steps,cloudType;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+seed)*43758.5453);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float lobe(vec3 p,vec3 center,vec3 radius){return 1.-smoothstep(.74,1.,length((p-center)/radius));}
    float cloudShape(vec3 p){
      // The bottom and top are independent height fields, not a spherical fade.
      // A seed also changes the wind shear, so neighbouring volumes differ.
      float edge=1.-smoothstep(.45,.499,max(abs(p.x),max(abs(p.y),abs(p.z))));
      // Coherent displacement breaks the geometric ellipsoid outlines into
      // irregular convective edges; the outer box fade remains unwarped.
      float billows=noise(p*vec3(18.,15.,18.)+vec3(seed*.013,7.2,13.1))-.5;
      p+=normalize(p+vec3(.13,.11,.07))*billows*.17;
      float wind=sin(seed*.73),angle=seed*.17;
      p.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xz;
      p.x+=wind*p.y*.12;
      if(edge<=0.)return 0.;
      float form=0.;
      if(cloudType==1){
        // Broken sheets with shallow ripples rather than flattened cotton balls.
        float breakup=noise(vec3(p.x*6.,p.z*7.,3.7));
        float footprint=length(p.xz/vec2(.49,.43));
        float layer=exp(-pow((p.y+.025+sin(p.x*6.+wind)*.035)/.17,2.));
        form=layer*(1.-smoothstep(.64,1.05,footprint+(breakup-.5)*.34))*smoothstep(.20,.58,breakup);
      }else if(cloudType==2){
        // Wind-aligned filaments have long correlations along x, short across z.
        float curve=noise(vec3(p.x*4.,1.3,8.1))-.5;
        float fibres=noise(vec3(p.x*2.1,p.y*2.,(p.z+curve*.15)*25.));
        float sheet=exp(-pow((p.y-sin(p.x*5.+wind)*.045)/.14,2.));
        form=sheet*smoothstep(.43,.74,fibres)*(1.-smoothstep(.22,.49,abs(p.x)))*(1.-smoothstep(.29,.48,abs(p.z)));
      }else if(cloudType==3){
        // Several offset convective lobes rise into a thinner, wider anvil.
        // Separate centres and radii avoid the old straight-sided chimney.
        float variation=sin(seed*1.7)*.045;
        vec3 q=p;q.x-=wind*(p.y+.25)*.14;
        float lower=lobe(q,vec3(-.04,-.29,.02),vec3(.26,.17,.25));
        float left=lobe(q,vec3(-.10,-.13,-.025),vec3(.235,.23,.22));
        float middle=lobe(q,vec3(.07,.025,.055),vec3(.235,.25+variation,.24));
        float upper=lobe(q,vec3(-.045,.18,-.015),vec3(.28,.205,.25));
        float shoulder=lobe(q,vec3(.19,.165,.035),vec3(.19,.17,.19));
        float tower=max(max(lower,left),max(middle,max(upper,shoulder)));
        float billow=noise(vec3(p.x*12.,p.z*11.,4.7));
        vec3 cap=p;cap.x-=wind*.055;cap.y+=(billow-.5)*.055;
        float anvil=lobe(cap,vec3(0.,.285,0.),vec3(.49,.092,.405));
        form=max(tower,anvil);
      }else{
        // Joined rising lobes above a common flat condensation level.
        float variation=sin(seed*2.3)*.045;
        float body=lobe(p,vec3(0.,-.175,0.),vec3(.45,.18,.365));
        float west=lobe(p,vec3(-.235,-.005,-.035),vec3(.20,.235+variation,.225));
        float centre=lobe(p,vec3(-.015,.07,.015),vec3(.245,.285,.245));
        float east=lobe(p,vec3(.235,-.025,-.015),vec3(.19,.215-variation,.205));
        float front=lobe(p,vec3(.075,.025,.205),vec3(.19,.20,.175));
        float base=-.30+.012*sin(seed*2.9);
        form=max(body,max(west,max(centre,max(east,front))))*smoothstep(base,base+.025,p.y);
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
      return body*(cloudType==1?2.7:cloudType==3?3.8:3.6);
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
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.scale.set(...scale.map(v=>v*size));
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
