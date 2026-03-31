/**
 * Login Form Handler
 * Handles login for both Patient and Staff
 * Client-side validation only (UX purposes)
 * All security validation will be handled by backend
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { apiPost } from '../../utils/apiClient.js';
import { setAuthToken, setAuthUser } from '../../utils/auth.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const passwordToggle = document.getElementById('toggle-login-password');
const patientBtn = document.querySelector('.login-btn-patient');
const staffBtn = document.querySelector('.login-btn-staff');
const rememberMeCheckbox = document.getElementById('remember-me');

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

function validateEmailOrPhone(value) {
  if (!value.trim()) {
    return 'Email or phone number is required';
  }
  
  // Check if it's an email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Check if it's a phone number (basic validation)
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  
  const cleanValue = value.trim();
  if (emailRegex.test(cleanValue) || phoneRegex.test(cleanValue.replace(/\s/g, ''))) {
    return '';
  }
  
  return 'Please enter a valid email address or phone number';
}

function validatePassword(value) {
  if (!value) {
    return 'Password is required';
  }
  return '';
}

// Real-time validation
emailInput.addEventListener('blur', () => {
  const error = validateEmailOrPhone(emailInput.value);
  if (error) {
    showError('login-email', error);
  } else {
    clearError('login-email');
  }
});

emailInput.addEventListener('input', () => {
  if (emailInput.classList.contains('error')) {
    const error = validateEmailOrPhone(emailInput.value);
    if (!error) {
      clearError('login-email');
    }
  }
});

passwordInput.addEventListener('blur', () => {
  const error = validatePassword(passwordInput.value);
  if (error) {
    showError('login-password', error);
  } else {
    clearError('login-password');
  }
});

passwordInput.addEventListener('input', () => {
  if (passwordInput.classList.contains('error')) {
    const error = validatePassword(passwordInput.value);
    if (!error) {
      clearError('login-password');
    }
  }
});

// Login handler
async function handleLogin(role, clickedButton) {
  // Validate form
  const emailError = validateEmailOrPhone(emailInput.value);
  const passwordError = validatePassword(passwordInput.value);
  
  if (emailError) {
    showError('login-email', emailError);
  }
  
  if (passwordError) {
    showError('login-password', passwordError);
  }
  
  if (emailError || passwordError) {
    // Scroll to first error
    const firstError = loginForm.querySelector('.error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstError.focus();
    }
    return;
  }

  // Disable buttons while submitting (only show loading on the clicked one)
  const patientText = patientBtn?.textContent;
  const staffText = staffBtn?.textContent;

  if (patientBtn) patientBtn.disabled = true;
  if (staffBtn) staffBtn.disabled = true;

  if (clickedButton) {
    clickedButton.textContent = 'Logging in...';
  }

  // Prepare data for backend API
  const loginData = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
    rememberMe: rememberMeCheckbox.checked,
  };

  // Use different endpoints for patient vs staff
  const endpoint = role === 'PATIENT' 
    ? '/patient/auth/login'
    : '/auth/login';

  // Add role field for staff login (not needed for patient)
  if (role !== 'PATIENT') {
    loginData.role = role;
  }

  try {
    const response = await apiPost(endpoint, loginData);

    const result = await response.json();

    if (response.ok && result.success) {
      // Store token
      if (result.data.token) {
        setAuthToken(result.data.token);
      }

      // Handle different response structures
      if (role === 'PATIENT') {
        // Patient login returns patient object
        if (result.data.patient) {
          // Convert patient to user format for auth storage
          setAuthUser({
            id: result.data.patient.id,
            fullName: result.data.patient.fullName,
            email: result.data.patient.email,
            phone: result.data.patient.phone,
            gender: result.data.patient.gender,
            dateOfBirth: result.data.patient.dateOfBirth,
            avatarUrl: result.data.patient.avatarUrl || null,
            role: 'PATIENT',
            type: 'PATIENT',
          });
        }
      } else {
        // Staff login returns user object
        if (result.data.user) {
          setAuthUser(result.data.user);
        }
      }

      // Success - show toast
      toast.success(result.message || 'Login successful!');
      
      // Reset form
      loginForm.reset();
      clearError('login-email');
      clearError('login-password');
      
      // Redirect to dashboard based on role
      setTimeout(() => {
        if (role === 'PATIENT') {
          window.location.href = '/patient/dashboard.html';
        } else {
          window.location.href = '/staff/dashboard.html';
        }
      }, 1500);
    } else {
      // Error from backend - show toast
      const errorMessage = result.message || 'Login failed. Please check your credentials.';
      toast.error(errorMessage);
      
      // Show error on email field
      showError('login-email', errorMessage);
      
      // Scroll to error
      emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      emailInput.focus();
    }
  } catch (error) {
    // Network or unexpected error
    console.error('Login error:', error);
    const errorMessage = 'Network error. Please check your connection and try again.';
    toast.error(errorMessage);
    
    showError('login-email', errorMessage);
    emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    emailInput.focus();
  } finally {
    // Re-enable buttons
    if (patientBtn) {
      patientBtn.disabled = false;
      if (typeof patientText === 'string') patientBtn.textContent = patientText;
    }
    if (staffBtn) {
      staffBtn.disabled = false;
      if (typeof staffText === 'string') staffBtn.textContent = staffText;
    }
  }
}

// Prevent form submission (we handle login via button clicks)
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // Don't do anything - login is handled by button clicks
  });
}

// Add event listeners to login buttons
if (patientBtn) {
  patientBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleLogin('PATIENT', patientBtn);
  });
}

if (staffBtn) {
  staffBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleLogin('STAFF', staffBtn);
  });
}

// Prevent form submission on Enter key (we use buttons instead)
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
  });
}

