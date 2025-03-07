import './state.js';
import './profiles.js'; 
import './timers.js'; 
import './dark-mode.js';

window.electron.invoke('get-app-version').then(version => {
  console.log('App version:', version);
});