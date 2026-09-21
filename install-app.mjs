let installPrompt;
const button=document.getElementById('installApp'),info=document.getElementById('installStatus');
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;info.textContent='Installation disponible sur cet appareil.';});
button.addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();const result=await installPrompt.userChoice;installPrompt=null;info.textContent=result.outcome==='accepted'?'Application installée.':'Installation annulée.';}else info.textContent='Dans Chrome ou Edge : menu ⋮ → Installer Mountain Animator. Sur iPhone : Partager → Sur l’écran d’accueil. Le site reste utilisable sans installation.';});
window.addEventListener('appinstalled',()=>{button.hidden=true;info.textContent='Application installée.';});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).catch(()=>{info.textContent='Installation possible ; cache hors ligne indisponible dans ce navigateur.';});
