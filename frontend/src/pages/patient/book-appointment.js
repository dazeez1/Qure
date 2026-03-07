/**
 * Book Appointment Page
 * Handles appointment booking form and patient details
 */

'use strict';

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// Check authentication first
if (!isAuthenticated()) {
  toast.error('Please log in to access this page');
  window.location.href = '/login.html';
}

// Get user data
const user = getAuthUser();

// Display user initial
const userInitialElement = document.getElementById('user-initial');

if (user) {
  let initial = 'U';
  if (user.fullName) {
    initial = user.fullName.charAt(0).toUpperCase();
  } else if (user.firstName) {
    initial = user.firstName.charAt(0).toUpperCase();
  } else if (user.email) {
    initial = user.email.charAt(0).toUpperCase();
  }
  
  if (userInitialElement) userInitialElement.textContent = initial;
}

/**
 * Format date for display (e.g., "April 25, 2025")
 */
function formatDateDisplay(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time for display (e.g., "10:45am")
 */
function formatTimeDisplay(timeString) {
  if (!timeString) return '-';
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes}${ampm}`;
}

/**
 * Format date for input (YYYY-MM-DD)
 */
function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Load patient data and populate form
 */
async function loadPatientData() {
  try {
    // Get patient data from auth user
    if (user) {
      const fullNameInput = document.getElementById('full-name');
      const genderInput = document.getElementById('gender');
      const phoneInput = document.getElementById('phone-number');

      if (fullNameInput && user.fullName) {
        fullNameInput.value = user.fullName.toUpperCase();
      }

      if (genderInput && user.gender) {
        genderInput.value = user.gender.toUpperCase();
      }

      if (phoneInput && user.phone) {
        phoneInput.value = user.phone;
      }
    }
  } catch (error) {
    console.error('Error loading patient data:', error);
  }
}

/**
 * Load hospitals from backend (filtered by active appointments)
 */
async function loadHospitals() {
  try {
    const hospitalSelect = document.getElementById('hospital');
    if (!hospitalSelect) return;

    // Clear existing options
    hospitalSelect.innerHTML = '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Hospital';
    hospitalSelect.appendChild(defaultOption);

    // Fetch hospitals from backend (with auth token to filter by active appointments)
    const response = await apiGet('/public/hospitals');
    if (!response.ok) {
      throw new Error('Failed to fetch hospitals');
    }

    const result = await response.json();
    const hospitals = result.data || [];

    // Populate with actual hospitals
    hospitals.forEach(hospital => {
      const option = document.createElement('option');
      option.value = hospital.id;
      option.textContent = hospital.name;
      hospitalSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading hospitals:', error);
    toast.error('Failed to load hospitals. Please refresh the page.');
  }
}

/**
 * Load departments for selected hospital (auto-loads when hospital is selected)
 */
async function loadDepartments(hospitalId) {
  try {
    const departmentSelect = document.getElementById('department');
    if (!departmentSelect) return;

    // Clear existing options except the first one
    departmentSelect.innerHTML = '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Department';
    departmentSelect.appendChild(defaultOption);

    if (!hospitalId) {
      return;
    }

    // Fetch departments from backend
    const response = await apiGet(`/public/hospitals/${hospitalId}/departments`);
    if (!response.ok) {
      throw new Error('Failed to fetch departments');
    }

    const result = await response.json();
    const departments = result.data || [];

    // Populate with actual departments
    departments.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept.id;
      option.textContent = dept.name;
      departmentSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading departments:', error);
    toast.error('Failed to load departments. Please try selecting the hospital again.');
  }
}

/**
 * Update appointment details display
 */
function updateAppointmentDetails() {
  const dateInput = document.getElementById('appointment-date');
  const timeInput = document.getElementById('appointment-time');
  const detailsDiv = document.getElementById('appointment-details');
  const displayDate = document.getElementById('display-date');
  const displayTime = document.getElementById('display-time');

  if (!dateInput || !timeInput || !detailsDiv || !displayDate || !displayTime) return;

  const date = dateInput.value;
  const time = timeInput.value;

  if (date && time) {
    // Combine date and time
    const dateTime = new Date(`${date}T${time}`);
    displayDate.textContent = formatDateDisplay(dateTime);
    displayTime.textContent = formatTimeDisplay(time);
    detailsDiv.style.display = 'block';
  } else {
    detailsDiv.style.display = 'none';
  }
}

// Event Listeners

// Hospital selection change
const hospitalSelect = document.getElementById('hospital');
if (hospitalSelect) {
  hospitalSelect.addEventListener('change', (e) => {
    loadDepartments(e.target.value);
  });
}

// Date and time inputs - update appointment details display
const dateInput = document.getElementById('appointment-date');
const timeInput = document.getElementById('appointment-time');

if (dateInput) {
  dateInput.addEventListener('change', updateAppointmentDetails);
  // Set minimum date to today
  const today = new Date();
  dateInput.min = formatDateInput(today);
}

if (timeInput) {
  timeInput.addEventListener('change', updateAppointmentDetails);
}

// Book Appointment button
const bookAppointmentBtn = document.getElementById('book-appointment-submit-btn');

if (bookAppointmentBtn) {
  bookAppointmentBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Disable button to prevent double submission
    bookAppointmentBtn.disabled = true;
    const originalText = bookAppointmentBtn.textContent;
    bookAppointmentBtn.textContent = 'Booking...';

    try {
      // Get data from both forms
      const bookingFormData = new FormData(document.getElementById('booking-form'));
      const hospitalId = bookingFormData.get('hospital');
      const departmentId = bookingFormData.get('department');
      const appointmentDate = bookingFormData.get('appointmentDate');
      const appointmentTime = bookingFormData.get('appointmentTime');

      if (!hospitalId || !departmentId || !appointmentDate || !appointmentTime) {
        toast.error('Please fill in all required fields');
        bookAppointmentBtn.disabled = false;
        bookAppointmentBtn.textContent = originalText;
        return;
      }

      // Combine date and time correctly
      const dateTime = new Date(`${appointmentDate}T${appointmentTime}`);
      
      // Validate date is in the future
      if (dateTime <= new Date()) {
        toast.error('Appointment date must be in the future');
        bookAppointmentBtn.disabled = false;
        bookAppointmentBtn.textContent = originalText;
        return;
      }
      
      // Get reason - if "other" is selected, combine with "other-specify" text
      let reason = document.getElementById('reason-for-visit')?.value || null;
      if (reason === 'other') {
        const otherSpecify = document.getElementById('other-specify')?.value?.trim();
        if (otherSpecify) {
          reason = `Other: ${otherSpecify}`;
        }
      }
      
      const response = await apiPost('/appointments', {
        hospitalId,
        departmentId,
        appointmentDate: dateTime.toISOString(),
        reason: reason,
      });

      if (response.status === 401) {
        toast.error('Session expired. Please log in again.');
        clearAuth();
        setTimeout(() => {
          window.location.href = '/login.html#login';
        }, 1500);
        bookAppointmentBtn.disabled = false;
        bookAppointmentBtn.textContent = originalText;
        return;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Handle overlap and conflict errors nicely (backend returns 400 for overlaps)
        if (response.status === 400 || response.status === 409) {
          throw new Error(result.message || 'This appointment time conflicts with an existing appointment. Please choose a different time.');
        }
        throw new Error(result.message || 'Failed to book appointment');
      }

      toast.success('Appointment booked successfully!');
      
      // Redirect to dashboard after 1.5 seconds
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);
    } catch (error) {
      console.error('Booking error:', error);
      toast.error(error.message || 'Failed to book appointment. Please try again.');
      
      // Re-enable button on error
      bookAppointmentBtn.disabled = false;
      bookAppointmentBtn.textContent = originalText;
    }
  });
}

// Hamburger menu toggle
const hamburgerMenu = document.getElementById('hamburger-menu');
const mobileNav = document.getElementById('mobile-nav');

if (hamburgerMenu && mobileNav) {
  hamburgerMenu.addEventListener('click', () => {
    hamburgerMenu.classList.toggle('active');
    mobileNav.classList.toggle('active');
    document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
  });
  
  // Close when clicking outside the nav
  document.addEventListener('click', (e) => {
    if (mobileNav.classList.contains('active') && 
        !mobileNav.contains(e.target) && 
        !hamburgerMenu.contains(e.target)) {
      hamburgerMenu.classList.remove('active');
      mobileNav.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

// Close mobile nav when clicking on a link
const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');
mobileNavLinks.forEach(link => {
  link.addEventListener('click', () => {
    hamburgerMenu?.classList.remove('active');
    mobileNav?.classList.remove('active');
    document.body.style.overflow = '';
    });
});

// Logo click handler - navigate to dashboard
const logoLink = document.getElementById('logo-link');
if (logoLink) {
  logoLink.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
}

// Initialize page
async function initialize() {
  await loadPatientData();
  await loadHospitals();
  updateAppointmentDetails();
}

// Load on page ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
