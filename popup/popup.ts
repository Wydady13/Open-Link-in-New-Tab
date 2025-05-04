/**
 * Popup script for the Open Link in New Tab extension
 */

import { browserAPI, safeBrowserCall, getStorage, setStorage } from '../utils/browserAPI';

// Default settings
const DEFAULT_SETTINGS = {
  enableExtension: true,
  activateTabs: false,
  supportMultipleUrls: true,
  excludedDomains: [],
  directLinkOpen: true  // Default to true for direct link opening
};

// Current saved exclusion list
let savedExclusionList: string[] = [];

// DOM elements
const enableExtensionToggle = document.getElementById('enableExtension') as HTMLInputElement;
const directLinkOpenToggle = document.getElementById('directLinkOpen') as HTMLInputElement;
const activateTabsToggle = document.getElementById('activateTabs') as HTMLInputElement;
const supportMultipleUrlsToggle = document.getElementById('supportMultipleUrls') as HTMLInputElement;
const excludedDomainsTextarea = document.getElementById('excludedDomains') as HTMLTextAreaElement;
const saveExclusionsButton = document.getElementById('saveExclusions') as HTMLButtonElement;
const saveStatusElement = document.getElementById('saveStatus') as HTMLParagraphElement;
const resetSettingsButton = document.getElementById('resetSettings') as HTMLButtonElement;

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Add event listeners
enableExtensionToggle.addEventListener('change', updateSettings);
directLinkOpenToggle.addEventListener('change', updateSettings);
activateTabsToggle.addEventListener('change', updateSettings);
supportMultipleUrlsToggle.addEventListener('change', updateSettings);
saveExclusionsButton.addEventListener('click', saveExclusions);
resetSettingsButton.addEventListener('click', resetSettings);
excludedDomainsTextarea.addEventListener('input', checkExclusionsChanged);

// Add tooltip behavior for excluded domains
excludedDomainsTextarea.addEventListener('focus', () => {
  // Clear placeholder when focused
  if (excludedDomainsTextarea.value === '') {
    excludedDomainsTextarea.placeholder = '';
  }
});

excludedDomainsTextarea.addEventListener('blur', () => {
  // Restore placeholder when blurred
  if (excludedDomainsTextarea.value === '') {
    excludedDomainsTextarea.placeholder = 'example.com\nanother-example.com';
  }
  
  // Check if save button should be enabled
  checkExclusionsChanged();
});

/**
 * Check if exclusions have changed and enable/disable save button accordingly
 */
function checkExclusionsChanged(): void {
  try {
    const currentText = excludedDomainsTextarea.value.trim();
    const currentDomains = currentText ? currentText.split('\n').map(d => d.trim()).filter(d => d) : [];
    
    // Compare current domains with saved ones
    const hasChanges = JSON.stringify(currentDomains) !== JSON.stringify(savedExclusionList);
    
    saveExclusionsButton.disabled = !hasChanges;
    
    // Add/remove styling for disabled state
    if (!hasChanges) {
      saveExclusionsButton.classList.add('disabled');
    } else {
      saveExclusionsButton.classList.remove('disabled');
    }
  } catch (error) {
    console.error('Error checking exclusions:', error);
  }
}

/**
 * Load extension settings from storage
 */
function loadSettings(): void {
  try {
    browserAPI.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      enableExtensionToggle.checked = settings.enableExtension;
      directLinkOpenToggle.checked = settings.directLinkOpen;
      activateTabsToggle.checked = settings.activateTabs;
      supportMultipleUrlsToggle.checked = settings.supportMultipleUrls;
      
      // Store saved exclusion list for comparison
      savedExclusionList = settings.excludedDomains || [];
      
      // Display excluded domains in textarea
      if (settings.excludedDomains && Array.isArray(settings.excludedDomains)) {
        excludedDomainsTextarea.value = settings.excludedDomains.join('\n');
      }
      
      // Initialize save button state
      checkExclusionsChanged();
    });
  } catch (error) {
    console.error('Error loading settings:', error);
    
    // Use default settings in case of error
    enableExtensionToggle.checked = DEFAULT_SETTINGS.enableExtension;
    directLinkOpenToggle.checked = DEFAULT_SETTINGS.directLinkOpen;
    activateTabsToggle.checked = DEFAULT_SETTINGS.activateTabs;
    supportMultipleUrlsToggle.checked = DEFAULT_SETTINGS.supportMultipleUrls;
  }
}

/**
 * Update settings based on toggle changes
 */
function updateSettings(): void {
  try {
    // Show visual feedback for the toggle
    const toggle = document.activeElement as HTMLElement;
    if (toggle && toggle.parentElement) {
      const slider = toggle.parentElement.querySelector('.slider');
      if (slider) {
        slider.classList.add('active');
        setTimeout(() => slider.classList.remove('active'), 300);
      }
    }

    const settings = {
      enableExtension: enableExtensionToggle.checked,
      directLinkOpen: directLinkOpenToggle.checked,
      activateTabs: activateTabsToggle.checked,
      supportMultipleUrls: supportMultipleUrlsToggle.checked
    };

    browserAPI.storage.sync.set(settings, () => {
      // Check for browser errors
      const err = browserAPI.runtime.lastError;
      if (err) {
        console.error('Error saving settings:', err);
        showSaveStatus('Error saving settings');
        return;
      }
      
      // Notify background script about settings change
      browserAPI.runtime.sendMessage({ action: 'settingsUpdated', settings });
      
      // Show temporary save status
      showSaveStatus('Settings updated');
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    showSaveStatus('Error updating settings');
  }
}

/**
 * Save excluded domains list
 */
function saveExclusions(): void {
  try {
    // If button is disabled, don't proceed
    if (saveExclusionsButton.disabled) {
      return;
    }
    
    const domainsText = excludedDomainsTextarea.value.trim();
    const domainsList = domainsText ? domainsText.split('\n').map(d => d.trim()).filter(d => d) : [];
    
    // Update saved list for comparison
    savedExclusionList = [...domainsList];
    
    // Add button animation
    saveExclusionsButton.classList.add('saving');
    
    browserAPI.storage.sync.set({ excludedDomains: domainsList }, () => {
      // Check for browser errors
      const err = browserAPI.runtime.lastError;
      if (err) {
        console.error('Error saving exclusions:', err);
        showSaveStatus('Error saving exclusions');
        return;
      }
      
      // Notify background script about settings change
      browserAPI.runtime.sendMessage({ 
        action: 'settingsUpdated', 
        settings: { excludedDomains: domainsList } 
      });
      
      // Show temporary save status
      showSaveStatus('Exclusion list saved');
      
      // Remove button animation
      setTimeout(() => {
        saveExclusionsButton.classList.remove('saving');
        
        // Update button state after saving
        checkExclusionsChanged();
      }, 300);
    });
  } catch (error) {
    console.error('Error saving exclusions:', error);
    showSaveStatus('Error saving exclusions');
  }
}

/**
 * Reset all settings to defaults
 */
function resetSettings(): void {
  try {
    if (confirm('Reset all settings to default values?')) {
      // Add button animation
      resetSettingsButton.classList.add('resetting');
      
      // Store default settings
      browserAPI.storage.sync.set(DEFAULT_SETTINGS, () => {
        // Check for browser errors
        const err = browserAPI.runtime.lastError;
        if (err) {
          console.error('Error resetting settings:', err);
          showSaveStatus('Error resetting settings');
          return;
        }
        
        // Update saved list for comparison
        savedExclusionList = DEFAULT_SETTINGS.excludedDomains;
        
        // Reload UI with default values
        loadSettings();
        
        // Notify background script
        browserAPI.runtime.sendMessage({ 
          action: 'settingsUpdated', 
          settings: DEFAULT_SETTINGS 
        });
        
        // Show temporary save status
        showSaveStatus('Settings reset to defaults');
        
        // Remove button animation
        setTimeout(() => resetSettingsButton.classList.remove('resetting'), 300);
      });
    }
  } catch (error) {
    console.error('Error resetting settings:', error);
    showSaveStatus('Error resetting settings');
  }
}

/**
 * Show temporary save status message
 */
function showSaveStatus(message: string): void {
  try {
    saveStatusElement.textContent = message;
    saveStatusElement.classList.add('visible');
    saveStatusElement.classList.add('animation-fade');
    
    // Clear the message after animation completes
    setTimeout(() => {
      saveStatusElement.classList.remove('visible');
      saveStatusElement.classList.remove('animation-fade');
      setTimeout(() => {
        saveStatusElement.textContent = '';
      }, 300);
    }, 2000);
  } catch (error) {
    console.error('Error showing save status:', error);
  }
} 