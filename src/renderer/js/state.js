// Shared state module
export let currentProfileId = null;

export function setCurrentProfileId(id) {
  currentProfileId = id;
}

export function getCurrentProfileId() {
  return currentProfileId;
}