import { getCurrentProfileId } from './state.js';

const timerInput = document.getElementById('timerInput');

// Store active timers
let activeTimers = JSON.parse(localStorage.getItem('activeTimers')) || {};
let globalTimerInterval = null;

// Start the global interval when the app loads
startGlobalInterval();

// Add input event listener
timerInput.addEventListener('input', function (e) {
  let value = e.target.value.replace(/\D/g, ''); // Remove non-digits

  // Convert input to time format
  if (value.length > 0) {
    const totalSeconds = formatInputToSeconds(value);
    e.target.value = formatTime(totalSeconds);
  }
});

// Function to convert input to seconds
function formatInputToSeconds(value) {
  // Handle input like "3000" for 30:00
  if (value.length <= 4) {
    // Treat as minutes and seconds
    const minutes = parseInt(value.slice(0, -2)) || 0;
    const seconds = parseInt(value.slice(-2)) || 0;
    return minutes * 60 + seconds;
  } else {
    // Treat as hours, minutes, seconds
    const hours = parseInt(value.slice(0, value.length - 4)) || 0;
    const minutes = parseInt(value.slice(value.length - 4, value.length - 2)) || 0;
    const seconds = parseInt(value.slice(-2)) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
}

// Function to format seconds into HH:MM:SS
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Function to parse time input (optional, for future use)
function parseTimeInput(timeStr) {
  if (timeStr.includes(':')) {
    // Handle traditional HH:MM:SS format
    const parts = timeStr.split(':');
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return seconds;
  } else {
    // Handle new numeric format
    return formatInputToSeconds(timeStr);
  }
}

window.addTimer = async () => {
  const categorySelect = document.getElementById('categorySelect');
  const newCategoryInput = document.getElementById('newCategory');
  const subCategoryInput = document.getElementById('subCategory');
  const timerInput = document.getElementById('timerInput');

  const categoryId = categorySelect.value;
  const newCategory = newCategoryInput.value.trim();
  const subCategory = subCategoryInput.value.trim();
  const timerValue = timerInput.value.trim();

  // Validate timer input
  if (!timerValue) {
    alert('Please enter a valid time (e.g., 3000 for 30 minutes).');
    return;
  }

  let finalCategoryId = categoryId;

  // Check if a new category is being added
  if (!categoryId && newCategory) {
    // Check if the category already exists
    const categories = await window.electron.invoke('fetch-categories', getCurrentProfileId());
    const existingCategory = categories.find(cat => cat.name.toLowerCase() === newCategory.toLowerCase());

    if (existingCategory) {
      alert('Category already exists!');
      return;
    }

    // Add the new category
    finalCategoryId = await window.electron.invoke('create-category', {
      profileId: getCurrentProfileId(),
      name: newCategory
    });

    // Refresh the category dropdown
    const updatedCategories = await window.electron.invoke('fetch-categories', getCurrentProfileId());
    categorySelect.innerHTML = `
      <option value="">Select Category</option>
      ${updatedCategories.map(cat => `
        <option value="${cat.id}">${cat.name}</option>
      `).join('')}
    `;
  }

  // Save the timer
  await window.electron.invoke('create-timer', {
    profileId: getCurrentProfileId(),
    categoryId: finalCategoryId,
    subCategory: subCategory,
    time: timerValue
  });

  // Clear all input fields
  categorySelect.value = '';
  newCategoryInput.value = '';
  subCategoryInput.value = '';
  timerInput.value = '';

  // Refresh the timers display
  const timers = await window.electron.invoke('fetch-timers', getCurrentProfileId());
  displayTimers(timers);
};

export function displayTimers(timers) {
  const grouped = timers.reduce((acc, timer) => {
    acc[timer.category_name] = acc[timer.category_name] || [];
    acc[timer.category_name].push(timer);
    return acc;
  }, {});

  const dynamicContent = document.getElementById('dynamic-content');
  dynamicContent.innerHTML = `
    <div class="timers-grid">
      ${Object.entries(grouped).map(([category, timers]) => `
        <div class="category-group">
          <h3>${category}</h3>
          <div class="timers-row">
            ${timers.map(timer => {
              const timerId = `${timer.category_name}-${timer.sub_category}`;
              const storedTimer = activeTimers[timerId];
              const displayTime = storedTimer ? formatTime(storedTimer.remaining) : timer.time;
              const isTimerEnded = storedTimer && storedTimer.remaining <= 0;

              return `
                <div class="timer-card ${isTimerEnded ? 'timer-ended' : ''}" data-category="${timer.category_name}" data-subcategory="${timer.sub_category}">
                  <span class="subcategory">${timer.sub_category || 'No sub-category'}</span>
                  <div class="timer-content">
                    <span class="timer-display">${displayTime}</span>
                    <div class="timer-controls">
                      <button onclick="startTimer('${timer.category_name}', '${timer.sub_category}', '${timer.time}')">Start</button>
                      <button onclick="stopTimer('${timer.category_name}', '${timer.sub_category}')">Stop</button>
                      <button onclick="resetTimer('${timer.category_name}', '${timer.sub_category}', '${timer.time}')">Reset</button>
                      <button class="delete-btn" onclick="deleteTimer('${timer.category_name}', '${timer.sub_category}')">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

document.addEventListener('click', async (e) => {
  const timerCard = e.target.closest('.timer-card');
  if (!timerCard) return;

  const timerId = timerCard.dataset.timerId;
  
  if (e.target.classList.contains('delete-btn')) {
    await window.electron.invoke('delete-timer', timerId);
    const timers = await window.electron.invoke('fetch-timers', getCurrentProfileId());
    displayTimers(timers);
  }
});

// Start the global interval
function startGlobalInterval() {
  if (!globalTimerInterval) {
    globalTimerInterval = setInterval(() => {
      updateAllTimers();
    }, 1000);
  }
}

// Update all timers every second
function updateAllTimers() {
  Object.entries(activeTimers).forEach(([timerId, timer]) => {
    if (timer.isRunning) {
      const now = Date.now();
      const elapsed = Math.floor((now - timer.startTime) / 1000);
      timer.remaining = timer.initialDuration - elapsed;

      // Stop the timer if it reaches 0
      if (timer.remaining <= 0) {
        timer.remaining = 0;
        timer.isRunning = false;

        // Add the "timer-ended" class
        const timerCard = document.querySelector(
          `.timer-card[data-category="${timer.category}"][data-subcategory="${timer.subCategory}"]`
        );
        if (timerCard) {
          timerCard.classList.add('timer-ended');
        }

        // Re-enable the Start button
        updateTimerButtons(timer.category, timer.subCategory, false); // isRunning = false
      }

      // Update the display
      const timerDisplay = document.querySelector(
        `.timer-card[data-category="${timer.category}"][data-subcategory="${timer.subCategory}"] .timer-display`
      );
      if (timerDisplay) {
        timerDisplay.textContent = formatTime(timer.remaining);
      }

      // Save to localStorage
      localStorage.setItem('activeTimers', JSON.stringify(activeTimers));
    }
  });
}

// Function to clear all intervals
export function clearAllIntervals() {
  Object.values(activeTimers).forEach(timerData => {
    if (timerData.interval) {
      clearInterval(timerData.interval);
      timerData.interval = null;
    }
  });
}

window.startTimer = (category, subCategory, initialTime) => {
  const timerCard = document.querySelector(
    `.timer-card[data-category="${category}"][data-subcategory="${subCategory}"]`
  );
  const startButton = timerCard?.querySelector('button:nth-child(1)');

  // Prevent action if the button is disabled
  if (startButton?.disabled) {
    console.log('[A] Start button is disabled. Ignoring click.');
    return;
  }

  const timerId = `${category}-${subCategory}`;
  const [hours, minutes, seconds] = initialTime.split(':').map(Number);
  const initialDuration = hours * 3600 + minutes * 60 + seconds;

  if (!activeTimers[timerId]) {
    activeTimers[timerId] = {
      category,
      subCategory,
      initialDuration,
      remaining: initialDuration,
      isRunning: false,
      startTime: 0,
    };
  }

  // If the timer has reached 0, reset it to the initial time
  if (activeTimers[timerId].remaining <= 0) {
    activeTimers[timerId].remaining = initialDuration;
  }

  // Start/resume the timer
  if (!activeTimers[timerId].isRunning) {
    activeTimers[timerId].isRunning = true;
    activeTimers[timerId].startTime = Date.now() - (initialDuration - activeTimers[timerId].remaining) * 1000;
  }

  // Update the DOM
  if (timerCard) {
    timerCard.classList.remove('timer-ended'); // Remove the "timer-ended" class
    const timerDisplay = timerCard.querySelector('.timer-display');
    if (timerDisplay) {
      timerDisplay.textContent = formatTime(activeTimers[timerId].remaining);
    }
  }

  // Update button states
  updateTimerButtons(category, subCategory, true); // isRunning = true

  localStorage.setItem('activeTimers', JSON.stringify(activeTimers));
};

window.stopTimer = (category, subCategory) => {
  const timerCard = document.querySelector(
    `.timer-card[data-category="${category}"][data-subcategory="${subCategory}"]`
  );
  const stopButton = timerCard?.querySelector('button:nth-child(2)');

  // Prevent action if the button is disabled
  if (stopButton?.disabled) {
    console.log('[B] Stop button is disabled. Ignoring click.');
    return;
  }

  const timerId = `${category}-${subCategory}`;
  if (activeTimers[timerId]) {
    activeTimers[timerId].isRunning = false; // Stop the timer

    // Update button states
    updateTimerButtons(category, subCategory, false); // isRunning = false

    localStorage.setItem('activeTimers', JSON.stringify(activeTimers));
  }
};

window.resetTimer = (category, subCategory, initialTime) => {
  const timerId = `${category}-${subCategory}`;
  const [hours, minutes, seconds] = initialTime.split(':').map(Number);
  const initialDuration = hours * 3600 + minutes * 60 + seconds;

  if (activeTimers[timerId]) {
    activeTimers[timerId].remaining = initialDuration;
    activeTimers[timerId].isRunning = false;

    // Update the DOM
    const timerCard = document.querySelector(
      `.timer-card[data-category="${category}"][data-subcategory="${subCategory}"]`
    );
    if (timerCard) {
      timerCard.classList.remove('timer-ended'); // Remove the "timer-ended" class
      const timerDisplay = timerCard.querySelector('.timer-display');
      if (timerDisplay) {
        timerDisplay.textContent = formatTime(initialDuration);
      }
    }

    // Update button states
    updateTimerButtons(category, subCategory, false); // isRunning = false

    localStorage.setItem('activeTimers', JSON.stringify(activeTimers));
  }
};

// Update Timer Buttons
function updateTimerButtons(category, subCategory, isRunning) {
  const timerCard = document.querySelector(
    `.timer-card[data-category="${category}"][data-subcategory="${subCategory}"]`
  );

  if (!timerCard) {
    console.error(`Timer card not found for ${category}-${subCategory}`);
    return;
  }

  const startButton = timerCard.querySelector('button:nth-child(1)');
  const stopButton = timerCard.querySelector('button:nth-child(2)');

  if (!startButton || !stopButton) {
    console.error('Start or Stop button not found in timer card');
    return;
  }

  // Enable/disable buttons based on the isRunning state
  startButton.disabled = isRunning; // Disable Start if running
  stopButton.disabled = !isRunning; // Disable Stop if not running

  // console.log(`Buttons updated for ${category}-${subCategory}:`, {
  //   startButton: startButton.disabled ? 'Disabled' : 'Enabled',
  //   stopButton: stopButton.disabled ? 'Disabled' : 'Enabled',
  // });
}

// Delete Timer
window.deleteTimer = async (category, subCategory) => {
  // console.log('Deleting timer:', category, subCategory);

  // Fetch timers for the current profile
  const timers = await window.electron.invoke('fetch-timers', getCurrentProfileId());

  // Find the timer to delete
  const timerToDelete = timers.find(timer => 
    timer.category_name === category && timer.sub_category === subCategory
  );

  if (timerToDelete) {
    // Delete the timer
    await window.electron.invoke('delete-timer', timerToDelete.id);

    // Remove the timer from activeTimers and clear its interval
    const timerId = `${category}-${subCategory}`;
    if (activeTimers[timerId]) {
      clearInterval(activeTimers[timerId].interval);
      delete activeTimers[timerId];

      // Save activeTimers to localStorage
      localStorage.setItem('activeTimers', JSON.stringify(activeTimers));
    }

    // Fetch updated timers and refresh the display
    const updatedTimers = await window.electron.invoke('fetch-timers', getCurrentProfileId());
    displayTimers(updatedTimers);
  } else {
    console.error('Timer not found:', category, subCategory);
  }
};

window.addEventListener('beforeunload', () => {
  if (globalTimerInterval) {
    clearInterval(globalTimerInterval);
    globalTimerInterval = null;
  }
  
  localStorage.removeItem('activeTimers'); 
});