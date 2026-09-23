import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {planDecor,createSceneDecor,cleanDecorSettings,DECOR_PRESETS} from '../scene-decor.mjs';
import {appHarness} from './harness.mjs';
import {paintGround} from '../studio-art.mjs';
const mountains=[{x:-6.575,z:0,radius:6},{x:6.575,z:0,radius:6}];
const books=[{minX:-9.4,maxX:-3.8,minZ:6.5,maxZ:10.5},{minX:3.8,maxX:9.4,minZ:6.5,maxZ:10.5}];

test('dense decorations stay clear of mountains, books and each other, within a bounded budget',()=>{
  const options={...DECOR_PRESETS.forest,decorDensity:100,decorScale:2,decorSpread:2};
  const items=planDecor(options,mountains,books);assert.ok(items.length>100);assert.ok(items.length<=1466);
  for(let i=0;i<items.length;i++){
    const p=items[i];for(const m of mountains)assert.ok(Math.hypot(p.x-m.x,p.z-m.z)>=m.radius+p.radius+.18);
    for(const b of books)assert.ok(Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ))>=p.radius+.35);
    for(const q of items.slice(0,i))assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=p.radius+q.radius+.0249);
    if(p.type==='tree')assert.ok(p.z<=.9);
  }
  assert.deepEqual(items,planDecor(options,mountains,books));assert.notDeepEqual(items,planDecor({...options,decorSeed:2},mountains,books));
  assert.deepEqual(planDecor({...options,decorEnabled:false},mountains,books),[]);
  assert.deepEqual(planDecor({...options,decorDensity:0},mountains,books),[]);
});

test('actual instanced geometry fits reserved footprints, sits on the floor and disposes GPU resources',()=>{
  const items=planDecor({...DECOR_PRESETS.forest,decorDensity:20},mountains,books),group=createSceneDecor(items),matrix=new THREE.Matrix4(),p=new THREE.Vector3();
  assert.ok(group.children.length<=9);assert.ok(group.children.every(m=>m.isInstancedMesh&&m.castShadow&&m.receiveShadow));
  let released=0;const expected=group.children.length*3;
  for(const mesh of group.children){
    for(const obj of [mesh,mesh.geometry,mesh.material])obj.addEventListener('dispose',()=>released++);
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);const center=new THREE.Vector3().setFromMatrixPosition(matrix),item=items.find(i=>Math.hypot(i.x-center.x,i.z-center.z)<1e-4);assert.ok(item);
      const positions=mesh.geometry.attributes.position;let minY=Infinity;
      for(let v=0;v<positions.count;v++){
        p.fromBufferAttribute(positions,v).applyMatrix4(matrix);assert.ok(Number.isFinite(p.x+p.y+p.z));
        assert.ok(Math.hypot(p.x-center.x,p.z-center.z)<=item.radius+.002,`${mesh.name} outside footprint`);minY=Math.min(minY,p.y);
      }
      assert.ok(minY>=-.456,'no buried geometry');if(!mesh.name.includes('foliage'))assert.ok(minY<-.44,'objects meet the ground');
    }
  }
  group.userData.dispose();assert.equal(released,expected);assert.equal(group.children.length,0);
});

test('presets, individual toggles and random layout survive project restore; old scenes stay untouched',()=>{
  const app=appHarness(),doc=app.window.document;app.syntheticBlock();app.refreshStatsBillboards();
  const change=(id,value)=>{const el=doc.getElementById(id);el.value=value;el.dispatchEvent(new app.window.Event('change'));};
  change('decorPreset','forest');let root=app.scene.getObjectByName('natural-ground-decor');assert.ok(root?.children.length);
  assert.equal(app.globalSettings.groundTexture,'earth');assert.ok(app.floor.material.bumpMap);assert.equal(app.floor.material.clearcoat,0);
  const box=new THREE.Box3().setFromObject(app.blocks[0].group.userData.statsCard);
  for(const item of root.userData.items)assert.ok(Math.hypot(Math.max(box.min.x-item.x,0,item.x-box.max.x),Math.max(box.min.z-item.z,0,item.z-box.max.z))>item.radius);
  doc.getElementById('randomizeDecor').click();const before=app.scene.getObjectByName('natural-ground-decor').userData.items;
  const saved=app.projectSnapshot(),restored=appHarness(JSON.parse(JSON.stringify(saved)));restored.syntheticBlock();restored.refreshStatsBillboards();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.scene.getObjectByName('natural-ground-decor').userData.items)),JSON.parse(JSON.stringify(before)));
  const toggle=doc.getElementById('decorTrees');toggle.checked=false;toggle.dispatchEvent(new app.window.Event('change'));assert.ok(app.scene.getObjectByName('natural-ground-decor').userData.items.every(p=>p.type!=='tree'));
  change('groundTexture','marble');assert.equal(app.floor.material.bumpMap,null);assert.equal(app.floor.material.clearcoat,.8);
  const enabled=doc.getElementById('decorEnabled');enabled.checked=false;enabled.dispatchEvent(new app.window.Event('change'));assert.equal(app.scene.getObjectByName('natural-ground-decor'),undefined);
  const old=appHarness({globalSettings:{groundTexture:'wood'}});assert.equal(old.globalSettings.groundTexture,'wood');assert.equal(old.globalSettings.decorEnabled,false);
  for(const a of [app,restored,old])a.dom.window.close();
});

test('natural surface pixels vary and settings are bounded before allocation',()=>{
  assert.equal(cleanDecorSettings({decorDensity:1e20}).decorDensity,100);assert.equal(cleanDecorSettings({decorScale:NaN}).decorScale,1);
  const images=[];
  for(const kind of ['earth','meadow','gravel']){
    let pixels;const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image.data;}};
    paintGround({width:96,height:96,getContext:()=>ctx},kind);assert.ok(new Set(pixels.filter((_,i)=>i%4===0)).size>25);assert.ok(pixels.every((v,i)=>i%4!==3||v===255));images.push(pixels);
  }
  assert.notDeepEqual(images[0],images[1]);assert.notDeepEqual(images[1],images[2]);
});
