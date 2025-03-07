import { app, BrowserWindow, ipcMain } from 'electron';
import pkg from 'electron-updater';
import path from 'path';
import { fileURLToPath } from 'url';

const { autoUpdater } = pkg;
const { default: sqlite3 } = await import('sqlite3');
const { default: log } = await import('electron-log');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the user's app data directory
const userDataPath = app.getPath('userData');

// Define the path to your SQLite database
const dbPath = path.join(userDataPath, 'profiles.db');

// Create or connect to the database
const db = new sqlite3.Database(dbPath);

// Configure logging
log.transports.file.level = 'debug';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT,
      created_date TEXT NOT NULL,
      last_accessed TEXT,
      profile_order INTEGER DEFAULT 0
    )
  `);

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES profiles(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    sub_category TEXT,
    time TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(profile_id) REFERENCES profiles(id),
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);
});

db.run(`
  ALTER TABLE profiles ADD COLUMN image TEXT
`, (err) => {
  if (err) {
    console.log('Column "image" already exists or could not be added.');
  } else {
    console.log('Column "image" added successfully.');
  }
});

db.run(`
  ALTER TABLE profiles ADD COLUMN profile_order INTEGER DEFAULT 0
`, (err) => {
  if (err) {
    console.log('Column "profile_order" already exists or could not be added.');
  } else {
    console.log('Column "profile_order" added successfully.');
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload.bundle.js'),
      // Add these lines:
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
      // Specify the preload script as an ES module:
      worldSafeExecuteJavaScript: true,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Debug network requests
  const session = mainWindow.webContents.session;
  session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    log.debug('Network Request:', details.url);
    callback({ cancel: false });
  });

  // Setup update events
  function sendStatusToWindow(text) {
    log.info(text);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-message', text);
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available');
    // console.log('Update available:', info);
  
    // Explicitly trigger download
    autoUpdater.downloadUpdate()
      .then(() => {
        console.log('Download started');
      })
      .catch((err) => {
        console.error('Download error:', err);
      });
    });

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('Update not available');
    // sendStatusToWindow('Update not available: ' + JSON.stringify(info));
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow('Error in auto-updater');
    // sendStatusToWindow('Error in auto-updater: ' + err.toString());
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = 'Download speed: ' + progressObj.bytesPerSecond;
    logMessage = logMessage + ' - Downloaded ' + progressObj.percent + '%';
    logMessage = logMessage + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
    sendStatusToWindow(logMessage);
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('Update downloaded; please click Restart to Update!');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_downloaded', info);

      log.info('Update downloaded', info);
      log.info('Actual downloaded file path:', info.downloadedFile);
    }
  });

  // Check for updates after window is ready
  mainWindow.on('ready-to-show', () => {
    // Add delay to ensure app is fully loaded
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        log.error('Error checking for updates:', err);
      });
    }, 2000);
  });
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.on('force-update-check', () => {
  log.info('Manual update check triggered');
  autoUpdater.checkForUpdates().catch(err => {
    log.error('Error in manual update check:', err);
  });
});

app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('fetch-profiles', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM profiles ORDER BY profile_order ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle('create-profile', async (event, profile) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO profiles (name, image, created_date, last_accessed) VALUES (?, ?, ?, ?)',
      [profile.name, profile.image, profile.created_date, profile.last_accessed],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
});

ipcMain.handle('update-profile-order', async (event, profiles) => {
  return new Promise((resolve, reject) => {
    const updatePromises = profiles.map((profile) => {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE profiles SET profile_order = ? WHERE name = ?',
          [profile.order, profile.name],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    Promise.all(updatePromises)
      .then(() => resolve())
      .catch((err) => reject(err));
  });
});

// Add to existing ipcMain handlers
ipcMain.handle('create-category', async (event, { profileId, name }) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO categories (profile_id, name) VALUES (?, ?)',
      [profileId, name],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
});

ipcMain.handle('fetch-categories', async (event, profileId) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM categories WHERE profile_id = ?',
      [profileId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
});

ipcMain.handle('create-timer', async (event, timerData) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO timers 
      (profile_id, category_id, sub_category, time) 
      VALUES (?, ?, ?, ?)`,
      [timerData.profileId, timerData.categoryId, timerData.subCategory, timerData.time],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
});

ipcMain.handle('fetch-timers', async (event, profileId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT timers.*, categories.name as category_name 
      FROM timers
      JOIN categories ON timers.category_id = categories.id
      WHERE timers.profile_id = ?`,
      [profileId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
});

ipcMain.handle('delete-timer', async (event, timerId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM timers WHERE id = ?', [timerId], function (err) {
      if (err)reject(err);
      else resolve();
    });
  });
});