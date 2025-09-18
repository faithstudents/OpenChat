// vars.js
// All the variables for OpenChat

export const messagesList = document.getElementById('messages');
export const messageForm = document.getElementById('message-form');
export const messageInput = document.getElementById('message-input');
export const profileNameEl = document.getElementById('profile-username');

export const messageSound = new Audio('notification.mp3');
export const dmSound = new Audio('dm.mp3');

export const profileModal = document.getElementById('profile-modal');
export const profileForm = document.getElementById('profile-form');
export const displayNameInput = document.getElementById('display-name-input');
export const closeModalBtn = document.getElementById('close-modal-btn');
export const profileInfo = document.querySelector('.profile-info');
export const profileUsername = document.getElementById("profile-username");

export const imageInput = document.getElementById('image-input');
export const uploadImageBtn = document.getElementById('upload-image-btn');

export const dmsButton = document.getElementById("dms_button");

export const isOnDMPage = window.location.pathname.includes('dms.html');
