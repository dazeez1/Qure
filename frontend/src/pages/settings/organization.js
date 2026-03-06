/**
 * Organization Settings Handler
 * Handles loading and updating organization settings
 */

'use strict';

import { apiGet, apiPut } from '../../utils/apiClient.js';
import { getAuthUser } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// Store original values for cancel functionality
let originalOrganizationData = null;

/**
 * Load organization data from API
 */
export async function loadOrganizationData() {
  const hospitalNameInput = document.getElementById('hospital-name');
  const hospitalAddressInput = document.getElementById('hospital-address');
  const timezoneSelect = document.getElementById('timezone');
  const logoPreview = document.getElementById('logo-preview');
  const logoPreviewImg = document.getElementById('logo-preview-img');
  const logoUploadArea = document.getElementById('logo-upload-area');
  const logoUploadContent = logoUploadArea?.querySelector('.logo-upload-content');
  const saveButton = document.getElementById('save-btn');
  const cancelButton = document.getElementById('cancel-btn');

  // Show loading state
  if (hospitalNameInput) {
    hospitalNameInput.value = 'Loading...';
    hospitalNameInput.disabled = true;
  }
  if (hospitalAddressInput) {
    hospitalAddressInput.disabled = true;
  }
  if (timezoneSelect) {
    timezoneSelect.disabled = true;
  }
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Loading...';
  }

  try {
    const response = await apiGet('/settings/organization');
    const result = await response.json();

    if (response.ok && result.success) {
      const organization = result.data.organization;

      // Store original data for cancel functionality
      originalOrganizationData = {
        name: organization.name || '',
        address: organization.address || '',
        timeZone: organization.timeZone || '',
        logoUrl: organization.logoUrl || '',
      };

      // Populate form fields
      if (hospitalNameInput) {
        hospitalNameInput.value = organization.name || '';
        hospitalNameInput.disabled = false;
      }

      if (hospitalAddressInput) {
        hospitalAddressInput.value = organization.address || '';
        hospitalAddressInput.disabled = false;
      }

      if (timezoneSelect) {
        timezoneSelect.value = organization.timeZone || '';
        timezoneSelect.disabled = false;
      }

      // Handle logo display
      if (organization.logoUrl) {
        if (logoPreview && logoPreviewImg) {
          logoPreviewImg.src = organization.logoUrl;
          logoPreview.style.display = 'flex';
          if (logoUploadContent) {
            logoUploadContent.style.display = 'none';
          }
        }
      } else {
        if (logoPreview) {
          logoPreview.style.display = 'none';
        }
        if (logoUploadContent) {
          logoUploadContent.style.display = 'block';
        }
      }

      // Check user permissions
      const user = getAuthUser();
      const canUpdate = user && (user.isPrimary === true || user.role === 'ADMIN');

      // Disable save button for regular staff
      if (saveButton) {
        saveButton.disabled = !canUpdate;
        saveButton.textContent = 'Save';
        if (!canUpdate) {
          saveButton.title = 'Only primary staff or administrators can update organization settings';
          saveButton.setAttribute('aria-disabled', 'true');
        } else {
          saveButton.removeAttribute('aria-disabled');
        }
      }

      // Disable cancel button for regular staff (no changes possible anyway)
      if (cancelButton) {
        cancelButton.disabled = !canUpdate;
        if (!canUpdate) {
          cancelButton.title = 'Only primary staff or administrators can update organization settings';
          cancelButton.setAttribute('aria-disabled', 'true');
        } else {
          cancelButton.removeAttribute('aria-disabled');
        }
      }

      // Disable form inputs if user cannot update
      if (!canUpdate) {
        if (hospitalNameInput) hospitalNameInput.readOnly = true;
        if (hospitalAddressInput) hospitalAddressInput.readOnly = true;
        if (timezoneSelect) timezoneSelect.disabled = true;

        // Disable logo upload area for regular staff
        const logoUploadArea = document.getElementById('logo-upload-area');
        const logoUploadInput = document.getElementById('logo-upload');
        const logoRemoveButton = document.getElementById('logo-remove');

        if (logoUploadArea) {
          logoUploadArea.classList.add('disabled');
          logoUploadArea.style.pointerEvents = 'none';
          logoUploadArea.style.cursor = 'not-allowed';
          logoUploadArea.title = 'Only primary staff or administrators can update organization settings';
        }

        if (logoUploadInput) {
          logoUploadInput.disabled = true;
        }

        if (logoRemoveButton) {
          logoRemoveButton.disabled = true;
          logoRemoveButton.style.pointerEvents = 'none';
          logoRemoveButton.style.cursor = 'not-allowed';
        }
      }
    } else {
      // Error loading data
      const errorMessage = result.message || 'Failed to load organization settings';
      toast.error(errorMessage);

      // Reset form
      if (hospitalNameInput) {
        hospitalNameInput.value = '';
        hospitalNameInput.disabled = false;
      }
      if (hospitalAddressInput) {
        hospitalAddressInput.value = '';
        hospitalAddressInput.disabled = false;
      }
      if (timezoneSelect) {
        timezoneSelect.disabled = false;
      }
      if (saveButton) {
        // Re-check permissions in case of error
        const user = getAuthUser();
        const canUpdate = user && (user.isPrimary === true || user.role === 'ADMIN');
        saveButton.disabled = !canUpdate;
        saveButton.textContent = 'Save';
        if (!canUpdate) {
          saveButton.setAttribute('aria-disabled', 'true');
        } else {
          saveButton.removeAttribute('aria-disabled');
        }
      }
    }
  } catch (error) {
    console.error('Error loading organization data:', error);
    toast.error('Network error. Please try again');

    // Reset form
    if (hospitalNameInput) {
      hospitalNameInput.value = '';
      hospitalNameInput.disabled = false;
    }
    if (hospitalAddressInput) {
      hospitalAddressInput.value = '';
      hospitalAddressInput.disabled = false;
    }
    if (timezoneSelect) {
      timezoneSelect.disabled = false;
    }
    if (saveButton) {
      // Re-check permissions in case of error
      const user = getAuthUser();
      const canUpdate = user && (user.isPrimary === true || user.role === 'ADMIN');
      saveButton.disabled = !canUpdate;
      saveButton.textContent = 'Save';
      if (!canUpdate) {
        saveButton.setAttribute('aria-disabled', 'true');
      } else {
        saveButton.removeAttribute('aria-disabled');
      }
    }
  }
}

/**
 * Update organization settings
 */
export async function updateOrganizationData(formData) {
  const saveButton = document.getElementById('save-btn');

  // Disable save button and show loading
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
  }

  try {
    // Prepare update data
    const updateData = {};

    const hospitalNameInput = document.getElementById('hospital-name');
    const hospitalAddressInput = document.getElementById('hospital-address');
    const timezoneSelect = document.getElementById('timezone');

    if (hospitalNameInput && hospitalNameInput.value.trim() !== originalOrganizationData.name) {
      updateData.name = hospitalNameInput.value.trim();
    }

    if (hospitalAddressInput) {
      const addressValue = hospitalAddressInput.value.trim();
      if (addressValue !== originalOrganizationData.address) {
        updateData.address = addressValue || null;
      }
    }

    if (timezoneSelect && timezoneSelect.value !== originalOrganizationData.timeZone) {
      updateData.timeZone = timezoneSelect.value || null;
    }

    // For now, logoUrl is handled separately (file upload not implemented yet)
    // If logo preview exists, we could extract URL from it
    const logoPreviewImg = document.getElementById('logo-preview-img');
    if (logoPreviewImg && logoPreviewImg.src && !logoPreviewImg.src.startsWith('data:')) {
      const logoUrl = logoPreviewImg.src;
      if (logoUrl !== originalOrganizationData.logoUrl) {
        updateData.logoUrl = logoUrl || null;
      }
    }

    // Check if there are any changes
    if (Object.keys(updateData).length === 0) {
      toast.info('No changes to save');
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
      }
      return;
    }

    // Send update request
    const response = await apiPut('/settings/organization', updateData);
    const result = await response.json();

    if (response.ok && result.success) {
      // Update original data with new values
      const updatedOrganization = result.data.organization;
      originalOrganizationData = {
        name: updatedOrganization.name || '',
        address: updatedOrganization.address || '',
        timeZone: updatedOrganization.timeZone || '',
        logoUrl: updatedOrganization.logoUrl || '',
      };

      toast.success(result.message || 'Organization settings updated successfully');

      // Update logo if URL changed
      if (updatedOrganization.logoUrl) {
        const logoPreview = document.getElementById('logo-preview');
        const logoPreviewImg = document.getElementById('logo-preview-img');
        const logoUploadContent = document.getElementById('logo-upload-area')?.querySelector('.logo-upload-content');

        if (logoPreview && logoPreviewImg) {
          logoPreviewImg.src = updatedOrganization.logoUrl;
          logoPreview.style.display = 'flex';
          if (logoUploadContent) {
            logoUploadContent.style.display = 'none';
          }
        }
      }
    } else {
      // Error updating
      const errorMessage = result.message || 'Failed to update organization settings';
      toast.error(errorMessage);
    }
  } catch (error) {
    console.error('Error updating organization data:', error);
    toast.error('Network error. Please try again');
  } finally {
    // Re-enable save button (but check permissions first)
    if (saveButton) {
      const user = getAuthUser();
      const canUpdate = user && (user.isPrimary === true || user.role === 'ADMIN');
      saveButton.disabled = !canUpdate;
      saveButton.textContent = 'Save';
      if (!canUpdate) {
        saveButton.setAttribute('aria-disabled', 'true');
      } else {
        saveButton.removeAttribute('aria-disabled');
      }
    }
  }
}

/**
 * Reset form to original values
 */
export function resetOrganizationForm() {
  if (!originalOrganizationData) {
    return;
  }

  const hospitalNameInput = document.getElementById('hospital-name');
  const hospitalAddressInput = document.getElementById('hospital-address');
  const timezoneSelect = document.getElementById('timezone');
  const logoPreview = document.getElementById('logo-preview');
  const logoPreviewImg = document.getElementById('logo-preview-img');
  const logoUploadArea = document.getElementById('logo-upload-area');
  const logoUploadContent = logoUploadArea?.querySelector('.logo-upload-content');
  const logoUpload = document.getElementById('logo-upload');

  // Reset form fields
  if (hospitalNameInput) {
    hospitalNameInput.value = originalOrganizationData.name || '';
  }

  if (hospitalAddressInput) {
    hospitalAddressInput.value = originalOrganizationData.address || '';
  }

  if (timezoneSelect) {
    timezoneSelect.value = originalOrganizationData.timeZone || '';
    if (!originalOrganizationData.timeZone) {
      timezoneSelect.selectedIndex = 0;
    }
  }

  // Reset logo
  if (originalOrganizationData.logoUrl) {
    if (logoPreview && logoPreviewImg) {
      logoPreviewImg.src = originalOrganizationData.logoUrl;
      logoPreview.style.display = 'flex';
      if (logoUploadContent) {
        logoUploadContent.style.display = 'none';
      }
    }
  } else {
    if (logoPreview) {
      logoPreview.style.display = 'none';
    }
    if (logoUploadContent) {
      logoUploadContent.style.display = 'block';
    }
    if (logoUpload) {
      logoUpload.value = '';
    }
  }
}
