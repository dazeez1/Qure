/**
 * Contact Page
 * Handles contact form submission
 */

'use strict';

import { apiPost } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { displayAvatar } from '../../utils/avatar.js';

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

    // Close mobile nav when clicking on a link
    const mobileNavLinks = mobileNav.querySelectorAll('a');
    mobileNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        hamburgerMenu.classList.remove('active');
        mobileNav.classList.remove('active');
      });
    });

    // Close mobile nav when clicking outside
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
 * Handle form submission
 */
async function handleSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const messageTextarea = document.getElementById('message');
  const submitBtn = document.getElementById('submit-btn');

  if (!nameInput || !emailInput || !messageTextarea || !submitBtn) {
    return;
  }

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const message = messageTextarea.value.trim();

  // Client-side validation
  if (!name) {
    toast.error('Please enter your name');
    nameInput.focus();
    return;
  }

  if (!email) {
    toast.error('Please enter your email address');
    emailInput.focus();
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    toast.error('Please enter a valid email address');
    emailInput.focus();
    return;
  }

  if (!message) {
    toast.error('Please enter your message');
    messageTextarea.focus();
    return;
  }

  if (message.length < 10) {
    toast.error('Message must be at least 10 characters long');
    messageTextarea.focus();
    return;
  }

  if (message.length > 5000) {
    toast.error('Message must not exceed 5000 characters');
    messageTextarea.focus();
    return;
  }

  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await apiPost('/support/contact', {
      name,
      email,
      message,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to send message');
    }

    toast.success('Your message has been sent successfully! We will get back to you soon.');

    // Reset form
    nameInput.value = '';
    emailInput.value = '';
    messageTextarea.value = '';
  } catch (error) {
    console.error('Error submitting contact form:', error);
    toast.error(error.message || 'Failed to send message. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

/**
 * Initialize page
 */
function initPage() {
  // Set up user profile if logged in
  if (isAuthenticated()) {
    const user = getAuthUser();
    if (user) {
      const userProfile = document.getElementById('user-profile');
      const userInitial = document.getElementById('user-initial');
      if (userProfile) {
        displayAvatar(userProfile, user.avatarUrl, user.fullName);
        userProfile.style.cursor = 'pointer';
        userProfile.addEventListener('click', () => {
          window.location.href = 'profile.html';
        });
      }
      if (userInitial && !user.avatarUrl) {
        const initials = user.fullName
          ? user.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
          : 'U';
        userInitial.textContent = initials;
      }
    }
  } else {
    // If not authenticated, show default "U" or hide profile
    const userInitial = document.getElementById('user-initial');
    if (userInitial) {
      userInitial.textContent = 'U';
    }
  }

  // Initialize mobile navigation
  initMobileNav();

  // Set up form submission
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
