/**
 * Modal System
 * Provides beautiful confirmation modals that align with project design
 * Replaces alert(), confirm(), and prompt() browser-native popups
 */

'use strict';

/**
 * Show a confirmation modal
 * @param {Object} options - Modal options
 * @param {string} options.title - Modal title
 * @param {string} options.message - Modal message
 * @param {string} options.confirmText - Confirm button text (default: "Yes, Cancel")
 * @param {string} options.cancelText - Cancel button text (default: "Keep Appointment")
 * @param {string} options.confirmColor - Confirm button color (default: "red")
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export const showConfirmModal = (options = {}) => {
  return new Promise((resolve) => {
    const {
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      confirmText = 'Yes, Cancel',
      cancelText = 'Keep Appointment',
      confirmColor = 'red',
    } = options;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');
    overlay.setAttribute('aria-describedby', 'modal-message');
    // Ensure overlay is properly positioned
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; z-index: 10000;';

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'modal-container';

    // Modal content
    modal.innerHTML = `
      <div class="modal-content">
        <h2 id="modal-title" class="modal-title">${escapeHtml(title)}</h2>
        <p id="modal-message" class="modal-message">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="modal-button modal-button-cancel" data-action="cancel">
            ${escapeHtml(cancelText)}
          </button>
          <button class="modal-button modal-button-confirm" data-action="confirm" data-color="${confirmColor}">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Animation - show modal (use double RAF to ensure DOM is ready)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('modal-show');
      });
    });

    // Handle button clicks
    const handleAction = (action) => {
      overlay.classList.remove('modal-show');
      overlay.classList.add('modal-hide');
      
      setTimeout(() => {
        document.body.removeChild(overlay);
        document.body.style.overflow = '';
        resolve(action === 'confirm');
      }, 300);
    };

    // Cancel button
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    cancelBtn.addEventListener('click', () => handleAction('cancel'));

    // Confirm button
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    confirmBtn.addEventListener('click', () => handleAction('confirm'));

    // Close on overlay click (outside modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        handleAction('cancel');
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleAction('cancel');
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  });
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
 * Convenience method for cancel appointment confirmation
 */
export const confirmCancelAppointment = () => {
  return showConfirmModal({
    title: 'Cancel Appointment',
    message: 'Are you sure you want to cancel this appointment? This action cannot be undone.',
    confirmText: 'Yes, Cancel',
    cancelText: 'Keep Appointment',
    confirmColor: 'red',
  });
};

/**
 * Convenience method for cancel queue entry confirmation
 */
export const confirmCancelQueue = () => {
  return showConfirmModal({
    title: 'Cancel Queue Entry',
    message: 'Are you sure you want to cancel your queue entry? This action cannot be undone.',
    confirmText: 'Yes, Cancel',
    cancelText: 'Keep Queue Entry',
    confirmColor: 'red',
  });
};
