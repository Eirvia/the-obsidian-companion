import './state.js';
import './profiles.js'; 
import './timers.js'; 
import './dark-mode.js';

// Use the exposed electron methods
window.electron.onUpdateAvailable(() => {
  console.log('Update available. Downloading...');
});

window.electron.onUpdateDownloaded(() => {
  console.log('Update downloaded. Restart to install.');
  if (confirm('A new update is ready. Restart now?')) {
    window.electron.restartApp();
  }
});