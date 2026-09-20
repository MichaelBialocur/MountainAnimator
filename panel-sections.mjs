// Native details keep each section keyboard-accessible and closed on page load.
// This module is independent of the 3D renderer.
export function bindPanelSections(root=document){
  const panel=root.querySelector('#controlPanel');
  if(!panel || panel.dataset.sectionsBound)return;
  panel.dataset.sectionsBound='true';
  const setAll=open=>panel.querySelectorAll('details').forEach(section=>{section.open=open;});
  root.querySelector('#expandSections').addEventListener('click',()=>setAll(true));
  root.querySelector('#collapseSections').addEventListener('click',()=>setAll(false));
}
if(typeof document!=='undefined')bindPanelSections();
