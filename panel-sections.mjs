// Native details keep each section keyboard-accessible and closed on page load.
// This module is independent of the 3D renderer.
export function bindPanelSections(root=document){
  const panel=root.querySelector('#controlPanel');
  if(!panel || panel.dataset.sectionsBound)return;
  panel.dataset.sectionsBound='true';
  const setPanel=open=>{root.body.classList.toggle('panel-open',open);root.querySelector('#menuButton').setAttribute('aria-expanded',String(open));};
  root.querySelector('#menuButton').addEventListener('click',()=>setPanel(!root.body.classList.contains('panel-open')));
  root.querySelector('#closePanelButton').addEventListener('click',()=>setPanel(false));
  root.querySelector('#panelScrim').addEventListener('click',()=>setPanel(false));
  const setAll=open=>panel.querySelectorAll('details').forEach(section=>{section.open=open;});
  root.querySelector('#expandSections').addEventListener('click',()=>setAll(true));
  root.querySelector('#collapseSections').addEventListener('click',()=>setAll(false));
}
if(typeof document!=='undefined')bindPanelSections();
