/**
 * Page Lifecycle Utility
 * Manages event listeners and cleanup for SPA pages
 * Ensures isolated event handling per page to prevent conflicts
 */

'use strict';

/**
 * Page lifecycle manager
 * Tracks and manages event listeners for each page
 */
class PageLifecycle {
  constructor() {
    this.currentPage = null;
    this.listeners = new Map(); // Map of pageId -> array of listener info
  }

  /**
   * Initialize a page with lifecycle management
   * @param {string} pageId - Unique identifier for the page
   * @param {HTMLElement} pageContainer - Container element for the page (for scoped listeners)
   * @param {Function} initFunction - Function to initialize the page
   * @returns {Promise} - Result of init function
   */
  async initPage(pageId, pageContainer, initFunction) {
    // Cleanup previous page if exists
    if (this.currentPage && this.currentPage !== pageId) {
      this.cleanupPage(this.currentPage);
    }

    // Set current page
    this.currentPage = pageId;

    // Initialize listeners array for this page
    if (!this.listeners.has(pageId)) {
      this.listeners.set(pageId, []);
    }

    // Store page container for scoped listeners
    this.pageContainers = this.pageContainers || new Map();
    this.pageContainers.set(pageId, pageContainer);

    // Call init function
    return await initFunction();
  }

  /**
   * Add an event listener with automatic cleanup tracking
   * @param {string} pageId - Page identifier
   * @param {HTMLElement|Window|Document} target - Target element
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   * @param {Object} options - Event listener options
   * @returns {Function} - Cleanup function
   */
  addListener(pageId, target, event, handler, options = {}) {
    if (!this.listeners.has(pageId)) {
      this.listeners.set(pageId, []);
    }

    const listenerInfo = {
      target,
      event,
      handler,
      options,
    };

    // Add listener
    target.addEventListener(event, handler, options);

    // Store for cleanup
    this.listeners.get(pageId).push(listenerInfo);

    // Return cleanup function
    return () => {
      target.removeEventListener(event, handler, options);
      const pageListeners = this.listeners.get(pageId);
      if (pageListeners) {
        const index = pageListeners.indexOf(listenerInfo);
        if (index > -1) {
          pageListeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Add a scoped document click listener (only fires within page container)
   * @param {string} pageId - Page identifier
   * @param {Function} handler - Event handler (receives event)
   * @returns {Function} - Cleanup function
   */
  addScopedDocumentListener(pageId, handler) {
    const pageContainer = this.pageContainers?.get(pageId);
    if (!pageContainer) {
      console.warn(`Page container not found for ${pageId}, falling back to document`);
      return this.addListener(pageId, document, 'click', handler);
    }

    // Create scoped handler that only fires if click is within page container
    const scopedHandler = (e) => {
      // Check if click is within page container or its children
      if (pageContainer.contains(e.target) || pageContainer === e.target) {
        handler(e);
      }
    };

    return this.addListener(pageId, document, 'click', scopedHandler);
  }

  /**
   * Cleanup all listeners for a page
   * @param {string} pageId - Page identifier
   */
  cleanupPage(pageId) {
    const pageListeners = this.listeners.get(pageId);
    if (!pageListeners) {
      return;
    }

    // Remove all listeners
    pageListeners.forEach(({ target, event, handler, options }) => {
      try {
        target.removeEventListener(event, handler, options);
        // Also clear button handler references
        if (target && target._isolatedHandler) {
          target._isolatedHandler = null;
        }
      } catch (error) {
        console.warn(`Error removing listener for ${pageId}:`, error);
      }
    });

    // Clear listeners array
    this.listeners.set(pageId, []);

    // Clear page container reference
    if (this.pageContainers) {
      this.pageContainers.delete(pageId);
    }

    // Close all open modals for this page
    this.closeAllModals();
  }

  /**
   * Close all open modals
   */
  closeAllModals() {
    // Find all modal overlays and close them
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
      try {
        modal.classList.remove('modal-show');
        modal.classList.add('modal-hide');
        setTimeout(() => {
          if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
          }
        }, 100);
      } catch (error) {
        // Modal might already be removed
      }
    });
    
    // Restore body overflow
    document.body.style.overflow = '';
  }

  /**
   * Get page container for scoped operations
   * @param {string} pageId - Page identifier
   * @returns {HTMLElement|null} - Page container element
   */
  getPageContainer(pageId) {
    return this.pageContainers?.get(pageId) || null;
  }
}

// Create singleton instance
const pageLifecycle = new PageLifecycle();

/**
 * Helper function to add isolated button listener
 * Ensures only one listener per button
 * @param {HTMLElement} button - Button element
 * @param {string} pageId - Page identifier
 * @param {Function} handler - Click handler
 * @returns {Function} - Cleanup function
 */
export function addButtonListener(button, pageId, handler) {
  if (!button) {
    return () => {}; // No-op cleanup
  }

  // Remove old listener if exists (stored on button element)
  if (button._isolatedHandler) {
    button.removeEventListener('click', button._isolatedHandler);
  }

  // Store handler reference on button
  button._isolatedHandler = handler;

  // Add new listener
  return pageLifecycle.addListener(pageId, button, 'click', handler);
}

/**
 * Initialize a page with lifecycle management
 * @param {string} pageId - Unique identifier for the page
 * @param {HTMLElement} pageContainer - Container element for the page
 * @param {Function} initFunction - Function to initialize the page
 * @returns {Promise} - Result of init function
 */
export async function initPage(pageId, pageContainer, initFunction) {
  return await pageLifecycle.initPage(pageId, pageContainer, initFunction);
}

/**
 * Cleanup a page
 * @param {string} pageId - Page identifier
 */
export function cleanupPage(pageId) {
  pageLifecycle.cleanupPage(pageId);
}

/**
 * Add event listener with automatic cleanup
 * @param {string} pageId - Page identifier
 * @param {HTMLElement|Window|Document} target - Target element
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event listener options
 * @returns {Function} - Cleanup function
 */
export function addListener(pageId, target, event, handler, options = {}) {
  return pageLifecycle.addListener(pageId, target, event, handler, options);
}

/**
 * Add scoped document click listener
 * @param {string} pageId - Page identifier
 * @param {Function} handler - Event handler
 * @returns {Function} - Cleanup function
 */
export function addScopedDocumentListener(pageId, handler) {
  return pageLifecycle.addScopedDocumentListener(pageId, handler);
}

/**
 * Get page container element
 * @param {string} pageId - Page identifier
 * @returns {HTMLElement|null} - Page container element
 */
export function getPageContainer(pageId) {
  return pageLifecycle.getPageContainer(pageId);
}

export default pageLifecycle;
