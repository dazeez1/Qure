/**
 * Settings Tab Navigation
 * Handles smooth tab switching within Settings page
 */

'use strict';

const SETTINGS_TABS = {
  'organization': '/partials/settings-organization.html',
  'departments': '/partials/settings-departments.html',
  'staff-roles': '/partials/settings-staff-roles.html',
  'notifications': '/partials/settings-coming-soon.html',
  'security': '/partials/settings-coming-soon.html'
};

const DEFAULT_TAB = 'organization';

let currentTab = DEFAULT_TAB;
let settingsContentEl = null;

/**
 * Load a settings tab content
 * @param {string} tabName - Tab name (e.g., 'organization', 'departments')
 */
async function loadSettingsTab(tabName) {
  if (!settingsContentEl) {
    settingsContentEl = document.getElementById('settings-content');
    if (!settingsContentEl) {
      console.error('Settings: settings-content element not found');
      return;
    }
  }

  const viewPath = SETTINGS_TABS[tabName];
  if (!viewPath) {
    console.error(`Settings: Tab "${tabName}" not found`);
    return;
  }

  try {
    // Show loading state
    settingsContentEl.innerHTML = '<div class="loading-state">Loading...</div>';

    // Fetch the tab content
    const response = await fetch(viewPath);
    if (!response.ok) throw new Error('Failed to load tab content');

    const html = await response.text();
    settingsContentEl.innerHTML = html;

    // Update active tab
    updateActiveTab(tabName);
    currentTab = tabName;

    // Dispatch event for tab-specific initialization
    window.dispatchEvent(new CustomEvent('settings-tab-loaded', { 
      detail: { tab: tabName } 
    }));

    // Initialize tab-specific functionality
    if (tabName === 'organization') {
      initializeOrganizationTab();
    } else if (tabName === 'departments') {
      initializeDepartmentsTab();
    } else if (tabName === 'staff-roles') {
      initializeStaffRolesTab();
    }

  } catch (error) {
    console.error('Settings: Error loading tab:', error);
    settingsContentEl.innerHTML = `
      <div class="error-state">
        <h3>Unable to load settings tab</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

/**
 * Update active tab visual state
 * @param {string} tabName - Active tab name
 */
function updateActiveTab(tabName) {
  const tabs = document.querySelectorAll('.settings-tab');
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

/**
 * Initialize Organization tab functionality
 */
async function initializeOrganizationTab() {
  const form = document.getElementById('organization-form');
  const cancelBtn = document.getElementById('cancel-btn');
  const saveBtn = document.getElementById('save-btn');
  const logoUpload = document.getElementById('logo-upload');
  const logoUploadArea = document.getElementById('logo-upload-area');
  const logoPreview = document.getElementById('logo-preview');
  const logoPreviewImg = document.getElementById('logo-preview-img');
  const logoRemove = document.getElementById('logo-remove');

  if (!form) return;

  // Import organization settings handler and toast
  const [{ loadOrganizationData, updateOrganizationData, resetOrganizationForm }, { toast }] = await Promise.all([
    import('../pages/settings/organization.js'),
    import('../utils/toast.js'),
  ]);

  // Load organization data on tab initialization
  await loadOrganizationData();

  // Save button handler (works with form attribute)
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      // Prevent action if button is disabled
      if (saveBtn.disabled) {
        return;
      }
      const formData = new FormData(form);
      await updateOrganizationData(formData);
    });
  }

  // Form submit handler (backup)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Prevent action if save button is disabled
    if (saveBtn && saveBtn.disabled) {
      return;
    }
    const formData = new FormData(form);
    await updateOrganizationData(formData);
  });

  // Cancel button handler
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      resetOrganizationForm();
      toast.info('Changes cancelled');
    });
  }

  // Logo upload handler (preview only - no actual upload service yet)
  if (logoUpload && logoPreview && logoPreviewImg) {
    logoUpload.addEventListener('change', (e) => {
      // Check if logo upload is disabled
      if (logoUpload.disabled || logoUploadArea.classList.contains('disabled')) {
        e.preventDefault();
        return;
      }

      const file = e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          logoPreviewImg.src = event.target.result;
          logoPreview.style.display = 'flex';
          logoUploadArea.querySelector('.logo-upload-content').style.display = 'none';
          toast.info('Logo preview loaded. Note: Logo upload service not yet implemented.');
        };
        reader.readAsDataURL(file);
      } else {
        toast.error('Please select a valid image file');
      }
    });

    // Logo remove handler
    if (logoRemove) {
      logoRemove.addEventListener('click', (e) => {
        // Check if logo remove is disabled
        if (logoRemove.disabled || logoUploadArea.classList.contains('disabled')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        logoPreview.style.display = 'none';
        logoUploadArea.querySelector('.logo-upload-content').style.display = 'block';
        logoUpload.value = '';
        toast.info('Logo removed');
      });
    }
  }
}

/**
 * Set up tab click handlers
 */
function setupTabHandlers() {
  const tabs = document.querySelectorAll('.settings-tab');
  if (tabs.length === 0) {
    console.warn('Settings: No tabs found');
    return;
  }

  tabs.forEach(tab => {
    // Remove any existing listeners by cloning
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);
    
    newTab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tabName = newTab.dataset.tab;
      if (tabName) {
        loadSettingsTab(tabName);
      }
    });
  });
}

/**
 * Initialize settings navigation
 */
function initSettingsNavigation() {
  // Reset settingsContentEl reference to ensure we get the fresh element
  settingsContentEl = document.getElementById('settings-content');
  
  // Set up tab handlers
  setupTabHandlers();
  
  // Always load default tab when settings view is loaded (ensures content shows on navigation)
  if (settingsContentEl) {
    loadSettingsTab(DEFAULT_TAB);
  }
}

// Initialize when settings view is loaded
window.addEventListener('view-loaded', (event) => {
  if (event.detail.route === 'settings') {
    // Reset current tab to default when view is reloaded
    currentTab = DEFAULT_TAB;
    // Reset settingsContentEl to null so it gets fresh reference
    settingsContentEl = null;
    
    setTimeout(() => {
      initSettingsNavigation();
    }, 100);
  }
});

// Also try to initialize on DOM ready (in case view is already loaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on settings page
    const settingsView = document.querySelector('.settings-view');
    if (settingsView) {
      setTimeout(() => {
        initSettingsNavigation();
      }, 100);
    }
  });
} else {
  // DOM already ready, check if settings view exists
  const settingsView = document.querySelector('.settings-view');
  if (settingsView) {
    setTimeout(() => {
      initSettingsNavigation();
    }, 100);
  }
}

/**
 * Initialize Departments tab functionality
 */
async function initializeDepartmentsTab() {
  // Import and initialize departments handler
  const { initDepartmentsUI } = await import('../pages/settings/departments.js');
  initDepartmentsUI();
}

/**
 * Initialize Staff & Roles tab functionality
 */
async function initializeStaffRolesTab() {
  // Import and initialize staff roles handler
  const { initStaffRolesUI } = await import('../pages/settings/staff-roles.js');
  initStaffRolesUI();
}

// Export for use in other modules
export { loadSettingsTab, updateActiveTab };

