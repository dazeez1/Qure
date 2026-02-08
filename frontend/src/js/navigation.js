/**
 * Navigation System - Single Source of Truth
 * Handles hash-based routing and dynamic view loading
 */

const contentEl = document.getElementById('app-content');
const DEFAULT_ROUTE = 'dashboard';

// Route to view mapping
const ROUTE_TO_VIEW = {
  'dashboard': 'dashboard',
  'queues': 'coming-soon',
  'waiting-area': 'coming-soon',
  'appointments': 'coming-soon',
  'floor-map': 'coming-soon',
  'settings': 'settings'
};

/**
 * Load a view into the content container
 * @param {string} route - Route name (e.g., 'dashboard', 'queues')
 */
async function loadView(route) {
  if (!contentEl) {
    console.error('Navigation: app-content element not found');
    return;
  }

  // Get the view file name from route mapping
  const view = ROUTE_TO_VIEW[route] || ROUTE_TO_VIEW[DEFAULT_ROUTE];

  try {
    const res = await fetch(`/partials/${view}.html`);
    if (!res.ok) throw new Error('View not found');

    const html = await res.text();
    contentEl.innerHTML = html;

    // Update active nav item based on route
    updateActiveNav(route);

    // Persist route in URL hash
    if (location.hash.replace('#', '') !== route) {
      location.hash = route;
    }

    // Dispatch event for view-specific initialization
    window.dispatchEvent(new CustomEvent('view-loaded', { detail: { route, view } }));

    // Initialize settings navigation if settings view is loaded
    if (route === 'settings') {
      // Wait a bit for the HTML to be injected, then initialize settings navigation
      setTimeout(() => {
        // Check if settings navigation elements exist
        const settingsContent = document.getElementById('settings-content');
        if (settingsContent) {
          import('./settings-navigation.js').catch(err => {
            console.error('Failed to load settings navigation:', err);
          });
        }
      }, 50);
    }
  } catch (err) {
    console.error('Navigation: Error loading view:', err);
    contentEl.innerHTML = `
      <div style="padding: 2rem;">
        <h3>Unable to load page</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

/**
 * Update active navigation item
 * @param {string} route - Current route name
 */
function updateActiveNav(route) {
  document.querySelectorAll('.nav-item').forEach(item => {
    const itemRoute = item.dataset.route;
    if (itemRoute === route) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Get current route from hash
 * @returns {string} Current route
 */
function getCurrentRoute() {
  const hash = location.hash.replace('#', '');
  return hash && ROUTE_TO_VIEW[hash] ? hash : DEFAULT_ROUTE;
}

// Menu click handler (once)
document.querySelectorAll('[data-route]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const route = link.dataset.route;
    if (route) {
      loadView(route);
    }
  });
});

// Load view on page load (THIS FIXES BLANK PAGE)
// Use immediate execution if DOM is ready, otherwise wait for DOMContentLoaded
function initializeNavigation() {
  const route = getCurrentRoute();
  updateActiveNav(route); // Ensure active state is set
  loadView(route);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeNavigation);
} else {
  // DOM is already ready, initialize immediately
  initializeNavigation();
}

// Handle back / forward (polish)
window.addEventListener('hashchange', () => {
  const route = getCurrentRoute();
  loadView(route);
});

// Export for use in other modules if needed
export { loadView, updateActiveNav, getCurrentRoute };
