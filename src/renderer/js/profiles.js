import { displayTimers } from './timers.js';
import { setCurrentProfileId } from './state.js';
import { clearAllIntervals } from './timers.js';

const profileList = document.getElementById('profile-list');
const addProfileButton = document.getElementById('add-profile');
const profileModal = document.getElementById('profile-modal');
const closeModal = document.getElementById('close-modal');
const profileForm = document.getElementById('profile-form');
const addTimerButton = document.getElementById('add-timer-button');
const addTimerModal = document.getElementById('add-timer-modal');
const closeTimerModal = document.getElementById('close-timer-modal');

// Open modal when plus icon is clicked
addProfileButton.addEventListener('click', () => {
  profileModal.style.display = 'flex';
});

// Close modal when close button is clicked
closeModal.addEventListener('click', () => {
  profileModal.style.display = 'none';
});

// Fetch profiles on page load
window.electron.invoke('fetch-profiles').then((profiles) => {
  updateProfileList(profiles);
});

const updateProfileList = (profiles) => {
  profileList.innerHTML = ''; // Clear existing profiles
  profiles.forEach((profile) => {
    const profileCard = document.createElement('div');
    profileCard.classList.add('profile-card');
    profileCard.draggable = true;
    profileCard.innerHTML = `
      <img src="${profile.image || '../../image/default-icon.png'}" alt="${profile.name}">
      <h3>${profile.name}</h3>
    `;
    profileList.appendChild(profileCard);

    // Add click event to profile cards
    profileCard.addEventListener('click', () => {
      showProfileDetails(profile);
    });
  });

  // Add drag-and-drop functionality
  addDragAndDrop();
};

const showProfileDetails = async (profile) => {
  setCurrentProfileId(profile.id);

  const bottomBar = document.getElementById('bottom-bar');
  bottomBar.style.display = 'flex'; 

  // Clear all intervals before switching profiles
  clearAllIntervals();
  
  // Fetch categories and timers
  const categories = await window.electron.invoke('fetch-categories', profile.id);
  const timers = await window.electron.invoke('fetch-timers', profile.id);

  // Update category select
  const categorySelect = document.getElementById('categorySelect');
  categorySelect.innerHTML = `
    <option value="">Select Category</option>
    ${categories.map(cat => `
      <option value="${cat.id}">${cat.name}</option>
    `).join('')}
  `;

  // Display timers
  displayTimers(timers);
};

// Show the Add New Timer modal
addTimerButton.addEventListener('click', () => {
  addTimerModal.style.display = 'flex';
});

// Close the Add New Timer modal
closeTimerModal.addEventListener('click', () => {
  addTimerModal.style.display = 'none';
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const profileName = document.getElementById('profile-name').value;
  const profileImage = document.getElementById('profile-image').files[0];

  let imageBase64 = null; // Default to null if no image is uploaded

  if (profileImage) {
    // Convert image to base64 if an image is uploaded
    const reader = new FileReader();
    reader.onload = async () => {
      imageBase64 = reader.result;

      // Send the new profile to the main process
      await window.electron.invoke('create-profile', {
        name: profileName,
        image: imageBase64,
        created_date: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
      });

      // Refresh the profile list
      const profiles = await window.electron.invoke('fetch-profiles');
      updateProfileList(profiles);

      // Close the modal
      profileModal.style.display = 'none';
    };
    reader.readAsDataURL(profileImage);
  } else {
    // If no image is uploaded, send the profile without an image
    await window.electron.invoke('create-profile', {
      name: profileName,
      image: null, // No image
      created_date: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
    });

    // Refresh the profile list
    const profiles = await window.electron.invoke('fetch-profiles');
    updateProfileList(profiles);

    // Close the modal
    profileModal.style.display = 'none';
  }
});

const updateProfileOrder = async () => {
  const profiles = [];
  const profileCards = document.querySelectorAll('.profile-card');

  profileCards.forEach((card, index) => {
    const profileName = card.querySelector('h3').textContent;
    profiles.push({ name: profileName, order: index });
  });

  // Send the updated order to the main process
  await window.electron.invoke('update-profile-order', profiles);
};

const addDragAndDrop = () => {
  let draggedItem = null;

  const items = profileList.querySelectorAll('.profile-card');
  items.forEach((item) => {
    item.addEventListener('dragstart', () => {
      draggedItem = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    item.addEventListener('dragend', () => {
      setTimeout(() => item.classList.remove('dragging'), 0);
      draggedItem = null;
      updateProfileOrder(); // Save the new order after dragging
    });
  });

  profileList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(profileList, e.clientY);
    const currentItem = document.querySelector('.dragging');
    if (afterElement == null) {
      profileList.appendChild(currentItem);
    } else {
      profileList.insertBefore(currentItem, afterElement);
    }
  });
};

const getDragAfterElement = (container, y) => {
  const draggableElements = [...container.querySelectorAll('.profile-card:not(.dragging)')];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
};
