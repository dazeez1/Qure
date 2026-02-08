/**
 * Settings Tab Navigation
 * Handles smooth tab switching within Settings page
 */

'use strict';

const SETTINGS_TABS = {
  'organization': '/partials/settings-organization.html',
  'departments': '/partials/settings-coming-soon.html',
  'staff-roles': '/partials/settings-coming-soon.html',
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
function initializeOrganizationTab() {
  const form = document.getElementById('organization-form');
  const cancelBtn = document.getElementById('cancel-btn');
  const saveBtn = document.getElementById('save-btn');
  const logoUpload = document.getElementById('logo-upload');
  const logoUploadArea = document.getElementById('logo-upload-area');
  const logoPreview = document.getElementById('logo-preview');
  const logoPreviewImg = document.getElementById('logo-preview-img');
  const logoRemove = document.getElementById('logo-remove');

  if (!form) return;

  // Import toast dynamically
  import('../utils/toast.js').then(({ toast }) => {
    // Save button handler (works with form attribute)
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Mock save - UI only
        toast.success('Organization settings saved (mock)');
      });
    }

    // Form submit handler (backup)
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Mock save - UI only
      toast.success('Organization settings saved (mock)');
    });

    // Cancel button handler
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // Reset form fields to original values
        const hospitalName = document.getElementById('hospital-name');
        const hospitalAddress = document.getElementById('hospital-address');
        const timezone = document.getElementById('timezone');
        
        if (hospitalName) hospitalName.value = '';
        if (hospitalAddress) hospitalAddress.value = '';
        if (timezone) {
          timezone.selectedIndex = 0; // Reset to placeholder "Select time zone"
          timezone.value = ''; // Ensure placeholder shows
        }
        
        // Hide logo preview if shown
        if (logoPreview) {
          logoPreview.style.display = 'none';
        }
        if (logoUploadArea) {
          const uploadContent = logoUploadArea.querySelector('.logo-upload-content');
          if (uploadContent) uploadContent.style.display = 'block';
        }
        if (logoUpload) {
          logoUpload.value = '';
        }
        
        toast.info('Changes cancelled');
      });
    }

    // Logo upload handler (preview only - no actual upload)
    if (logoUpload && logoPreview && logoPreviewImg) {
      logoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            logoPreviewImg.src = event.target.result;
            logoPreview.style.display = 'flex';
            logoUploadArea.querySelector('.logo-upload-content').style.display = 'none';
            toast.success('Logo preview loaded (mock)');
          };
          reader.readAsDataURL(file);
        } else {
          toast.error('Please select a valid image file');
        }
      });

      // Logo remove handler
      if (logoRemove) {
        logoRemove.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          logoPreview.style.display = 'none';
          logoUploadArea.querySelector('.logo-upload-content').style.display = 'block';
          logoUpload.value = '';
          toast.info('Logo removed');
        });
      }
    }
  });
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
  // Set up tab handlers
  setupTabHandlers();
  
  // Load default tab if content is empty
  if (!settingsContentEl || settingsContentEl.innerHTML.trim() === '') {
    loadSettingsTab(DEFAULT_TAB);
  }
}

// Initialize when settings view is loaded
window.addEventListener('view-loaded', (event) => {
  if (event.detail.route === 'settings') {
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

// Export for use in other modules
export { loadSettingsTab, updateActiveTab };

