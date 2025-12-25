/**
 * Mobile Menu Toggle Functionality
 * Handles opening and closing of mobile navigation menu
 */

'use strict';

const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileNavigation = document.getElementById('mobile-navigation');
const mobileCloseButton = document.getElementById('mobile-close-button');

// Check if elements exist before adding event listeners
if (!mobileMenuToggle || !mobileNavigation || !mobileCloseButton) {
  console.warn('Mobile navigation elements missing:', {
    mobileMenuToggle,
    mobileNavigation,
    mobileCloseButton,
  });
}

/**
 * Opens the mobile navigation menu
 */
function openMenu() {
  if (mobileNavigation && mobileMenuToggle) {
    mobileNavigation.classList.add('active');
    mobileMenuToggle.classList.add('active');
    mobileMenuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Closes the mobile navigation menu
 */
function closeMenu() {
  if (mobileNavigation && mobileMenuToggle) {
    mobileNavigation.classList.remove('active');
    mobileMenuToggle.classList.remove('active');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
}

// Add event listeners if elements exist
if (mobileMenuToggle) {
  mobileMenuToggle.addEventListener('click', openMenu);
}

if (mobileCloseButton) {
  mobileCloseButton.addEventListener('click', closeMenu);
}

// Close menu when clicking on navigation links
if (mobileNavigation) {
  mobileNavigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (e) => {
      // For hash links, close menu but allow navigation
      if (link.getAttribute('href')?.startsWith('#')) {
        closeMenu();
      } else {
        // For external/page links, close menu and allow navigation
        closeMenu();
        // Navigation will happen naturally
      }
    });
  });
}

// Close menu on Escape key press
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mobileNavigation?.classList.contains('active')) {
    closeMenu();
  }
});

// Close menu when window is resized to desktop size
window.addEventListener('resize', () => {
  if (window.innerWidth > 768 && mobileNavigation?.classList.contains('active')) {
    closeMenu();
  }
});

