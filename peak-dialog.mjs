// The dialog remains usable even when the WebGL renderer is unavailable.
export function initPeakDialog(doc = document) {
  const dialog = doc.querySelector('#peakDialog');
  const form = doc.querySelector('#peakForm');
  const nameInput = doc.querySelector('#newName');
  let startedOnBackdrop = false;
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  doc.querySelector('#addPeakButton').addEventListener('click', () => dialog.showModal());
  doc.querySelector('#cancelPeakButton').addEventListener('click', () => dialog.close('cancel'));
  dialog.addEventListener('pointerdown', event => { startedOnBackdrop = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => {
    if (startedOnBackdrop && event.target === dialog && outside(event)) dialog.close('cancel');
    startedOnBackdrop = false;
  });
  dialog.addEventListener('close', () => { form.reset(); nameInput.setCustomValidity(''); startedOnBackdrop = false; });
  nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Indique un nom de sommet.');
    if (!form.reportValidity()) return;
    const detail = {
      name: nameInput.value.trim(),
      elevation: Number(doc.querySelector('#newElevation').value),
      lat: Number(doc.querySelector('#newLat').value),
      lon: Number(doc.querySelector('#newLon').value)
    };
    doc.dispatchEvent(new doc.defaultView.CustomEvent('mountain:create', { detail }));
    dialog.close('created');
  });
}

if (typeof document !== 'undefined') initPeakDialog();
