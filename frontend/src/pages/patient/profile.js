/**
 * Patient Profile Page
 * Handles profile viewing, updating, and avatar upload
 */

'use strict';

import { apiGet, apiPatch, getApiBaseUrl } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated, clearAuth, getAuthToken, setAuthUser } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { displayAvatar } from '../../utils/avatar.js';

// Check authentication
if (!isAuthenticated()) {
  toast.error('Please log in to access your profile');
  window.location.href = '/login.html';
}

let currentProfileData = null;

/**
 * Initialize mobile navigation
 */
function initMobileNav() {
  const hamburgerMenu = document.getElementById('hamburger-menu');
  const mobileNav = document.getElementById('mobile-nav');

  if (hamburgerMenu && mobileNav) {
    hamburgerMenu.addEventListener('click', () => {
      hamburgerMenu.classList.toggle('active');
      mobileNav.classList.toggle('active');
    });

    const mobileNavLinks = mobileNav.querySelectorAll('a');
    mobileNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        hamburgerMenu.classList.remove('active');
        mobileNav.classList.remove('active');
      });
    });

    document.addEventListener('click', (e) => {
      if (
        !hamburgerMenu.contains(e.target) &&
        !mobileNav.contains(e.target) &&
        mobileNav.classList.contains('active')
      ) {
        hamburgerMenu.classList.remove('active');
        mobileNav.classList.remove('active');
      }
    });
  }
}


/**
 * Load patient profile data
 */
async function loadProfile() {
  try {
    const response = await apiGet('/patient/me');
    
    if (!response.ok) {
      throw new Error('Failed to load profile');
    }

    const result = await response.json();
    currentProfileData = result.data;

    // Populate form fields
    const fullNameInput = document.getElementById('full-name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const genderSelect = document.getElementById('gender');

    if (fullNameInput) fullNameInput.value = currentProfileData.fullName || '';
    if (emailInput) emailInput.value = currentProfileData.email || '';
    if (phoneInput) phoneInput.value = currentProfileData.phone || '';
    if (genderSelect) {
      // Handle gender value - ensure it matches enum values (MALE, FEMALE, OTHER)
      let genderValue = '';
      if (currentProfileData.gender) {
        const genderUpper = currentProfileData.gender.toUpperCase();
        // Map any stored values to enum values
        if (genderUpper === 'MALE' || genderUpper === 'M') {
          genderValue = 'MALE';
        } else if (genderUpper === 'FEMALE' || genderUpper === 'F') {
          genderValue = 'FEMALE';
        } else {
          genderValue = 'OTHER';
        }
      }
      genderSelect.value = genderValue;
    }

    // Display avatar
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
      displayAvatar(profileAvatar, currentProfileData.avatarUrl, currentProfileData.fullName);
    }

    // Display header avatar
    const headerProfile = document.getElementById('user-profile');
    const headerInitial = document.getElementById('user-initial');
    if (headerProfile) {
      displayAvatar(headerProfile, currentProfileData.avatarUrl, currentProfileData.fullName);
    }
    if (headerInitial && !currentProfileData.avatarUrl) {
      const initial = currentProfileData.fullName
        ? currentProfileData.fullName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
        : 'U';
      headerInitial.textContent = initial;
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    toast.error('Failed to load profile. Please try again.');
  }
}

/**
 * Handle profile form submission
 */
async function handleProfileUpdate(e) {
  e.preventDefault();

  const phoneInput = document.getElementById('phone');
  const genderSelect = document.getElementById('gender');
  const saveBtn = document.getElementById('save-btn');

  if (!phoneInput || !genderSelect || !saveBtn) {
    return;
  }

  const phone = phoneInput.value.trim();
  const gender = genderSelect.value;

  // Validation
  if (!phone) {
    toast.error('Phone number is required');
    phoneInput.focus();
    return;
  }

  // Phone format validation - accept +234, 0, or international formats
  const cleanPhone = phone.replace(/\s+/g, '');
  
  // Count only digits for length validation
  const digitsOnly = cleanPhone.replace(/\D/g, '');
  
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    toast.error('Phone number must be between 10 and 15 digits');
    phoneInput.focus();
    return;
  }
  
  // More flexible regex: accepts +234, 0, or international formats
  const phoneRegex = /^(\+?234|0|\+?[1-9])?[0-9]{7,14}$/;
  if (!phoneRegex.test(cleanPhone)) {
    toast.error('Invalid phone number format. Accepted formats: +234..., 0..., or international');
    phoneInput.focus();
    return;
  }

  if (!gender) {
    toast.error('Please select a gender');
    genderSelect.focus();
    return;
  }

  // Disable save button
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await apiPatch('/patient/profile', {
      phone: cleanPhone,
      gender: gender,
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || 'Failed to update profile');
    }

    const result = await response.json();
    currentProfileData = result.data;

    toast.success('Profile updated successfully!');
    
    // Reload profile to get updated data
    await loadProfile();
  } catch (error) {
    console.error('Error updating profile:', error);
    toast.error(error.message || 'Failed to update profile. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

/**
 * Handle avatar upload
 */
async function handleAvatarUpload(file) {
  if (!file) return;

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    toast.error('Invalid file type. Please upload a JPEG, JPG, or PNG image.');
    return;
  }

  // Validate file size (2MB)
  const maxSize = 2 * 1024 * 1024; // 2MB
  if (file.size > maxSize) {
    toast.error('File size must be less than 2MB.');
    return;
  }

  const uploadBtn = document.getElementById('upload-btn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
  }

  try {
    const formData = new FormData();
    formData.append('avatar', file);

    const token = getAuthToken();
    if (!token) {
      toast.error('Please log in to upload avatar');
      return;
    }

    const response = await fetch(`${getApiBaseUrl()}/patient/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to upload avatar');
    }

    toast.success('Avatar uploaded successfully!');
    
    // Update current profile data
    const newAvatarUrl = result.data.avatarUrl;
    currentProfileData.avatarUrl = newAvatarUrl;
    
    // Update localStorage user data with new avatarUrl
    const user = getAuthUser();
    if (user) {
      user.avatarUrl = newAvatarUrl;
      setAuthUser(user);
    }
    
    // Immediately update avatar display without reloading entire profile
    const profileAvatar = document.getElementById('profile-avatar');
    const headerProfile = document.getElementById('user-profile');
    
    if (profileAvatar && newAvatarUrl) {
      displayAvatar(profileAvatar, newAvatarUrl, currentProfileData.fullName);
    }
    if (headerProfile && newAvatarUrl) {
      displayAvatar(headerProfile, newAvatarUrl, currentProfileData.fullName);
    }
    
    // Also reload profile to ensure everything is in sync
    await loadProfile();
  } catch (error) {
    console.error('Error uploading avatar:', error);
    toast.error(error.message || 'Failed to upload avatar. Please try again.');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload/Change';
    }
  }
}

/**
 * Handle logout
 */
function handleLogout() {
  clearAuth();
  toast.success('Logged out successfully');
  setTimeout(() => {
    window.location.href = '/login.html';
  }, 1000);
}

/**
 * Initialize page
 */
async function initPage() {
  // Initialize mobile navigation
  initMobileNav();

  // Set up avatar upload button
  const uploadBtn = document.getElementById('upload-btn');
  const avatarInput = document.getElementById('avatar-input');
  
  if (uploadBtn && avatarInput) {
    uploadBtn.addEventListener('click', () => {
      avatarInput.click();
    });

    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleAvatarUpload(file);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    });
  }

  // Set up form submission
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileUpdate);
  }

  // Set up logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Set up header profile click to navigate to profile
  const headerProfile = document.getElementById('user-profile');
  if (headerProfile) {
    headerProfile.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
  }

  // Load profile data
  await loadProfile();
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
