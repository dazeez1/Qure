/**
 * Patient Feedback Page
 * Handles feedback submission and display (aligned with mobile: hospital scope,
 * completed visits only, sufficient page limit, distinct dropdown labels).
 */

'use strict';

import { apiGet, apiPost } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { displayAvatar } from '../../utils/avatar.js';

let selectedRating = 0;
/** Resolved hospital for carousel + scoped completed appointments (matches app logic). */
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
 * Same resolution order as the mobile app: queue/dashboard hospital, else a single
 * hospital from upcoming (BOOKED) list.
 */
async function resolveFeedbackHospitalId() {
  try {
    const response = await apiGet('/patient/dashboard');
    if (response.ok) {
      const result = await response.json();
      const data = result.data;
      if (data?.currentQueue?.hospitalId) {
        return data.currentQueue.hospitalId;
      }
      const upcoming = data?.upcomingAppointments || [];
      for (const a of upcoming) {
        if (a.hospital?.id) {
          return a.hospital.id;
        }
      }
    }
  } catch (e) {
    console.error('resolveFeedbackHospitalId dashboard:', e);
  }

  try {
    const r = await apiGet('/patient/appointments?page=1&limit=40');
    if (!r.ok) {
      return null;
    }
    const result = await r.json();
    const appointments = result.data?.appointments || [];
    const ids = new Set(
      appointments.map((apt) => apt.hospital?.id).filter(Boolean),
    );
    if (ids.size === 1) {
      return [...ids][0];
    }
  } catch (e) {
    console.error('resolveFeedbackHospitalId bookings:', e);
  }

  return null;
}

function uniqueAppointmentsById(appointments) {
  const seen = new Set();
  return appointments.filter((a) => {
    if (!a.id || seen.has(a.id)) {
      return false;
    }
    seen.add(a.id);
    return true;
  });
}

/**
 * Date + time + department (matches mobile Feedback dropdown).
 */
function formatAppointmentOptionText(apt) {
  const date = new Date(apt.appointmentDate);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) {
    h = 12;
  }
  const dept = apt.department?.name || 'Visit';
  return `${dateStr} · ${h}:${m} ${ampm} · ${dept}`;
}

/**
 * Load completed appointments for dropdown (excluding those with existing feedback).
 * Uses hospitalId when known; requests enough rows (limit 50) like the mobile app.
 */
async function loadCompletedAppointments() {
  try {
    if (!isAuthenticated()) {
      return;
    }

    const params = new URLSearchParams({
      status: 'COMPLETED',
      page: '1',
      limit: '50',
    });
    if (currentHospitalId) {
      params.set('hospitalId', currentHospitalId);
    }

    const appointmentsResponse = await apiGet(
      `/patient/appointments?${params.toString()}`,
    );

    if (!appointmentsResponse.ok) {
      throw new Error('Failed to load appointments');
    }

    const appointmentsResult = await appointmentsResponse.json();
    const appointments = appointmentsResult.data?.appointments || [];

    const select = document.getElementById('appointment-select');
    if (!select) {
      return;
    }

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

    let filtered = appointments.filter((apt) => !apt.hasFeedback);
    filtered = uniqueAppointmentsById(filtered);
    filtered.sort(
      (a, b) =>
        new Date(b.appointmentDate) - new Date(a.appointmentDate),
    );

    if (filtered.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'All completed appointments have feedback';
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    filtered.forEach((apt) => {
      const option = document.createElement('option');
      option.value = apt.id;
      option.textContent = formatAppointmentOptionText(apt);
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading appointments:', error);
    toast.error('Failed to load appointments');
  }
}

/**
 * Load hospital feedback carousel
 */
async function loadHospitalFeedback() {
  try {
    if (!currentHospitalId) {
      const container = document.getElementById('feedback-carousel-container');
      if (container) {
        container.innerHTML =
          '<div class="empty-state">Patient reviews will appear here once your hospital is known (e.g. from an upcoming visit or queue).</div>';
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
    const feedbacks = Array.isArray(result.data) ? result.data : [];

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
  if (!container) {
    return;
  }

  feedbacksData = feedbacks;

  if (feedbacks.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No feedback available yet for this hospital.</div>';
    if (controls) {
      controls.style.display = 'none';
    }
    return;
  }

  if (controls) {
    controls.style.display = feedbacks.length > 1 ? 'flex' : 'none';
  }

  container.innerHTML = feedbacks
    .map((feedback) => {
      const date = new Date(feedback.date);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      let doctorName = 'N/A';
      if (feedback.doctorName) {
        doctorName = feedback.doctorName.startsWith('Dr. ')
          ? feedback.doctorName
          : `Dr. ${feedback.doctorName}`;
      }

      const stars = Array(5)
        .fill(0)
        .map((_, i) => {
          const isFilled = i < feedback.rating;
          return `<span class="feedback-star ${isFilled ? '' : 'empty'}">★</span>`;
        })
        .join('');

      const dept = feedback.departmentName || '—';

      return `
        <div class="feedback-item">
          <div class="feedback-item-header">
            <div class="feedback-item-patient">${feedback.patientName}</div>
            <div class="feedback-item-rating">${stars}</div>
          </div>
          <div class="feedback-item-date">${dateStr} - ${dept}</div>
          <div class="feedback-item-doctor">${doctorName}</div>
          ${feedback.comment ? `<div class="feedback-item-comment">${feedback.comment}</div>` : ''}
        </div>
      `;
    })
    .join('');

  currentFeedbackIndex = 0;
  updateCarouselPosition();
  updateCarouselControls();
}

function updateCarouselPosition() {
  const container = document.getElementById('feedback-carousel-container');
  if (!container) {
    return;
  }

  const translateX = -currentFeedbackIndex * 100;
  container.style.transform = `translateX(${translateX}%)`;
}

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

  if (!rating || rating < 1 || rating > 5) {
    toast.error('Please select a rating');
    return;
  }

  if (!appointmentId) {
    toast.error('Please select an appointment');
    return;
  }

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

    selectedRating = 0;
    ratingInput.value = '';
    appointmentSelect.value = '';
    commentTextarea.value = '';

    const stars = document.querySelectorAll('.star');
    stars.forEach((star) => {
      star.classList.remove('filled', 'active');
    });

    const submittedOption = appointmentSelect.querySelector(
      `option[value="${appointmentId}"]`,
    );
    if (submittedOption) {
      submittedOption.remove();
    }

    if (appointmentSelect.options.length === 1) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'All completed appointments have feedback';
      option.disabled = true;
      appointmentSelect.appendChild(option);
    }

    currentHospitalId = await resolveFeedbackHospitalId();
    await loadCompletedAppointments();
    await loadHospitalFeedback();
  } catch (error) {
    console.error('Error submitting feedback:', error);
    toast.error(error.message || 'Failed to submit feedback. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

/**
 * Initialize page
 */
async function initPage() {
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
    toast.error('Please log in to access feedback');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1500);
    return;
  }

  initMobileNav();
  initStarRating();
  initCarouselControls();

  const form = document.getElementById('feedback-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  currentHospitalId = await resolveFeedbackHospitalId();
  await loadCompletedAppointments();
  await loadHospitalFeedback();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
