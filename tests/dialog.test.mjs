import test from 'node:test';
import assert from 'node:assert/strict';
import {initPeakDialog} from '../peak-dialog.mjs';
import {makeDom} from './harness.mjs';

test('Cancel closes an empty/invalid form without submitting or adding a peak',()=>{
  const dom=makeDom(),{document:doc}=dom.window;initPeakDialog(doc);
  const dialog=doc.querySelector('#peakDialog'),cancel=doc.querySelector('#cancelPeakButton');let additions=0;
  doc.addEventListener('mountain:create',()=>additions++);
  assert.equal(cancel.type,'button');doc.querySelector('#addPeakButton').click();assert.ok(dialog.open);
  cancel.click();assert.equal(dialog.open,false);assert.equal(additions,0);dom.window.close();
});

test('Backdrop dismisses, inside clicks and drags from inside do not',()=>{
  const dom=makeDom(),{document:doc,MouseEvent}=dom.window;initPeakDialog(doc);
  const dialog=doc.querySelector('#peakDialog');dialog.getBoundingClientRect=()=>({left:100,right:500,top:100,bottom:500});
  dialog.showModal();
  for(const type of ['pointerdown','click'])dialog.dispatchEvent(new MouseEvent(type,{clientX:200,clientY:200,bubbles:true}));
  assert.ok(dialog.open);
  dialog.dispatchEvent(new MouseEvent('pointerdown',{clientX:200,clientY:200}));dialog.dispatchEvent(new MouseEvent('click',{clientX:20,clientY:20}));assert.ok(dialog.open);
  for(const type of ['pointerdown','click'])dialog.dispatchEvent(new MouseEvent(type,{clientX:20,clientY:20}));
  assert.equal(dialog.open,false);dom.window.close();
});

test('Only a valid form creates a peak, once, via submit (including Enter)',()=>{
  const dom=makeDom(),{document:doc,Event}=dom.window;initPeakDialog(doc);let result;
  doc.addEventListener('mountain:create',event=>result=event.detail);
  doc.querySelector('#peakDialog').showModal();
  const form=doc.querySelector('#peakForm');form.dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(result,undefined);
  for(const [id,value] of Object.entries({newName:'  Haute Cime  ',newElevation:'3257',newLat:'46.16',newLon:'6.93'}))doc.querySelector('#'+id).value=value;
  doc.querySelector('#newName').dispatchEvent(new Event('input'));
  form.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.deepEqual(result,{name:'Haute Cime',elevation:3257,lat:46.16,lon:6.93});
  assert.equal(doc.querySelector('#peakDialog').open,false);assert.equal(doc.querySelector('#newName').value,'');dom.window.close();
});
