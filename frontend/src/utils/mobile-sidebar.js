/**
 * Mobile Sidebar Toggle Functionality
 * Handles opening and closing of mobile sidebar navigation
 */

'use strict';

let hamburgerMenu = null;
let sidebar = null;
let sidebarClose = null;
let sidebarOverlay = null;

/**
 * Initialize mobile sidebar functionality
 */
function initMobileSidebar() {
  hamburgerMenu = document.getElementById('hamburger-menu');
  sidebar = document.getElementById('sidebar');
  sidebarClose = document.getElementById('sidebar-close');
  sidebarOverlay = document.getElementById('sidebar-overlay');

  if (!hamburgerMenu || !sidebar || !sidebarClose || !sidebarOverlay) {
    console.warn('Mobile sidebar elements not found');
    return;
  }

  // Open sidebar
  hamburgerMenu.addEventListener('click', openSidebar);
  
  // Close sidebar
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // Close sidebar when clicking on nav items (mobile only)
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });

  // Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });

  // Close sidebar when window is resized to desktop size
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}

/**
 * Open the sidebar
 */
function openSidebar() {
  if (!sidebar || !sidebarOverlay) return;
  
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  document.body.classList.add('menu-open');
  
  // Update aria attributes
  hamburgerMenu?.setAttribute('aria-expanded', 'true');
}

/**
 * Close the sidebar
 */
function closeSidebar() {
  if (!sidebar || !sidebarOverlay) return;
  
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
  document.body.classList.remove('menu-open');
  
  // Update aria attributes
  hamburgerMenu?.setAttribute('aria-expanded', 'false');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileSidebar);
} else {
  initMobileSidebar();
}

// Export for use in other modules
export { openSidebar, closeSidebar };

