/**
 * SPA Router Utility
 * Handles hash-based routing and dynamic view loading
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentView = null;
    this.contentContainer = null;
    this.init();
  }

  /**
   * Initialize router
   */
  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupRouter());
    } else {
      this.setupRouter();
    }
  }

  /**
   * Set up router after DOM is ready
   */
  setupRouter() {
    // Set up content container
    this.contentContainer = document.getElementById('view-container');
    if (!this.contentContainer) {
      console.error('Router: view-container element not found');
      return;
    }

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    
    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', () => this.handleRoute());

    // Handle initial route
    this.handleRoute();
  }

  /**
   * Register a route
   * @param {string} hash - Route hash (e.g., '#dashboard', '#queues')
   * @param {string} viewPath - Path to HTML partial
   */
  register(hash, viewPath) {
    this.routes.set(hash, viewPath);
  }

  /**
   * Navigate to a route
   * @param {string} hash - Route hash
   */
  navigate(hash) {
    if (hash && !hash.startsWith('#')) {
      hash = `#${hash}`;
    }
    window.location.hash = hash;
  }

  /**
   * Get current route hash
   * @returns {string} Current hash without #
   */
  getCurrentRoute() {
    const hash = window.location.hash.slice(1);
    return hash || 'dashboard'; // Default to dashboard
  }

  /**
   * Handle route change
   */
  async handleRoute() {
    if (!this.contentContainer) {
      // Router not initialized yet
      return;
    }

    const route = this.getCurrentRoute();
    const viewPath = this.routes.get(`#${route}`);

    if (!viewPath) {
      // Default to coming-soon if route not found
      const comingSoonPath = this.routes.get('#coming-soon');
      if (comingSoonPath) {
        await this.loadView('#coming-soon');
      } else {
        console.warn(`Router: No route found for #${route} and coming-soon not registered`);
      }
      return;
    }

    await this.loadView(`#${route}`);
  }

  /**
   * Load a view into the content container
   * @param {string} hash - Route hash
   */
  async loadView(hash) {
    const route = this.getCurrentRoute();
    const viewPath = this.routes.get(hash) || this.routes.get('#coming-soon');

    if (!viewPath) {
      console.error(`Router: View path not found for ${hash}`);
      return;
    }

    try {
      // Show loading state
      this.contentContainer.innerHTML = '<div class="loading-state">Loading...</div>';

      // Fetch the HTML partial
      const response = await fetch(viewPath);
      if (!response.ok) {
        throw new Error(`Failed to load view: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Inject the HTML
      this.contentContainer.innerHTML = html;

      // Update active nav item
      this.updateActiveNav(route);

      // Store current view
      this.currentView = route;

      // Dispatch custom event for view-specific initialization
      window.dispatchEvent(new CustomEvent('view-loaded', { 
        detail: { route, viewPath } 
      }));

    } catch (error) {
      console.error('Router: Error loading view:', error);
      this.contentContainer.innerHTML = `
        <div class="error-state">
          <h2>Error Loading View</h2>
          <p>${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * Update active navigation item
   * @param {string} route - Current route
   */
  updateActiveNav(route) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const itemRoute = item.dataset.route;
      if (itemRoute === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
}

// Export singleton instance
// Router will initialize when DOM is ready
export const router = new Router();

