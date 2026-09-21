import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bookNarrationDuration,sampleBookNarration,BOOK_OPEN_SECONDS,BOOK_CLOSE_SECONDS,PAGE_TURN_SECONDS} from '../travel-book.mjs';
import {appHarness} from './harness.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const click=(a,id)=>a.window.document.getElementById(id).click();
const field=(a,id,value)=>{const e=a.window.document.getElementById(id);if(typeof value==='boolean')e.checked=value;else e.value=value;e.dispatchEvent(new a.window.Event('change'));};
function setup(overrides){const a=appHarness(undefined,overrides),b=a.syntheticBlock();a.refreshStatsBillboards();a.syncNotebookEditor();return {a,b};}

test('all four cover options preserve full reading holds, curved turns, and independent end state',()=>{
 for(const openBook of [false,true])for(const closeBook of [false,true]){
  const options={openBook,closeBook},duration=bookNarrationDuration(3,7,options),start=2.4+(openBook?BOOK_OPEN_SECONDS:0);
  assert.equal(sampleBookNarration(3,0,7,options).openness,openBook?0:1);
  if(openBook)near(sampleBookNarration(3,2.4+BOOK_OPEN_SECONDS/2,7,options).openness,.5);
  near(sampleBookNarration(3,start+7+PAGE_TURN_SECONDS/2,7,options).turn,.5);
  const last=sampleBookNarration(3,duration,7,options);assert.equal(last.index,2);assert.equal(last.turn,0);near(last.openness,closeBook?0:1);
  if(closeBook)near(sampleBookNarration(3,duration-BOOK_CLOSE_SECONDS/2,7,options).openness,.5);
 }
});

test('cover closes above the paper with its image facing up, while the page curl stays available',()=>{
 const {a,b}=setup();click(a,'bookAdd');const book=b.group.userData.statsCard,cover=book.getObjectByName('book-cover-art');assert.ok(cover);
 book.userData.setOpenness(0);book.updateWorldMatrix(true,true);const center=cover.localToWorld(new THREE.Vector3(-book.userData.width/4,.005,0));const local=book.worldToLocal(center);assert.ok(local.x>0);assert.ok(local.y>.5);
 const normal=new THREE.Vector3(0,-1,0).transformDirection(cover.matrixWorld);assert.ok(normal.y>.9,'cover artwork visible from above');
 book.userData.setOpenness(1);book.userData.setState(0,.5);assert.ok(book.children.some(c=>c.isMesh&&c.visible&&c.geometry.attributes.position.count>1000));a.dom.window.close();
});

test('editor persists title, chapter, and independent opening/closing; a closed book opens for preview',()=>{
 const {a,b}=setup();field(a,'bookOpenAtStart',true);field(a,'bookCloseAtEnd',false);field(a,'bookCoverTitle','Traversée des Alpes');field(a,'bookCoverSubtitle','Août — chemins partagés');field(a,'bookCoverColor','#4f3b32');
 assert.equal(b.group.userData.statsCard.userData.openness,0);click(a,'bookOpenPreview');a.advanceBookTurns(BOOK_OPEN_SECONDS/2);near(b.group.userData.statsCard.userData.openness,.5);a.advanceBookTurns(BOOK_OPEN_SECONDS/2);near(b.group.userData.statsCard.userData.openness,1);
 click(a,'bookAdd');field(a,'bookChapter','Chapitre 1 — Le départ');click(a,'bookSave');const saved=JSON.parse(a.window.localStorage.getItem('mountainAnimatorProjectV3'));assert.equal(saved.blockSettings.chavalard.bookCoverTitle,'Traversée des Alpes');assert.equal(saved.blockSettings.chavalard.bookPages[0].chapter,'Chapitre 1 — Le départ');assert.equal(saved.blockSettings.chavalard.bookCloseAtEnd,false);
 a.startCinema([{type:'book',from:'chavalard',hold:4}]);a.applyCinemaTime(0);near(b.group.userData.statsCard.userData.openness,0);a.applyCinemaTime(a.cinema.timeline.duration);near(b.group.userData.statsCard.userData.openness,1);a.dom.window.close();
});

test('offline narration includes both covers and restores an interrupted manual opening',async()=>{
 let a;const frames=[];class ExportStub{async start({renderFrame,duration}){for(const time of [0,3.7,6,duration]){await renderFrame({index:Math.round(time*30),time,delta:1/30});frames.push(a.blocks[0].group.userData.statsCard.userData.openness);}return null;}cancel(){}}
 const result=setup({VideoExport:ExportStub,supportedVideoTypes:()=>[{ext:'webm',label:'WebM'}]});a=result.a;const b=result.b;
 field(a,'bookOpenAtStart',true);field(a,'bookCloseAtEnd',true);click(a,'bookAddShot');click(a,'bookOpenPreview');a.advanceBookTurns(.7);const before=a.saveExportView();a.window.document.getElementById('loadingPanel').hidden=true;field(a,'exportMotion','sequence');await a.runVideoExport();
 near(frames[0],0);near(frames[1],.5);near(frames[2],1);near(frames.at(-1),0);near(b.group.userData.statsCard.userData.openness,before.books[0].openness);near(b.group.userData.statsCard.userData.manualCover.elapsed,.7);a.dom.window.close();
});
