/**
 * Reset Password Page
 * Handles password reset form submission with token validation
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

// Get form elements
const resetPasswordForm = document.getElementById('reset-password-form');
const passwordInput = document.getElementById('reset-password');
const confirmPasswordInput = document.getElementById('reset-confirm-password');
const passwordError = document.getElementById('reset-password-error');
const confirmPasswordError = document.getElementById('reset-confirm-password-error');
const resetBtn = document.getElementById('reset-btn');
const togglePasswordBtn = document.getElementById('toggle-reset-password');
const toggleConfirmPasswordBtn = document.getElementById('toggle-reset-confirm-password');

// Get token from URL query params
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// Check if token exists
if (!token) {
  toast.error('Invalid reset link. Please request a new password reset.');
  setTimeout(() => {
    window.location.href = '/forgot-password.html';
  }, 2000);
}

/**
 * Clear error message for a field
 */
const clearError = (errorElementId) => {
  const errorElement = document.getElementById(errorElementId);
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }
};

/**
 * Show error message for a field
 */
const showError = (errorElementId, message) => {
  const errorElement = document.getElementById(errorElementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }

  // Add error class to input
  const inputId = errorElementId.replace('-error', '');
  const input = document.getElementById(inputId);
  if (input) {
    input.classList.add('error');
  }
};

/**
 * Validate password format
 * Client-side validation (backend also validates)
 */
const validatePasswordFormat = (password) => {
  if (!password || password.length < 8) {
    return {
      isValid: false,
      message: 'Password must be at least 8 characters long',
    };
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passwordRegex.test(password)) {
    return {
      isValid: false,
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    };
  }

  return { isValid: true };
};

/**
 * Toggle password visibility
 */
const togglePasswordVisibility = (input, toggleBtn) => {
  if (input && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const icon = toggleBtn.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.textContent = isPassword ? 'visibility' : 'visibility_off';
      }
    });
  }
};

// Set up password visibility toggles
togglePasswordVisibility(passwordInput, togglePasswordBtn);
togglePasswordVisibility(confirmPasswordInput, toggleConfirmPasswordBtn);

// Handle form submission
if (resetPasswordForm && token) {
  resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form values
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Clear previous errors
    clearError('reset-password-error');
    clearError('reset-confirm-password-error');
    if (passwordInput) passwordInput.classList.remove('error');
    if (confirmPasswordInput) confirmPasswordInput.classList.remove('error');

    // Validate password format
    const passwordValidation = validatePasswordFormat(password);
    if (!passwordValidation.isValid) {
      showError('reset-password-error', passwordValidation.message);
      passwordInput.focus();
      return;
    }

    // Validate password confirmation
    if (!confirmPassword) {
      showError('reset-confirm-password-error', 'Please confirm your password');
      confirmPasswordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      showError('reset-confirm-password-error', 'Passwords do not match');
      confirmPasswordInput.focus();
      return;
    }

    // Disable button and show loading state
    resetBtn.disabled = true;
    const originalText = resetBtn.textContent;
    resetBtn.textContent = 'Resetting...';

    try {
      const response = await fetch(API_ENDPOINTS.auth.resetPassword, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success - show message
        toast.success(result.message || 'Password reset successfully. Please log in with your new password.');

        // Clear form
        resetPasswordForm.reset();

        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 2000);
      } else {
        // Error - show toast with backend message
        toast.error(result.message || 'Failed to reset password. Please try again.');
        
        // If token is invalid/expired, redirect to forgot password page
        if (result.message && (result.message.includes('Invalid') || result.message.includes('expired'))) {
          setTimeout(() => {
            window.location.href = '/forgot-password.html';
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('Network error. Please try again.');
    } finally {
      // Re-enable button
      resetBtn.disabled = false;
      resetBtn.textContent = originalText;
    }
  });
}

// Auto-focus on password input
if (passwordInput) {
  passwordInput.focus();
}

