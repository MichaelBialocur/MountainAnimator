import {startProjectManager} from './project-manager.mjs?v=12';
import './install-app.mjs?v=12';
try{await startProjectManager();await import('./app.js?v=12');}
catch(error){const p=document.getElementById('errorPanel');p.hidden=false;p.textContent=/WebGL|context/i.test(error.message)?'La 3D WebGL est indisponible dans ce navigateur. Tes projets restent accessibles dans le menu.':error.message;document.getElementById('loadingPanel').hidden=true;}
