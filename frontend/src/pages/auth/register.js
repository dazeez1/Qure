/**
 * Unified Registration Form Handler
 * Handles both Patient and Hospital Staff registration
 * Client-side validation only (UX purposes)
 * All security validation will be handled by backend
 */

'use strict';

const roleRadios = document.querySelectorAll('input[name="role"]');
const patientForm = document.getElementById('form-patient');
const staffForm = document.getElementById('form-staff');

// Role switching - show/hide forms
roleRadios.forEach((radio) => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'patient') {
      patientForm.classList.remove('hidden');
      staffForm.classList.add('hidden');
      // Clear staff form
      staffForm.reset();
      clearAllErrors('staff');
    } else {
      patientForm.classList.add('hidden');
      staffForm.classList.remove('hidden');
      // Clear patient form
      patientForm.reset();
      clearAllErrors('patient');
    }
  });
});

// Password visibility toggles
function setupPasswordToggle(toggleId, inputId) {
  const toggle = document.getElementById(toggleId);
  if (toggle) {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      const icon = toggle.querySelector('.material-symbols-outlined');
      
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility_off';
      }
    });
  }
}

// Setup all password toggles
setupPasswordToggle('toggle-patient-password', 'patient-password');
setupPasswordToggle('toggle-patient-confirm-password', 'patient-confirm_password');
setupPasswordToggle('toggle-staff-password', 'staff-password');
setupPasswordToggle('toggle-staff-confirm-password', 'staff-confirm_password');

// Validation functions (UX only - backend will validate)
const validators = {
  firstName: (value) => {
    if (!value.trim()) {
      return 'First name is required';
    }
    if (value.trim().length < 2) {
      return 'First name must be at least 2 characters';
    }
    return '';
  },

  lastName: (value) => {
    if (!value.trim()) {
      return 'Last name is required';
    }
    if (value.trim().length < 2) {
      return 'Last name must be at least 2 characters';
    }
    return '';
  },

  email: (value) => {
    if (!value.trim()) {
      return 'Email is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Please enter a valid email address';
    }
    return '';
  },

  phone: (value) => {
    if (!value.trim()) {
      return 'Phone number is required';
    }
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    if (!phoneRegex.test(value.replace(/\s/g, ''))) {
      return 'Please enter a valid phone number';
    }
    return '';
  },

  gender: (value) => {
    if (!value) {
      return 'Please select a gender';
    }
    return '';
  },

  hospitalName: (value) => {
    if (!value.trim()) {
      return 'Hospital/Clinic name is required';
    }
    if (value.trim().length < 2) {
      return 'Hospital/Clinic name must be at least 2 characters';
    }
    return '';
  },

  password: (value) => {
    if (!value) {
      return 'Password is required';
    }
    if (value.length < 8) {
      return 'Password must be at least 8 characters';
    }
    return '';
  },

  confirmPassword: (value, password) => {
    if (!value) {
      return 'Please confirm your password';
    }
    if (value !== password) {
      return 'Passwords do not match';
    }
    return '';
  },

  terms: (checked) => {
    if (!checked) {
      return 'You must agree to the Terms & Conditions';
    }
    return '';
  },
};

// Show error message
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

// Clear error message
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

// Clear all errors for a form type
function clearAllErrors(formType) {
  const form = formType === 'patient' ? patientForm : staffForm;
  const fields = form.querySelectorAll('input, select');
  
  fields.forEach((field) => {
    clearError(field.id);
  });
  
  // Clear checkbox error
  const termsId = formType === 'patient' ? 'terms-patient' : 'terms-staff';
  clearError(termsId);
}

// Validate individual field
function validateField(fieldId, value) {
  // Extract base field name (remove prefix)
  const baseFieldId = fieldId.replace(/^(patient-|staff-)/, '').replace(/-/g, '');
  let validatorKey = baseFieldId;
  
  // Map field IDs to validator keys
  if (baseFieldId === 'confirmpassword') {
    validatorKey = 'confirmPassword';
  } else if (baseFieldId === 'firstname') {
    validatorKey = 'firstName';
  } else if (baseFieldId === 'lastname') {
    validatorKey = 'lastName';
  } else if (baseFieldId === 'number') {
    validatorKey = 'phone';
  } else if (baseFieldId.includes('hospital')) {
    validatorKey = 'hospitalName';
  }
  
  const validator = validators[validatorKey];
  if (!validator) return true;

  let error = '';
  if (validatorKey === 'confirmPassword') {
    const passwordId = fieldId.replace('confirm_password', 'password');
    const passwordValue = document.getElementById(passwordId)?.value || '';
    error = validator(value, passwordValue);
  } else if (validatorKey === 'terms') {
    error = validator(value);
  } else {
    error = validator(value);
  }

  if (error) {
    showError(fieldId, error);
    return false;
  } else {
    clearError(fieldId);
    return true;
  }
}

// Setup form validation
function setupFormValidation(form, formType) {
  const fields = form.querySelectorAll('input, select');
  const prefix = formType === 'patient' ? 'patient-' : 'staff-';
  
  fields.forEach((field) => {
    if (field.type === 'checkbox') {
      field.addEventListener('change', () => {
        const termsId = formType === 'patient' ? 'terms-patient' : 'terms-staff';
        validateField(termsId, field.checked);
      });
    } else {
      field.addEventListener('blur', () => {
        validateField(field.id, field.value);
      });

      field.addEventListener('input', () => {
        if (field.classList.contains('error')) {
          validateField(field.id, field.value);
        }
      });
    }
  });

  // Password confirmation real-time check
  const passwordField = form.querySelector(`#${prefix}password`);
  const confirmPasswordField = form.querySelector(`#${prefix}confirm_password`);
  
  if (passwordField && confirmPasswordField) {
    passwordField.addEventListener('input', () => {
      if (confirmPasswordField.value) {
        validateField(confirmPasswordField.id, confirmPasswordField.value);
      }
    });
  }

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form values
    const formData = new FormData(form);
    const data = {
      firstName: formData.get(`${prefix}firstname`)?.trim() || '',
      lastName: formData.get(`${prefix}lastname`)?.trim() || '',
      phone: formData.get(`${prefix}number`)?.trim() || '',
      password: formData.get(`${prefix}password`) || '',
      confirmPassword: formData.get(`${prefix}confirm_password`) || '',
      terms: formData.get(`terms-${formType}`) === 'on',
      role: formType,
    };

    // Add role-specific fields
    if (formType === 'patient') {
      data.email = formData.get('patient-email')?.trim() || '';
      data.gender = formData.get('patient-gender') || '';
    } else {
      data.workEmail = formData.get('staff-email')?.trim() || '';
      data.hospitalName = formData.get('hospital')?.trim() || '';
    }

    // Validate all fields
    let isValid = true;
    
    // Validate based on form type
    if (formType === 'patient') {
      isValid = validateField('patient-firstname', data.firstName) && isValid;
      isValid = validateField('patient-lastname', data.lastName) && isValid;
      isValid = validateField('patient-email', data.email) && isValid;
      isValid = validateField('patient-number', data.phone) && isValid;
      isValid = validateField('patient-gender', data.gender) && isValid;
      isValid = validateField('patient-password', data.password) && isValid;
      isValid = validateField('patient-confirm_password', data.confirmPassword) && isValid;
      isValid = validateField('terms-patient', data.terms) && isValid;
    } else {
      isValid = validateField('staff-firstname', data.firstName) && isValid;
      isValid = validateField('staff-lastname', data.lastName) && isValid;
      isValid = validateField('staff-email', data.workEmail) && isValid;
      isValid = validateField('staff-number', data.phone) && isValid;
      isValid = validateField('hospital-name', data.hospitalName) && isValid;
      isValid = validateField('staff-password', data.password) && isValid;
      isValid = validateField('staff-confirm_password', data.confirmPassword) && isValid;
      isValid = validateField('terms-staff', data.terms) && isValid;
    }

    if (!isValid) {
      // Scroll to first error
      const firstError = form.querySelector('.error');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstError.focus();
      }
      return;
    }

    // Disable submit button
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';

    // TODO: Send to backend API
    // This will be implemented when backend is ready
    try {
      // Placeholder for API call
      // const response = await fetch('/api/auth/register', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(data),
      // });
      
      // For now, just prepare the data (will be sent to backend)
      // Data structure ready for API integration
      const formDataForBackend = {
        ...data,
        password: '[HIDDEN]',
        confirmPassword: '[HIDDEN]',
      };
      // TODO: Replace with actual API call when backend is ready
      // await fetch('/api/auth/register', { ... });

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // TODO: Handle response and redirect
      // if (response.ok) {
      //   window.location.href = '/login.html';
      // } else {
      //   const error = await response.json();
      //   const emailField = formType === 'patient' ? 'patient-email' : 'staff-email';
      //   showError(emailField, error.message || 'Registration failed');
      // }
      
      alert('Registration form is ready! Backend integration pending.');
    } catch (error) {
      console.error('Registration error:', error);
      const emailField = formType === 'patient' ? 'patient-email' : 'staff-email';
      showError(emailField, 'An error occurred. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// Initialize both forms
if (patientForm) {
  setupFormValidation(patientForm, 'patient');
}

if (staffForm) {
  setupFormValidation(staffForm, 'staff');
}
