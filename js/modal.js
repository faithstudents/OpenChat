// PROFILE MODAL
const profileModal = document.getElementById('profile-modal');
const closeProfileBtn = document.getElementById('close-modal-btn');
const profileSection = document.getElementById('profile');

profileSection.addEventListener('click', () => {
  profileModal.style.display = 'flex';
});

closeProfileBtn.addEventListener('click', () => {
  profileModal.style.display = 'none';
});

// SETTINGS MODAL
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');

// Open settings modal however you trigger it
// Example: profile button also opens settings (optional)

// Close buttons
closeSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});
settingsCancelBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

// Click outside modal content closes it
window.addEventListener('click', (e) => {
  if (e.target === profileModal) profileModal.style.display = 'none';
  if (e.target === settingsModal) settingsModal.style.display = 'none';
});
