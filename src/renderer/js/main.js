import './state.js';
import './profiles.js'; 
import './timers.js'; 
import './dark-mode.js';

const { ipcRenderer } = require('electron');

ipcRenderer.on('update_available', () => {
  console.log('Update available. Downloading...');
});

ipcRenderer.on('update_downloaded', () => {
  console.log('Update downloaded. Restart to install.');
  // Notify the user and restart the app
  if (confirm('A new update is ready. Restart now?')) {
    ipcRenderer.send('restart_app');
  }
});