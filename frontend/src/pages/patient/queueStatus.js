/**
 * Queue Status Page
 * Real-time queue tracking with auto-refresh every 10 seconds
 */

'use strict';

import { apiGet } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { displayAvatar } from '../../utils/avatar.js';

let refreshInterval = null;
let lastUpdateTime = null;
let currentPatientId = null;
let currentHospitalId = null;

// Get hospitalId from URL params or patient's active queue entry
async function getHospitalId() {
  // Check URL params first
  const urlParams = new URLSearchParams(window.location.search);
  const hospitalIdFromUrl = urlParams.get('hospitalId');
  
  if (hospitalIdFromUrl) {
    return hospitalIdFromUrl;
  }

  // If patient is logged in, try to get hospitalId from their active queue entry
  if (isAuthenticated()) {
    try {
      const user = getAuthUser();
      if (user && user.id) {
        currentPatientId = user.id;
        
        // Try to get hospitalId from patient's active queue entry
        const response = await apiGet('/patient/dashboard');
        if (response.ok) {
          const result = await response.json();
          const currentQueue = result.data?.currentQueue;
          if (currentQueue && currentQueue.hospitalId) {
            return currentQueue.hospitalId;
          }
          
          // If no active queue, try to get from most recent appointment
          const appointments = result.data?.upcomingAppointments || [];
          if (appointments.length > 0 && appointments[0].hospital?.id) {
            return appointments[0].hospital.id;
          }
          
          // Also try to get from any appointment's hospitalId
          for (const apt of appointments) {
            if (apt.hospital?.id) {
              return apt.hospital.id;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting hospitalId from patient data:', error);
    }
  }

  // Default: return null and show error
  return null;
}

/**
 * Format wait time in minutes to human-readable string
 */
function formatWaitTime(minutes) {
  if (!minutes || minutes === 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (mins === 0) {
    return `${hours}hr${hours > 1 ? 's' : ''}`;
  }
  
  return `${hours}hr ${mins} minutes`;
}

/**
 * Get status badge class and text
 */
function getStatusDisplay(status, estimatedWait) {
  switch (status) {
    case 'IN_CONSULTATION':
      return {
        class: 'now-serving',
        text: 'Now Serving',
      };
    case 'CALLED':
      return {
        class: 'next',
        text: 'Next',
      };
    case 'TRIAGE':
      return {
        class: 'waiting',
        text: 'Processing',
      };
    case 'WAITING':
      return {
        class: 'waiting',
        text: 'Waiting',
      };
    default:
      return {
        class: 'waiting',
        text: status,
      };
  }
}

/**
 * Get waiting time display text
 */
function getWaitingTimeDisplay(status, estimatedWait) {
  if (status === 'WAITING' && estimatedWait) {
    return formatWaitTime(estimatedWait);
  } else if (status === 'IN_CONSULTATION') {
    return 'In Progress';
  } else if (status === 'CALLED') {
    return 'Next';
  } else if (status === 'TRIAGE') {
    return 'Processing';
  }
  return '-';
}

/**
 * Load queue preview data
 */
async function loadQueuePreview() {
  try {
    const hospitalId = await getHospitalId();
    
    if (!hospitalId) {
      const tbody = document.getElementById('queue-table-body');
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state">
            Please provide a hospitalId in the URL (e.g., ?hospitalId=xxx) or log in to view your hospital's queue.
          </td>
        </tr>
      `;
      return;
    }

    currentHospitalId = hospitalId;

    const response = await apiGet(`/queue/preview?hospitalId=${hospitalId}`);
    
    if (!response.ok) {
      throw new Error('Failed to load queue data');
    }

    const result = await response.json();
    const queueEntries = result.data || [];

    renderQueueTable(queueEntries);
    updateLastUpdatedTime();
  } catch (error) {
    console.error('Error loading queue preview:', error);
    const tbody = document.getElementById('queue-table-body');
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          Failed to load queue data. Please try again.
        </td>
      </tr>
    `;
    toast.error('Failed to load queue data');
  }
}

/**
 * Render queue table
 */
function renderQueueTable(queueEntries) {
  const tbody = document.getElementById('queue-table-body');

  if (queueEntries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">No active queue entries</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = queueEntries
    .map((entry, index) => {
      const statusDisplay = getStatusDisplay(entry.status, entry.estimatedWait);
      const waitingTimeDisplay = getWaitingTimeDisplay(entry.status, entry.estimatedWait);
      // Check if this entry belongs to the current patient
      const isYourPosition = currentPatientId && entry.patientId === currentPatientId;
      
      return `
        <tr ${isYourPosition ? 'class="your-position"' : ''} data-patient-id="${entry.patientId || ''}" data-ticket-number="${entry.ticketNumber || ''}">
          <td data-label="Patient">
            <div class="patient-name-cell">
              ${entry.patientName}
              ${isYourPosition ? '<span class="your-badge">YOUR POSITION</span>' : ''}
            </div>
          </td>
          <td data-label="Service">${entry.departmentName}</td>
          <td data-label="Waiting Time">
            <span class="wait-time-cell ${entry.status === 'WAITING' && entry.estimatedWait ? 'has-wait-time' : ''}">${waitingTimeDisplay}</span>
          </td>
          <td data-label="Status">
            <span class="status-badge ${statusDisplay.class}">${statusDisplay.text}</span>
          </td>
        </tr>
      `;
    })
    .join('');
}


/**
 * Update last updated time display
 */
function updateLastUpdatedTime() {
  lastUpdateTime = new Date();
  const lastUpdatedText = document.getElementById('last-updated-text');
  if (lastUpdatedText) {
    lastUpdatedText.textContent = 'Updated just now';
    
    // Update every second to show relative time
    setInterval(() => {
      if (lastUpdateTime) {
        const secondsAgo = Math.floor((new Date() - lastUpdateTime) / 1000);
        if (secondsAgo < 60) {
          lastUpdatedText.textContent = `Updated ${secondsAgo} secs ago`;
        } else {
          const minutesAgo = Math.floor(secondsAgo / 60);
          lastUpdatedText.textContent = `Updated ${minutesAgo} min${minutesAgo > 1 ? 's' : ''} ago`;
        }
      }
    }, 1000);
  }
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
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
          : 'U';
        userInitial.textContent = initials;
      }
    }
  }

  // Set up mobile navigation
  initMobileNav();

  // Set up refresh button
  const refreshIcon = document.getElementById('refresh-icon');
  if (refreshIcon) {
    refreshIcon.addEventListener('click', () => {
      loadQueuePreview();
    });
  }

  // Load initial data
  await loadQueuePreview();

  // Set up auto-refresh every 10 seconds
  refreshInterval = setInterval(() => {
    loadQueuePreview();
  }, 10000);
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
