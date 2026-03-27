/**
 * Patient Feedback Page
 * Handles feedback submission and display
 */

'use strict';

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { displayAvatar } from '../../utils/avatar.js';

let selectedRating = 0;
let currentHospitalId = null;

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
    mobileNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        hamburgerMenu.classList.remove('active');
        mobileNav.classList.remove('active');
      });
    });

    // Close mobile nav when clicking outside
    document.addEventListener('click', e => {
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
 * Initialize star rating
 */
function initStarRating() {
  const stars = document.querySelectorAll('.star');
  const ratingInput = document.getElementById('rating-input');

  stars.forEach((star, index) => {
    star.addEventListener('click', () => {
      const rating = index + 1;
      selectedRating = rating;
      if (ratingInput) {
        ratingInput.value = rating;
      }

      // Update star display
      stars.forEach((s, i) => {
        if (i < rating) {
          s.classList.add('filled');
          s.classList.remove('active');
        } else {
          s.classList.remove('filled');
          s.classList.remove('active');
        }
      });
    });

    star.addEventListener('mouseenter', () => {
      const rating = index + 1;
      stars.forEach((s, i) => {
        if (i < rating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
  });

  // Reset on mouse leave
  const starRating = document.getElementById('star-rating');
  if (starRating) {
    starRating.addEventListener('mouseleave', () => {
      stars.forEach((s, i) => {
        if (i < selectedRating) {
          s.classList.add('filled');
          s.classList.remove('active');
        } else {
          s.classList.remove('filled');
          s.classList.remove('active');
        }
      });
    });
  }
}

/**
 * Load completed appointments for dropdown (excluding those with existing feedback)
 */
async function loadCompletedAppointments() {
  try {
    if (!isAuthenticated()) {
      return;
    }

    // Get completed appointments (backend already marks which have feedback)
    const appointmentsResponse = await apiGet(
      '/patient/appointments?status=COMPLETED'
    );

    if (!appointmentsResponse.ok) {
      throw new Error('Failed to load appointments');
    }

    const appointmentsResult = await appointmentsResponse.json();
    const appointments = appointmentsResult.data?.appointments || [];

    const select = document.getElementById('appointment-select');
    if (!select) return;

    // Clear existing options except the first one
    select.innerHTML =
      '<option value="">Select a completed appointment...</option>';

    if (appointments.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No completed appointments available';
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    // Get hospitalId from first appointment for feedback loading
    if (appointments.length > 0 && appointments[0].hospital?.id) {
      currentHospitalId = appointments[0].hospital.id;
    }

    // Filter out appointments that already have feedback
    const filteredAppointments = appointments.filter(apt => !apt.hasFeedback);

    if (filteredAppointments.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'All completed appointments have feedback';
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    // Populate dropdown with only appointments without feedback
    filteredAppointments.forEach(apt => {
      const option = document.createElement('option');
      option.value = apt.id;

      const date = new Date(apt.appointmentDate);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const departmentName = apt.department?.name || 'Department';

      option.textContent = `${dateStr} - ${departmentName}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading appointments:', error);
    toast.error('Failed to load appointments');
  }
}

/**
 * Filter out appointments that already have feedback
 */
function filterAppointmentsWithFeedback(appointmentIdsWithFeedback) {
  const select = document.getElementById('appointment-select');
  if (!select || !window.availableAppointments) return;

  // Remove options for appointments that have feedback
  Array.from(select.options).forEach(option => {
    if (option.value && appointmentIdsWithFeedback.has(option.value)) {
      option.remove();
    }
  });

  // If no options left (except the first placeholder), show message
  if (select.options.length === 1) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'All completed appointments have feedback';
    option.disabled = true;
    select.appendChild(option);
  }
}

/**
 * Load hospital feedback
 */
async function loadHospitalFeedback() {
  try {
    // Get hospitalId from user's appointments or URL
    if (!currentHospitalId) {
      // Try to get from dashboard
      if (isAuthenticated()) {
        const response = await apiGet('/patient/dashboard');
        if (response.ok) {
          const result = await response.json();
          const currentQueue = result.data?.currentQueue;
          const appointments = result.data?.upcomingAppointments || [];

          if (currentQueue && currentQueue.hospitalId) {
            currentHospitalId = currentQueue.hospitalId;
          } else if (appointments.length > 0 && appointments[0].hospital?.id) {
            currentHospitalId = appointments[0].hospital.id;
          }
        }
      }
    }

    if (!currentHospitalId) {
      const container = document.getElementById('feedback-carousel-container');
      if (container) {
        container.innerHTML =
          '<div class="empty-state">Unable to determine hospital</div>';
      }
      const controls = document.getElementById('carousel-controls');
      if (controls) {
        controls.style.display = 'none';
      }
      return;
    }

    const response = await apiGet(`/feedback/hospital/${currentHospitalId}`);
    if (!response.ok) {
      throw new Error('Failed to load feedback');
    }

    const result = await response.json();
    const feedbacks = result.data || [];

    renderFeedbackCarousel(feedbacks);
  } catch (error) {
    console.error('Error loading feedback:', error);
    const container = document.getElementById('feedback-carousel-container');
    if (container) {
      container.innerHTML =
        '<div class="empty-state">Failed to load feedback</div>';
    }
    const controls = document.getElementById('carousel-controls');
    if (controls) {
      controls.style.display = 'none';
    }
  }
}

let currentFeedbackIndex = 0;
let feedbacksData = [];

/**
 * Render feedback carousel
 */
function renderFeedbackCarousel(feedbacks) {
  const container = document.getElementById('feedback-carousel-container');
  const controls = document.getElementById('carousel-controls');
  if (!container) return;

  feedbacksData = feedbacks;

  if (feedbacks.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No feedback available</div>';
    if (controls) controls.style.display = 'none';
    return;
  }

  // Show controls if there's more than one feedback
  if (controls) {
    controls.style.display = feedbacks.length > 1 ? 'flex' : 'none';
  }

  // Render all feedback items
  container.innerHTML = feedbacks
    .map(feedback => {
      const date = new Date(feedback.date);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      // Format doctor name
      let doctorName = 'N/A';
      if (feedback.doctorName) {
        doctorName = feedback.doctorName.startsWith('Dr. ')
          ? feedback.doctorName
          : `Dr. ${feedback.doctorName}`;
      }

      // Create star display
      const stars = Array(5)
        .fill(0)
        .map((_, i) => {
          const isFilled = i < feedback.rating;
          return `<span class="feedback-star ${isFilled ? '' : 'empty'}">★</span>`;
        })
        .join('');

      return `
        <div class="feedback-item">
          <div class="feedback-item-header">
            <div class="feedback-item-patient">${feedback.patientName}</div>
            <div class="feedback-item-rating">${stars}</div>
          </div>
          <div class="feedback-item-date">${dateStr} - ${feedback.departmentName}</div>
          <div class="feedback-item-doctor">${doctorName}</div>
          ${feedback.comment ? `<div class="feedback-item-comment">${feedback.comment}</div>` : ''}
        </div>
      `;
    })
    .join('');

  // Set initial position
  currentFeedbackIndex = 0;
  updateCarouselPosition();
  updateCarouselControls();
}

/**
 * Update carousel position
 */
function updateCarouselPosition() {
  const container = document.getElementById('feedback-carousel-container');
  if (!container) return;

  const translateX = -currentFeedbackIndex * 100;
  container.style.transform = `translateX(${translateX}%)`;
}

/**
 * Update carousel controls (buttons and indicator)
 */
function updateCarouselControls() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const indicator = document.getElementById('carousel-indicator');

  if (prevBtn) {
    prevBtn.disabled = currentFeedbackIndex === 0;
  }

  if (nextBtn) {
    nextBtn.disabled = currentFeedbackIndex >= feedbacksData.length - 1;
  }

  if (indicator) {
    indicator.textContent = `${currentFeedbackIndex + 1} / ${feedbacksData.length}`;
  }
}

/**
 * Initialize carousel controls
 */
function initCarouselControls() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentFeedbackIndex > 0) {
        currentFeedbackIndex--;
        updateCarouselPosition();
        updateCarouselControls();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentFeedbackIndex < feedbacksData.length - 1) {
        currentFeedbackIndex++;
        updateCarouselPosition();
        updateCarouselControls();
      }
    });
  }
}

/**
 * Handle form submission
 */
async function handleSubmit(e) {
  e.preventDefault();

  const ratingInput = document.getElementById('rating-input');
  const appointmentSelect = document.getElementById('appointment-select');
  const commentTextarea = document.getElementById('comment');
  const submitBtn = document.getElementById('submit-btn');

  if (!ratingInput || !appointmentSelect || !commentTextarea || !submitBtn) {
    return;
  }

  const rating = parseInt(ratingInput.value, 10);
  const appointmentId = appointmentSelect.value;
  const comment = commentTextarea.value.trim();

  // Validate
  if (!rating || rating < 1 || rating > 5) {
    toast.error('Please select a rating');
    return;
  }

  if (!appointmentId) {
    toast.error('Please select an appointment');
    return;
  }

  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await apiPost('/patient/feedback', {
      appointmentId,
      rating,
      comment: comment || null,
    });

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to submit feedback');
    }

    toast.success('Feedback submitted successfully!');

    // Reset form
    selectedRating = 0;
    ratingInput.value = '';
    appointmentSelect.value = '';
    commentTextarea.value = '';

    // Reset stars
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
      star.classList.remove('filled', 'active');
    });

    // Remove the submitted appointment from dropdown
    // appointmentSelect is already declared above, so we can use it directly
    const submittedOption = appointmentSelect.querySelector(
      `option[value="${appointmentId}"]`
    );
    if (submittedOption) {
      submittedOption.remove();
    }

    // If no options left, show message
    if (appointmentSelect.options.length === 1) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'All completed appointments have feedback';
      option.disabled = true;
      appointmentSelect.appendChild(option);
    }

    // Reload appointments and feedback
    await loadCompletedAppointments();
    await loadHospitalFeedback();
  } catch (error) {
    console.error('Error submitting feedback:', error);
    toast.error(
      error.message || 'Failed to submit feedback. Please try again.'
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

/**
 * Initialize page
 */
async function initPage() {
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
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
          : 'U';
        userInitial.textContent = initials;
      }
    }
  } else {
    // Redirect to login if not authenticated
    toast.error('Please log in to access feedback');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1500);
    return;
  }

  // Initialize mobile navigation
  initMobileNav();

  // Initialize star rating
  initStarRating();

  // Initialize carousel controls
  initCarouselControls();

  // Set up form submission
  const form = document.getElementById('feedback-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  // Load data
  await loadCompletedAppointments();
  await loadHospitalFeedback();
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
