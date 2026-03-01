/**
 * Toast Notification System
 * Provides non-blocking user feedback for success, error, warning, and info messages
 * Replaces alert(), confirm(), and browser-native popups
 */

'use strict';

// Toast types
export const ToastType = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

/**
 * Create and show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds (default: 5000)
 */
// Track active toast to prevent duplicates
let activeToast = null;
let activeToastTimer = null;

export const showToast = (message, type = ToastType.INFO, duration = 5000) => {
  // Remove existing toast if present (show only one at a time)
  if (activeToast) {
    clearTimeout(activeToastTimer);
    removeToast(activeToast);
    activeToast = null;
  }

  // Remove existing toasts container if present
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  
  // Store as active toast
  activeToast = toast;

  // Toast content
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${getToastIcon(type)}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Close notification">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  `;

  // Add to container
  toastContainer.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  // Auto remove after duration
  activeToastTimer = setTimeout(() => {
    removeToast(toast);
    activeToast = null;
  }, duration);

  // Manual close button
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    clearTimeout(activeToastTimer);
    removeToast(toast);
    activeToast = null;
  });

  // Click to dismiss
  toast.addEventListener('click', () => {
    clearTimeout(activeToastTimer);
    removeToast(toast);
    activeToast = null;
  });
};

/**
 * Remove toast with animation
 */
const removeToast = (toast) => {
  if (!toast) return;
  
  toast.classList.remove('toast-show');
  toast.classList.add('toast-hide');

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }

    // Clear active toast if this was it
    if (activeToast === toast) {
      activeToast = null;
    }

    // Remove container if empty
    const container = document.getElementById('toast-container');
    if (container && container.children.length === 0) {
      container.remove();
    }
  }, 300);
};

/**
 * Get icon for toast type
 */
const getToastIcon = (type) => {
  const icons = {
    success: '<span class="material-symbols-outlined">check_circle</span>',
    error: '<span class="material-symbols-outlined">error</span>',
    warning: '<span class="material-symbols-outlined">warning</span>',
    info: '<span class="material-symbols-outlined">info</span>',
  };
  return icons[type] || icons.info;
};

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Convenience methods
 */
export const toast = {
  success: (message, duration) => showToast(message, ToastType.SUCCESS, duration),
  error: (message, duration) => showToast(message, ToastType.ERROR, duration),
  warning: (message, duration) => showToast(message, ToastType.WARNING, duration),
  info: (message, duration) => showToast(message, ToastType.INFO, duration),
};

