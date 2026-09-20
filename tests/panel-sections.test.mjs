import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDom} from './harness.mjs';
import {bindPanelSections} from '../panel-sections.mjs';

test('all menu sections start closed; bulk and individual toggles preserve settings without WebGL',()=>{
  const dom=makeDom(),doc=dom.window.document;
  const sections=[...doc.querySelectorAll('[data-panel-section]')];
  assert.equal(sections.length,8);
  assert.ok(sections.every(section=>section.tagName==='DETAILS'&&!section.open));
  assert.equal(doc.querySelectorAll('#controlPanel details[open]').length,0);
  bindPanelSections(doc);
  const width=doc.querySelector('#gpxWidth');width.value='9';
  doc.querySelector('#gpxSection > summary').click();
  assert.equal(doc.querySelector('#gpxSection').open,true);
  assert.equal(sections.filter(section=>section.open).length,1);
  doc.querySelector('#expandSections').click();
  assert.ok([...doc.querySelectorAll('#controlPanel details')].every(section=>section.open));
  doc.querySelector('#collapseSections').click();
  assert.equal(doc.querySelectorAll('#controlPanel details[open]').length,0);
  assert.equal(width.value,'9');
  assert.equal(doc.querySelector('#gpxLiveStats').checked,true);
  dom.window.close();
});
