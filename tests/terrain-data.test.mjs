import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTerrarium,sampleNumericTiles,cleanTerrain} from '../terrain-data.mjs';
const encoded=h=>{const v=h+32768;return [Math.floor(v/256),Math.floor(v)%256,Math.round((v%1)*256),255];};
test('numeric interpolation is continuous across RGB carries and tile boundaries',()=>{
 const pixels=new Uint8ClampedArray([...encoded(255.75),...encoded(256.25),...encoded(255.75),...encoded(256.25)]);
 const data=decodeTerrarium(pixels);assert.deepEqual([...data],[255.75,256.25,255.75,256.25]);
 const tiles=new Map([['0,0',new Float32Array([255.75,255.75,255.75,255.75])],['1,0',new Float32Array([256.25,256.25,256.25,256.25])]]);
 assert.equal(sampleNumericTiles(tiles,2,1.5,.5),256);
 assert.equal(decodeTerrarium(new Uint8Array([0,0,0,0]))[0].toString(),'NaN');
});
test('isolated spikes, pits and a missing pixel are repaired without moving a sloping plane',()=>{
 const grid=16,n=17,raw=Float32Array.from({length:n*n},(_,i)=>2200+(i%n)*9+Math.floor(i/n)*4),broken=raw.slice();
 for(const [x,y,delta] of [[5,5,900],[11,11,-900],[3,12,NaN]])broken[y*n+x]+=delta;
 const cleaned=cleanTerrain(broken,grid,40,0);assert.equal(cleaned.repaired,3);
 for(let i=0;i<raw.length;i++)assert.ok(Math.abs(cleaned.heights[i]-raw[i])<10);
 assert.ok(Number.isNaN(broken[12*n+3])); // Raw source is retained, not overwritten.
});
test('small corrupt plateaus are removed but broad mountain shape is preserved',()=>{
 const grid=16,n=17,raw=Float32Array.from({length:n*n},(_,i)=>2800-6*((i%n)-8)**2-6*(Math.floor(i/n)-8)**2),broken=raw.slice();
 for(const [x,y] of [[3,3],[4,3],[3,4],[4,4]])broken[y*n+x]=5000;
 const result=cleanTerrain(broken,grid,40,.35);assert.ok(result.repaired>=4);assert.ok(Math.max(...result.heights)<2810);assert.ok(Math.max(...result.heights)>2780);
 assert.throws(()=>cleanTerrain(new Float32Array(25).fill(NaN),4,100),/manquante/);
});
