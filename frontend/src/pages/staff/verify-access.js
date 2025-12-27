/**
 * Verify Access Code Page
 * Allows staff to verify their hospital access code
 */

'use strict';

import { isAuthenticated, clearAuth, getAuthToken, getAuthUser } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// Guard 1: Check authentication
if (!isAuthenticated()) {
  toast.error('Please log in to continue');
  window.location.href = '/login.html';
}

// Get user data
const user = getAuthUser();

// Guard 2: Must be STAFF role
if (!user || user.role !== 'STAFF') {
  toast.error('Access denied');
  window.location.href = '/login.html';
}

// Guard 3: Must NOT be already verified
if (user && user.isVerified) {
  // Already verified - redirect to dashboard
  window.location.href = '/staff/dashboard.html';
}

// Get form elements
const verifyForm = document.getElementById('verify-access-form');
const accessCodeInput = document.getElementById('access-code');
const verifyBtn = document.getElementById('verify-btn');
const backBtn = document.getElementById('back-btn');
const logoutBtn = document.getElementById('logout-btn');

// Handle back to home button
if (backBtn) {
  backBtn.addEventListener('click', () => {
    window.location.href = '/index.html';
  });
}

// Handle logout button
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    clearAuth();
    toast.success('Logged out successfully');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1000);
  });
}

// Handle form submission
if (verifyForm) {
  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Trim and get access code
    const accessCode = accessCodeInput.value.trim();

    // Prevent empty submit
    if (!accessCode) {
      toast.error('Please enter an access code');
      accessCodeInput.focus();
      return;
    }

    // Disable button and show loading state
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';

    try {
      const token = getAuthToken();
      if (!token) {
        toast.error('Session expired. Please log in again.');
        clearAuth();
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 1500);
        return;
      }

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${API_BASE_URL}/staff/verify-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ accessCode }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success
        toast.success(result.message || 'Access verified successfully');

        // Clear form
        verifyForm.reset();

        // Redirect to dashboard
        setTimeout(() => {
          window.location.href = '/staff/dashboard.html';
        }, 1500);
      } else {
        // Error - show toast with backend message
        toast.error(result.message || 'Verification failed. Please try again.');
        accessCodeInput.focus();
        accessCodeInput.select();
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast.error('Network error. Please try again.');
      accessCodeInput.focus();
    } finally {
      // Re-enable button
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Continue';
    }
  });
}

// Auto-focus on access code input
if (accessCodeInput) {
  accessCodeInput.focus();
}

// Auto-trim input on blur
if (accessCodeInput) {
  accessCodeInput.addEventListener('blur', (e) => {
    e.target.value = e.target.value.trim();
  });
}

// Convert input to uppercase as user types and auto-trim
if (accessCodeInput) {
  accessCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.trim().toUpperCase();
  });
}

// Mobile menu toggle
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

function toggleMobileMenu() {
  if (sidebar && sidebarOverlay && mobileMenuToggle) {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
    mobileMenuToggle.classList.toggle('active');
  }
}

function closeMobileMenu() {
  if (sidebar && sidebarOverlay && mobileMenuToggle) {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    mobileMenuToggle.classList.remove('active');
  }
}

if (mobileMenuToggle) {
  mobileMenuToggle.addEventListener('click', toggleMobileMenu);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', closeMobileMenu);
}

// Close mobile menu when clicking on nav items
const navItems = document.querySelectorAll('.nav-item, .logout-item');
navItems.forEach((item) => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      closeMobileMenu();
    }
  });
});
