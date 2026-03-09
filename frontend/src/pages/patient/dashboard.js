/**
 * Patient Dashboard
 * Fetches and displays patient dashboard data matching Figma design
 */

'use strict';

import { io } from 'socket.io-client';
import { apiGet, apiPatch, apiDelete, getApiBaseUrl } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { confirmCancelAppointment, confirmCancelQueue, showConfirmModal } from '../../utils/modal.js';
import { displayAvatar } from '../../utils/avatar.js';

// Check authentication first
if (!isAuthenticated()) {
  toast.error('Please log in to access the dashboard');
  window.location.href = '/login.html';
}

// Get user data
const user = getAuthUser();

// Display user name and initial
const userNameElement = document.getElementById('user-name');
const userInitialElement = document.getElementById('user-initial');
const greetingElement = document.getElementById('greeting');
const userProfileElement = document.getElementById('user-profile');

if (user) {
  let displayName = 'User';
  
  // Patient has fullName, staff has firstName + lastName
  if (user.fullName) {
    displayName = user.fullName.split(' ')[0]; // First name only for greeting
  } else if (user.firstName && user.lastName) {
    displayName = user.firstName;
  } else if (user.email) {
    displayName = user.email.split('@')[0];
  }
  
  if (userNameElement) userNameElement.textContent = displayName;
  
  // Display avatar in header
  if (userProfileElement) {
    displayAvatar(userProfileElement, user.avatarUrl, user.fullName);
  }
  
  // Fallback for initial element if avatar not available
  if (userInitialElement && !user.avatarUrl) {
    const initial = user.fullName
      ? user.fullName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'U';
    userInitialElement.textContent = initial;
  }
  
  // Make profile clickable
  if (userProfileElement) {
    userProfileElement.style.cursor = 'pointer';
    userProfileElement.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
  }
}

/**
 * Format date for display (e.g., "June 14, 2025")
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
function formatTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format estimated wait time (e.g., "4 mins")
 */
function formatWaitTime(minutes) {
  if (minutes === null || minutes === undefined) return 'Calculating...';
  if (minutes < 1) return '< 1 min';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${Math.round(minutes)} mins`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  return formatDate(dateString);
}

/**
 * Render current queue card
 */
function renderCurrentQueue(queueData) {
  const queueCard = document.getElementById('queue-card');
  const queueNumber = document.getElementById('queue-number');
  const queueEta = document.getElementById('queue-eta');
  
  if (!queueData) {
    if (queueCard) queueCard.style.display = 'none';
    return;
  }

  if (!queueCard || !queueNumber || !queueEta) return;

  queueCard.style.display = 'block';
  
  // Display queue number (e.g., "C-012")
  queueNumber.textContent = queueData.ticketNumber || '-';
  
  // Use backend wait time: waitTimeDisplay (Now Serving, Next, Preparing, X mins, Ready now, >120 mins) or format estimatedWaitMinutes
  const etaDisplay = queueData.waitTimeDisplay
    || (queueData.estimatedWaitMinutes != null ? formatWaitTime(queueData.estimatedWaitMinutes) : 'Calculating...');
  queueEta.textContent = etaDisplay;
}

/**
 * Render upcoming appointments
 */
function renderAppointments(appointments) {
  const appointmentsList = document.getElementById('appointments-list');
  if (!appointmentsList) return;

  if (!appointments || appointments.length === 0) {
    appointmentsList.innerHTML = '<div class="empty-state">No upcoming appointments</div>';
    return;
  }

  // Show only the 3 nearest upcoming appointments on dashboard
  const nearestAppointments = appointments.slice(0, 3);

  const fragment = document.createDocumentFragment();
  
  nearestAppointments.forEach((apt) => {
    const appointmentCard = document.createElement('div');
    appointmentCard.className = 'appointment-card';
    
    // Extract doctor name if assigned, otherwise don't show
    const doctorName = apt.assignedDoctor?.lastName || null;
    const departmentName = apt.department?.name || 'Department';
    
    // Format date and time
    const appointmentDate = formatDate(apt.appointmentDate);
    const appointmentTime = formatTime(apt.appointmentDate);
    
    appointmentCard.innerHTML = `
      <div class="appointment-date-section">
        <div class="appointment-date">${appointmentDate}</div>
        ${doctorName ? `<div class="appointment-doctor">${doctorName}</div>` : ''}
      </div>
      <div class="appointment-details">
        <div class="appointment-detail">${appointmentTime}</div>
        <div class="appointment-detail">${departmentName}</div>
      </div>
      <div class="appointment-actions">
        ${apt.status === 'BOOKED' ? `
          <a href="#" class="appointment-link reschedule" data-appointment-id="${apt.id}">Reschedule</a>
          <a href="#" class="appointment-link cancel" data-appointment-id="${apt.id}">Cancel</a>
        ` : ''}
      </div>
    `;
    
    // Add event listeners for actions
    const rescheduleLink = appointmentCard.querySelector('.reschedule');
    const cancelLink = appointmentCard.querySelector('.cancel');
    
    if (rescheduleLink) {
      rescheduleLink.addEventListener('click', (e) => {
        e.preventDefault();
        handleReschedule(apt.id);
      });
    }
    
    if (cancelLink) {
      cancelLink.addEventListener('click', (e) => {
        e.preventDefault();
        handleCancel(apt.id);
      });
    }
    
    fragment.appendChild(appointmentCard);
  });

  appointmentsList.innerHTML = '';
  appointmentsList.appendChild(fragment);
}

/**
 * Get category icon and color
 */
function getCategoryInfo(category) {
  const categories = {
    APPOINTMENT: { icon: 'event', color: '#3b82f6' },
    QUEUE: { icon: 'person', color: '#10b981' },
    FEEDBACK: { icon: 'chat_bubble', color: '#f59e0b' },
    ANNOUNCEMENT: { icon: 'campaign', color: '#8b5cf6' },
  };
  return categories[category] || { icon: 'notifications', color: '#6b7280' };
}

/**
 * Get unread count
 */
function getUnreadCount(notifications) {
  if (!notifications || notifications.length === 0) return 0;
  return notifications.filter(n => !n.isRead).length;
}

/**
 * Render notifications with categories, badges, and actions
 */
function renderNotifications(notifications) {
  const notificationsList = document.getElementById('notifications-list');
  const notificationBadge = document.getElementById('notification-badge');
  if (!notificationsList) return;

  // Update badge count
  const unreadCount = getUnreadCount(notifications);
  if (notificationBadge) {
    if (unreadCount > 0) {
      notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      notificationBadge.style.display = 'flex';
    } else {
      notificationBadge.style.display = 'none';
    }
  }

  if (!notifications || notifications.length === 0) {
    notificationsList.innerHTML = '<div class="empty-state">No notifications</div>';
    return;
  }

  // Group notifications by category
  const grouped = notifications.reduce((acc, notif) => {
    const category = notif.category || 'ANNOUNCEMENT';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(notif);
    return acc;
  }, {});

  const fragment = document.createDocumentFragment();
  
  // Render each category
  Object.keys(grouped).forEach((category) => {
    const categoryInfo = getCategoryInfo(category);
    const categoryNotifications = grouped[category];

    // Category header
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'notification-category-header';
    categoryHeader.innerHTML = `
      <div class="category-icon" style="color: ${categoryInfo.color}">
        <span class="material-symbols-outlined">${categoryInfo.icon}</span>
      </div>
      <span class="category-name">${category}</span>
      <span class="category-count">${categoryNotifications.length}</span>
    `;
    fragment.appendChild(categoryHeader);

    // Notifications in this category
    categoryNotifications.forEach((notif) => {
      const notificationItem = document.createElement('div');
      notificationItem.className = `notification-item ${notif.isRead ? 'read' : 'unread'}`;
      notificationItem.dataset.notificationId = notif.id;
      
      notificationItem.innerHTML = `
        <div class="notification-dot ${notif.isRead ? '' : 'unread-dot'}" style="background-color: ${categoryInfo.color}"></div>
        <div class="notification-content">
          <div class="notification-text">${notif.title || notif.content || 'Notification'}</div>
          <div class="notification-time">${formatRelativeTime(notif.createdAt)}</div>
        </div>
        ${!notif.isRead ? '<button class="mark-read-btn" title="Mark as read"><span class="material-symbols-outlined">check</span></button>' : ''}
      `;
      
      // Add click handler to mark as read
      if (!notif.isRead) {
        const markReadBtn = notificationItem.querySelector('.mark-read-btn');
        if (markReadBtn) {
          markReadBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await markNotificationAsRead(notif.id, notificationItem);
          });
        }
      }

      // Click on notification item to mark as read
      notificationItem.addEventListener('click', async () => {
        if (!notif.isRead) {
          await markNotificationAsRead(notif.id, notificationItem);
        }
      });

      fragment.appendChild(notificationItem);
    });
  });

  notificationsList.innerHTML = '';
  notificationsList.appendChild(fragment);
}

/**
 * Mark notification as read
 */
async function markNotificationAsRead(notificationId, element) {
  try {
    const response = await apiPatch(`/patient/notifications/${notificationId}/read`, {});

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (response.ok && result.success) {
      // Update UI
      if (element) {
        element.classList.remove('unread');
        element.classList.add('read');
        const dot = element.querySelector('.notification-dot');
        if (dot) {
          dot.classList.remove('unread-dot');
        }
        const markReadBtn = element.querySelector('.mark-read-btn');
        if (markReadBtn) {
          markReadBtn.remove();
        }
      }
      // Reload notifications to update badge
      await loadDashboard();
    } else {
      toast.error(result.message || 'Failed to mark notification as read');
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    toast.error('Failed to mark notification as read');
  }
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsAsRead() {
  try {
    const response = await apiPatch('/patient/notifications/read-all', {});

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (response.ok && result.success) {
      toast.success(result.message || 'All notifications marked as read');
      await loadDashboard();
    } else {
      toast.error(result.message || 'Failed to mark all notifications as read');
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    toast.error('Failed to mark all notifications as read');
  }
}

/**
 * Clear all read notifications
 */
async function clearAllReadNotifications() {
  try {
    const response = await apiDelete('/patient/notifications/clear-all');

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (response.ok && result.success) {
      toast.success(result.message || 'Read notifications cleared');
      await loadDashboard();
    } else {
      toast.error(result.message || 'Failed to clear notifications');
    }
  } catch (error) {
    console.error('Error clearing notifications:', error);
    toast.error('Failed to clear notifications');
  }
}

/**
 * Handle reschedule appointment
 */
async function handleReschedule(appointmentId) {
  // Find the appointment to get current date
  const appointments = await getAppointmentsForReschedule(appointmentId);
  if (!appointments || appointments.length === 0) {
    toast.error('Appointment not found');
    return;
  }

  const appointment = appointments[0];
  openRescheduleModal(appointmentId, appointment.appointmentDate);
}

/**
 * Get appointment data for reschedule
 */
async function getAppointmentsForReschedule(appointmentId) {
  try {
    const response = await apiGet('/patient/appointments');
    if (!response.ok) {
      throw new Error('Failed to fetch appointments');
    }
    const result = await response.json();
    return result.data?.appointments?.filter(apt => apt.id === appointmentId) || [];
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }
}

/**
 * Open reschedule modal
 */
function openRescheduleModal(appointmentId, currentDate) {
  const modal = document.getElementById('reschedule-modal-overlay');
  const datetimeInput = document.getElementById('reschedule-datetime-input');
  const cancelBtn = document.getElementById('reschedule-cancel-btn');
  const submitBtn = document.getElementById('reschedule-submit-btn');

  if (!modal || !datetimeInput || !cancelBtn || !submitBtn) {
    toast.error('Reschedule modal elements not found');
    return;
  }

  // Set current date as default value (format: YYYY-MM-DDTHH:mm)
  const date = new Date(currentDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  datetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;

  // Set minimum date to now (prevent past dates)
  const now = new Date();
  const minYear = now.getFullYear();
  const minMonth = String(now.getMonth() + 1).padStart(2, '0');
  const minDay = String(now.getDate()).padStart(2, '0');
  const minHours = String(now.getHours()).padStart(2, '0');
  const minMinutes = String(now.getMinutes()).padStart(2, '0');
  datetimeInput.min = `${minYear}-${minMonth}-${minDay}T${minHours}:${minMinutes}`;

  // Show modal
  modal.style.display = 'flex';

  // Remove existing event listeners by cloning elements
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  
  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

  // Close modal handlers
  const closeModal = () => {
    modal.style.display = 'none';
  };

  newCancelBtn.addEventListener('click', closeModal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Submit handler
  newSubmitBtn.addEventListener('click', async () => {
    await submitReschedule(appointmentId, datetimeInput.value, closeModal);
  });

  // Submit on Enter key in input
  datetimeInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await submitReschedule(appointmentId, datetimeInput.value, closeModal);
    }
  });
}

/**
 * Submit reschedule request
 */
async function submitReschedule(appointmentId, newDateTime, closeModal) {
  if (!appointmentId || !newDateTime) {
    toast.error('Please select a date and time');
    return;
  }

  // Convert datetime-local to ISO string
  const date = new Date(newDateTime);
  if (isNaN(date.getTime())) {
    toast.error('Invalid date format');
    return;
  }

  const submitBtn = document.getElementById('reschedule-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Rescheduling...';
  }

  try {
    const response = await apiPatch(`/appointments/${appointmentId}/reschedule`, {
      appointmentDate: date.toISOString(),
    });

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to reschedule appointment');
    }

    toast.success('Appointment rescheduled successfully.');

    // Close modal
    closeModal();

    // Reload dashboard
    await loadDashboard();
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    toast.error(error.message || 'Failed to reschedule appointment');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reschedule';
    }
  }
}

/**
 * Handle cancel appointment
 */
async function handleCancel(appointmentId) {
  const confirmed = await confirmCancelAppointment();
  if (!confirmed) {
    return;
  }

  try {
    const response = await apiPatch(`/appointments/${appointmentId}/cancel`, {});
    
    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to cancel appointment');
    }

    toast.success('Appointment cancelled successfully');
    
    // Reload dashboard
    await loadDashboard();
  } catch (error) {
    console.error('Cancel appointment error:', error);
    toast.error(error.message || 'Failed to cancel appointment. Please try again.');
  }
}

/**
 * Load dashboard data
 */
async function loadDashboard() {
  try {
    const response = await apiGet('/patient/dashboard');
    
    // Handle 401 - redirect to login
    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to load dashboard');
    }

    const data = result.data || {};

    const hospitalId = data.currentQueue?.hospitalId
      || data.upcomingAppointments?.[0]?.hospital?.id;
    if (hospitalId) ensurePatientQueueSocket(hospitalId);

    renderCurrentQueue(data.currentQueue);
    renderAppointments(data.upcomingAppointments || []);
    renderNotifications(data.notifications || []);

  } catch (error) {
    console.error('Dashboard load error:', error);
    
    // Handle 401 errors
    if (error.message?.includes('401') || error.message?.includes('expired')) {
        toast.error('Session expired. Please log in again.');
        clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    toast.error(error.message || 'Failed to load dashboard. Please try again.');
  }
}

// Event Listeners

// View Queue button
const viewQueueBtn = document.getElementById('view-queue-btn');
if (viewQueueBtn) {
  viewQueueBtn.addEventListener('click', async () => {
    try {
      // Get hospitalId from current queue or appointments
      const response = await apiGet('/patient/dashboard');
      if (!response.ok) {
        throw new Error('Failed to get hospital information');
      }
      
      const result = await response.json();
      const currentQueue = result.data?.currentQueue;
      const appointments = result.data?.upcomingAppointments || [];
      
      let hospitalId = null;
      
      // Try to get hospitalId from current queue
      if (currentQueue && currentQueue.hospitalId) {
        hospitalId = currentQueue.hospitalId;
      } 
      // Otherwise, try to get from most recent appointment
      else if (appointments.length > 0 && appointments[0].hospital?.id) {
        hospitalId = appointments[0].hospital.id;
      }
      
      if (hospitalId) {
        window.location.href = `queue-status.html?hospitalId=${hospitalId}`;
      } else {
        toast.error('Unable to determine hospital. Please select a hospital.');
        // Fallback: navigate without hospitalId (page will handle it)
        window.location.href = 'queue-status.html';
      }
    } catch (error) {
      console.error('Error navigating to queue status:', error);
      toast.error('Failed to load queue status');
      // Fallback: navigate without hospitalId
      window.location.href = 'queue-status.html';
    }
  });
}

// Cancel Queue button
const cancelQueueBtn = document.getElementById('cancel-queue-btn');
if (cancelQueueBtn) {
  cancelQueueBtn.addEventListener('click', async () => {
    const confirmed = await confirmCancelQueue();
    if (!confirmed) {
      return;
    }
    // TODO: Implement queue cancellation
    toast.info('Queue cancellation coming soon');
  });
}

// Live Queue Preview button
const liveQueueBtn = document.getElementById('live-queue-btn');
if (liveQueueBtn) {
  liveQueueBtn.addEventListener('click', async () => {
    try {
      // Get hospitalId from current queue or appointments
      const response = await apiGet('/patient/dashboard');
      if (!response.ok) {
        throw new Error('Failed to get hospital information');
      }
      
      const result = await response.json();
      const currentQueue = result.data?.currentQueue;
      const appointments = result.data?.upcomingAppointments || [];
      
      let hospitalId = null;
      
      // Try to get hospitalId from current queue
      if (currentQueue && currentQueue.hospitalId) {
        hospitalId = currentQueue.hospitalId;
      } 
      // Otherwise, try to get from most recent appointment
      else if (appointments.length > 0 && appointments[0].hospital?.id) {
        hospitalId = appointments[0].hospital.id;
      }
      
      if (hospitalId) {
        window.location.href = `queue-status.html?hospitalId=${hospitalId}`;
      } else {
        toast.error('Unable to determine hospital. Please select a hospital.');
        // Fallback: navigate without hospitalId (page will handle it)
        window.location.href = 'queue-status.html';
      }
    } catch (error) {
      console.error('Error navigating to queue status:', error);
      toast.error('Failed to load queue status');
      // Fallback: navigate without hospitalId
      window.location.href = 'queue-status.html';
    }
  });
}

// Book Appointment button
const bookAppointmentBtn = document.getElementById('book-appointment-btn');
if (bookAppointmentBtn) {
  bookAppointmentBtn.addEventListener('click', () => {
    window.location.href = 'book-appointment.html';
  });
}

/**
 * Load email notification preferences
 */
async function loadEmailNotificationPreferences() {
  try {
    const response = await apiGet('/patient/notification-preferences');
    
    if (response.status === 401) {
      // Not authenticated, skip
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to load notification preferences');
    }

    const result = await response.json();
    if (result.success && result.data) {
      const emailToggle = document.getElementById('email-toggle');
      if (emailToggle) {
        // Set toggle state based on preference
        if (result.data.emailNotificationsEnabled) {
          emailToggle.classList.add('active');
        } else {
          emailToggle.classList.remove('active');
        }
      }
    }
  } catch (error) {
    console.error('Error loading email notification preferences:', error);
    // Don't show error toast, just use default (enabled)
  }
}

/**
 * Save email notification preferences
 */
async function saveEmailNotificationPreferences(emailNotificationsEnabled) {
  try {
    const response = await apiPatch('/patient/notification-preferences', {
      emailNotificationsEnabled,
    });

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return false;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to save notification preferences');
    }

    return true;
  } catch (error) {
    console.error('Error saving email notification preferences:', error);
    toast.error(error.message || 'Failed to save notification preferences');
    return false;
  }
}

// Email toggle
const emailToggle = document.getElementById('email-toggle');
if (emailToggle) {
  // Load initial state from API
  loadEmailNotificationPreferences();
  
  emailToggle.addEventListener('click', async () => {
    const wasActive = emailToggle.classList.contains('active');
    const newState = !wasActive;
    
    // Optimistically update UI
    if (newState) {
      emailToggle.classList.add('active');
    } else {
      emailToggle.classList.remove('active');
    }
    
    // Save to backend
    const success = await saveEmailNotificationPreferences(newState);
    
    if (!success) {
      // Revert UI state on error
      if (wasActive) {
        emailToggle.classList.add('active');
      } else {
        emailToggle.classList.remove('active');
      }
    } else {
      toast.success(`Email notifications ${newState ? 'enabled' : 'disabled'}`);
    }
  });
}

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

// Notification action buttons
const markAllReadBtn = document.getElementById('mark-all-read-btn');
if (markAllReadBtn) {
  markAllReadBtn.addEventListener('click', async () => {
    await markAllNotificationsAsRead();
  });
}

const clearAllBtn = document.getElementById('clear-all-btn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
      title: 'Clear Read Notifications',
      message: 'Are you sure you want to clear all read notifications? This action cannot be undone.',
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      confirmColor: 'red',
    });
    if (confirmed) {
      await clearAllReadNotifications();
    }
  });
}

let patientQueueSocket = null;

function ensurePatientQueueSocket(hospitalId) {
  if (!hospitalId || patientQueueSocket) return;
  const socketUrl = new URL(getApiBaseUrl()).origin;
  patientQueueSocket = io(socketUrl);
  patientQueueSocket.emit('joinHospital', hospitalId);
  patientQueueSocket.on('queue:update', () => {
    loadDashboard();
  });
}

// Load dashboard on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    loadDashboard();
    loadEmailNotificationPreferences();
  });
} else {
  initMobileNav();
  loadDashboard();
  loadEmailNotificationPreferences();
}
