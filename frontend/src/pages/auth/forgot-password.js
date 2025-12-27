/**
 * Forgot Password Page
 * Handles password reset request form submission
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

// Get form elements
const forgotPasswordForm = document.getElementById('forgot-password-form');
const emailInput = document.getElementById('forgot-email');
const emailError = document.getElementById('forgot-email-error');
const sendResetBtn = document.getElementById('send-reset-btn');

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
 * Validate email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

// Handle form submission
if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form values
    const email = emailInput.value.trim();

    // Clear previous errors
    clearError('forgot-email-error');
    if (emailInput) {
      emailInput.classList.remove('error');
    }

    // Validate email
    if (!email) {
      showError('forgot-email-error', 'Email is required');
      emailInput.focus();
      return;
    }

    if (!validateEmail(email)) {
      showError('forgot-email-error', 'Please enter a valid email address');
      emailInput.focus();
      return;
    }

    // Disable button and show loading state
    sendResetBtn.disabled = true;
    const originalText = sendResetBtn.textContent;
    sendResetBtn.textContent = 'Sending...';

    try {
      const response = await fetch(API_ENDPOINTS.auth.forgotPassword, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success - show message
        toast.success(
          result.message ||
            'If an account exists with that email, a password reset link has been sent.'
        );

        // Clear form
        forgotPasswordForm.reset();

        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 2000);
      } else {
        // Error - show toast with backend message
        toast.error(result.message || 'Failed to send reset link. Please try again.');
        emailInput.focus();
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      toast.error('Network error. Please try again.');
      emailInput.focus();
    } finally {
      // Re-enable button
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = originalText;
    }
  });
}

// Auto-focus on email input
if (emailInput) {
  emailInput.focus();
}

