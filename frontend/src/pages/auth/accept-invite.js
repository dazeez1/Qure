/**
 * Accept Invitation Form Handler
 * Handles staff invitation acceptance
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

const acceptForm = document.getElementById('accept-invite-form');
const passwordInput = document.getElementById('accept-password');
const confirmPasswordInput = document.getElementById('accept-confirm-password');
const passwordToggle = document.getElementById('toggle-accept-password');
const confirmPasswordToggle = document.getElementById('toggle-accept-confirm-password');
const acceptBtn = document.getElementById('accept-btn');

// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// Check if token exists
if (!token) {
  toast.error('Invalid invitation link. Please check your email for the correct link.');
  setTimeout(() => {
    window.location.href = '/login.html';
  }, 2000);
}

// Password visibility toggle
if (passwordToggle) {
  passwordToggle.addEventListener('click', () => {
    const icon = passwordToggle.querySelector('.material-symbols-outlined');
    
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      icon.textContent = 'visibility';
    } else {
      passwordInput.type = 'password';
      icon.textContent = 'visibility_off';
    }
  });
}

if (confirmPasswordToggle) {
  confirmPasswordToggle.addEventListener('click', () => {
    const icon = confirmPasswordToggle.querySelector('.material-symbols-outlined');
    
    if (confirmPasswordInput.type === 'password') {
      confirmPasswordInput.type = 'text';
      icon.textContent = 'visibility';
    } else {
      confirmPasswordInput.type = 'password';
      icon.textContent = 'visibility_off';
    }
  });
}

// Validation functions
function showError(fieldId, message) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  const inputElement = document.getElementById(fieldId);
  
  if (errorElement) {
    errorElement.textContent = message;
  }
  
  if (inputElement) {
    inputElement.classList.add('error');
  }
}

function clearError(fieldId) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  const inputElement = document.getElementById(fieldId);
  
  if (errorElement) {
    errorElement.textContent = '';
  }
  
  if (inputElement) {
    inputElement.classList.remove('error');
  }
}

function validatePassword(value) {
  if (!value) {
    return 'Password is required';
  }
  
  if (value.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  
  // Check for uppercase, lowercase, number, and special character
  const hasUpperCase = /[A-Z]/.test(value);
  const hasLowerCase = /[a-z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
  
  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return 'Password must contain uppercase, lowercase, number, and special character';
  }
  
  return '';
}

function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) {
    return 'Please confirm your password';
  }
  
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  
  return '';
}

// Real-time validation
passwordInput.addEventListener('blur', () => {
  const error = validatePassword(passwordInput.value);
  if (error) {
    showError('accept-password', error);
  } else {
    clearError('accept-password');
  }
});

passwordInput.addEventListener('input', () => {
  if (passwordInput.classList.contains('error')) {
    const error = validatePassword(passwordInput.value);
    if (!error) {
      clearError('accept-password');
    }
  }
  
  // Also validate confirm password if it has a value
  if (confirmPasswordInput.value) {
    const confirmError = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
    if (confirmError) {
      showError('accept-confirm-password', confirmError);
    } else {
      clearError('accept-confirm-password');
    }
  }
});

confirmPasswordInput.addEventListener('blur', () => {
  const error = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
  if (error) {
    showError('accept-confirm-password', error);
  } else {
    clearError('accept-confirm-password');
  }
});

confirmPasswordInput.addEventListener('input', () => {
  if (confirmPasswordInput.classList.contains('error')) {
    const error = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
    if (!error) {
      clearError('accept-confirm-password');
    }
  }
});

// Handle form submission
if (acceptForm) {
  acceptForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors
    clearError('accept-password');
    clearError('accept-confirm-password');

    // Get form values
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      showError('accept-password', passwordError);
      passwordInput.focus();
      return;
    }

    // Validate confirm password
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (confirmError) {
      showError('accept-confirm-password', confirmError);
      confirmPasswordInput.focus();
      return;
    }

    // Check if token exists
    if (!token) {
      toast.error('Invalid invitation link. Please check your email.');
      return;
    }

    // Disable button and show loading state
    acceptBtn.disabled = true;
    const originalText = acceptBtn.textContent;
    acceptBtn.textContent = 'Accepting...';

    try {
      const response = await fetch(API_ENDPOINTS.auth.acceptInvite, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          password: password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success - show message
        toast.success(
          result.message || 'Invitation accepted successfully! Please log in with your new password.'
        );

        // Clear form
        acceptForm.reset();

        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 2000);
      } else {
        // Error - show toast with backend message
        toast.error(result.message || 'Failed to accept invitation. Please try again.');
        
        // Focus on password input
        passwordInput.focus();
      }
    } catch (error) {
      console.error('Accept invitation error:', error);
      toast.error('Network error. Please try again.');
      passwordInput.focus();
    } finally {
      // Re-enable button
      acceptBtn.disabled = false;
      acceptBtn.textContent = originalText;
    }
  });
}

// Auto-focus on password input
if (passwordInput) {
  passwordInput.focus();
}
