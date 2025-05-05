/**
 * Popup script for the Open Link in New Tab extension
 */

import { browserAPI, safeBrowserCall, getStorage, setStorage } from '../utils/browserAPI';

// Define settings interface
interface ExtensionSettings {
  enableExtension: boolean;
  activateTabs: boolean;
  supportMultipleUrls: boolean;
  excludedDomains: string[];
  directLinkOpen: boolean;
  debounceThreshold: number;
  clickDistanceThreshold: number;
  clickTimeThreshold: number;
  debugMode: boolean;
  urlPatternType: string;
}

// Default settings
const DEFAULT_SETTINGS: ExtensionSettings = {
  enableExtension: true,
  activateTabs: false,
  supportMultipleUrls: true,
  excludedDomains: [],
  directLinkOpen: true,  // Default to true for direct link opening
  // Advanced settings
  debounceThreshold: 500,
  clickDistanceThreshold: 5,
  clickTimeThreshold: 300,
  debugMode: false,
  urlPatternType: 'standard'
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
const domainValidationFeedback = document.getElementById('domainValidationFeedback') as HTMLDivElement;
const addCurrentDomainButton = document.getElementById('addCurrentDomain') as HTMLButtonElement;
const exportDomainsButton = document.getElementById('exportDomains') as HTMLButtonElement;
const importDomainsButton = document.getElementById('importDomains') as HTMLButtonElement;
const importFileInput = document.getElementById('importFile') as HTMLInputElement;

// Advanced settings DOM elements
const toggleAdvancedButton = document.getElementById('toggleAdvanced') as HTMLButtonElement;
const advancedSettingsDiv = document.getElementById('advancedSettings') as HTMLDivElement;
const debounceThresholdSlider = document.getElementById('debounceThreshold') as HTMLInputElement;
const debounceValueSpan = document.getElementById('debounceValue') as HTMLSpanElement;
const clickDistanceThresholdSlider = document.getElementById('clickDistanceThreshold') as HTMLInputElement;
const distanceValueSpan = document.getElementById('distanceValue') as HTMLSpanElement;
const clickTimeThresholdSlider = document.getElementById('clickTimeThreshold') as HTMLInputElement;
const timeValueSpan = document.getElementById('timeValue') as HTMLSpanElement;
const debugModeToggle = document.getElementById('debugMode') as HTMLInputElement;
const urlPatternSelect = document.getElementById('urlPatternSelection') as HTMLSelectElement;
const saveAdvancedButton = document.getElementById('saveAdvanced') as HTMLButtonElement;
const advancedSaveStatus = document.getElementById('advancedSaveStatus') as HTMLParagraphElement;

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Add event listeners
enableExtensionToggle.addEventListener('change', updateSettings);
directLinkOpenToggle.addEventListener('change', updateSettings);
activateTabsToggle.addEventListener('change', updateSettings);
supportMultipleUrlsToggle.addEventListener('change', updateSettings);
saveExclusionsButton.addEventListener('click', saveExclusions);
resetSettingsButton.addEventListener('click', resetSettings);
excludedDomainsTextarea.addEventListener('input', validateDomains);
addCurrentDomainButton.addEventListener('click', addCurrentDomain);
exportDomainsButton.addEventListener('click', exportDomains);
importDomainsButton.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', importDomains);

// Advanced settings event listeners
toggleAdvancedButton.addEventListener('click', toggleAdvancedSettings);
debounceThresholdSlider.addEventListener('input', updateDebounceValue);
clickDistanceThresholdSlider.addEventListener('input', updateDistanceValue);
clickTimeThresholdSlider.addEventListener('input', updateTimeValue);
saveAdvancedButton.addEventListener('click', saveAdvancedSettings);

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
 * Validate domains in the textarea
 * Highlights invalid domains and duplicates
 */
function validateDomains(): void {
  try {
    const domainsText = excludedDomainsTextarea.value.trim();
    const domainsList = domainsText ? domainsText.split('\n').map(d => d.trim()).filter(Boolean) : [];
    
    // Track validation issues
    const invalidDomains: string[] = [];
    const duplicateDomains: string[] = [];
    const seenDomains = new Set<string>();
    
    // Check each domain
    domainsList.forEach(domain => {
      // Remove leading www. for comparison
      const normalizedDomain = domain.replace(/^www\./, '');
      
      // Check for invalid domains (basic validation)
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(normalizedDomain)) {
        invalidDomains.push(domain);
      }
      
      // Check for duplicates
      if (seenDomains.has(normalizedDomain)) {
        duplicateDomains.push(domain);
      } else {
        seenDomains.add(normalizedDomain);
      }
    });
    
    // Show validation feedback
    if (invalidDomains.length > 0 || duplicateDomains.length > 0) {
      let feedbackMessage = '';
      
      if (invalidDomains.length > 0) {
        feedbackMessage += `Invalid domain${invalidDomains.length > 1 ? 's' : ''}: ${invalidDomains.join(', ')}. `;
      }
      
      if (duplicateDomains.length > 0) {
        feedbackMessage += `Duplicate domain${duplicateDomains.length > 1 ? 's' : ''}: ${duplicateDomains.join(', ')}. `;
      }
      
      domainValidationFeedback.textContent = feedbackMessage;
      
      // Add visual indicator to the textarea
      if (invalidDomains.length > 0) {
        excludedDomainsTextarea.classList.add('invalid-domain');
      } else {
        excludedDomainsTextarea.classList.remove('invalid-domain');
      }
      
      if (duplicateDomains.length > 0) {
        excludedDomainsTextarea.classList.add('duplicate-domain');
      } else {
        excludedDomainsTextarea.classList.remove('duplicate-domain');
      }
    } else {
      // Clear validation feedback
      domainValidationFeedback.textContent = '';
      excludedDomainsTextarea.classList.remove('invalid-domain', 'duplicate-domain');
    }
    
    // Also check if exclusions have changed
    checkExclusionsChanged();
  } catch (error) {
    console.error('Error validating domains:', error);
  }
}

/**
 * Add the current tab's domain to the exclusion list
 */
function addCurrentDomain(): void {
  try {
    // Get current active tab
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        try {
          // Extract domain from URL
          const url = new URL(tabs[0].url);
          const domain = url.hostname;
          
          // Get current domains
          const currentText = excludedDomainsTextarea.value.trim();
          const currentDomains = currentText ? currentText.split('\n').map(d => d.trim()).filter(Boolean) : [];
          
          // Check if domain already exists (ignoring www. prefix)
          const normalizedDomain = domain.replace(/^www\./, '');
          const domainExists = currentDomains.some(d => 
            d.replace(/^www\./, '') === normalizedDomain
          );
          
          if (!domainExists) {
            // Add domain to the list
            currentDomains.push(domain);
            excludedDomainsTextarea.value = currentDomains.join('\n');
            
            // Validate and update UI
            validateDomains();
            showSaveStatus(`Added ${domain} to exclusion list`);
          } else {
            showSaveStatus(`${domain} is already in the list`);
          }
        } catch (error) {
          console.error('Error parsing URL:', error);
          showSaveStatus('Error adding domain');
        }
      } else {
        showSaveStatus('No active tab found');
      }
    });
  } catch (error) {
    console.error('Error adding current domain:', error);
    showSaveStatus('Error adding domain');
  }
}

/**
 * Export domains to a text file
 */
function exportDomains(): void {
  try {
    const domainsText = excludedDomainsTextarea.value.trim();
    
    if (!domainsText) {
      showSaveStatus('No domains to export');
      return;
    }
    
    // Create blob with domains
    const blob = new Blob([domainsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    a.download = `excluded-domains-${date}.txt`;
    a.href = url;
    a.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    showSaveStatus('Domains exported');
  } catch (error) {
    console.error('Error exporting domains:', error);
    showSaveStatus('Error exporting domains');
  }
}

/**
 * Import domains from a text file
 */
function importDomains(event: Event): void {
  try {
    const input = event.target as HTMLInputElement;
    
    if (!input.files || input.files.length === 0) {
      return;
    }
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        if (!e.target || typeof e.target.result !== 'string') {
          throw new Error('Invalid file content');
        }
        
        const content = e.target.result;
        const domains = content
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        
        if (domains.length === 0) {
          showSaveStatus('No domains found in file');
          return;
        }
        
        // Get current domains
        const currentText = excludedDomainsTextarea.value.trim();
        const currentDomains = currentText ? currentText.split('\n').map(d => d.trim()).filter(Boolean) : [];
        
        // Merge domains (avoiding duplicates)
        const mergedDomains = [...new Set([...currentDomains, ...domains])];
        
        // Update textarea
        excludedDomainsTextarea.value = mergedDomains.join('\n');
        
        // Validate and update UI
        validateDomains();
        showSaveStatus(`Imported ${domains.length} domains`);
      } catch (error) {
        console.error('Error processing imported file:', error);
        showSaveStatus('Error importing domains');
      }
    };
    
    reader.onerror = () => {
      showSaveStatus('Error reading file');
    };
    
    reader.readAsText(file);
    
    // Reset file input
    input.value = '';
  } catch (error) {
    console.error('Error importing domains:', error);
    showSaveStatus('Error importing domains');
  }
}

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
 * Load settings from storage
 */
function loadSettings(): void {
  getStorage<ExtensionSettings>({
    enableExtension: DEFAULT_SETTINGS.enableExtension,
    activateTabs: DEFAULT_SETTINGS.activateTabs,
    supportMultipleUrls: DEFAULT_SETTINGS.supportMultipleUrls,
    excludedDomains: DEFAULT_SETTINGS.excludedDomains,
    directLinkOpen: DEFAULT_SETTINGS.directLinkOpen,
    // Advanced settings
    debounceThreshold: DEFAULT_SETTINGS.debounceThreshold,
    clickDistanceThreshold: DEFAULT_SETTINGS.clickDistanceThreshold,
    clickTimeThreshold: DEFAULT_SETTINGS.clickTimeThreshold,
    debugMode: DEFAULT_SETTINGS.debugMode,
    urlPatternType: DEFAULT_SETTINGS.urlPatternType
  }, (settings: ExtensionSettings) => {
    // Update checkbox states
    enableExtensionToggle.checked = settings.enableExtension;
    directLinkOpenToggle.checked = settings.directLinkOpen;
    activateTabsToggle.checked = settings.activateTabs;
    supportMultipleUrlsToggle.checked = settings.supportMultipleUrls;
    
    // Update domain exclusion list
    const domainsList = settings.excludedDomains || [];
    savedExclusionList = [...domainsList];
    excludedDomainsTextarea.value = domainsList.join('\n');
    
    // Update advanced settings
    debounceThresholdSlider.value = String(settings.debounceThreshold);
    debounceValueSpan.textContent = String(settings.debounceThreshold);
    
    clickDistanceThresholdSlider.value = String(settings.clickDistanceThreshold);
    distanceValueSpan.textContent = String(settings.clickDistanceThreshold);
    
    clickTimeThresholdSlider.value = String(settings.clickTimeThreshold);
    timeValueSpan.textContent = String(settings.clickTimeThreshold);
    
    debugModeToggle.checked = settings.debugMode;
    urlPatternSelect.value = settings.urlPatternType;
    
    // Run validation
    validateDomains();
    checkExclusionsChanged();
  });
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
 * Reset all settings including advanced settings
 */
function resetSettings(): void {
  try {
    // Ask for confirmation
    if (confirm('Reset all settings to defaults?')) {
      // Disable button while resetting
      resetSettingsButton.disabled = true;
      resetSettingsButton.classList.add('resetting');
      
      // Set all settings to defaults
      setStorage(DEFAULT_SETTINGS, () => {
        // Update UI
        loadSettings();
        showSaveStatus('All settings reset to defaults');
        
        // Notify background script
        safeBrowserCall(() => 
          browserAPI.runtime.sendMessage({
            action: 'settingsUpdated',
            settings: DEFAULT_SETTINGS
          })
        );
        
        // Re-enable button
        resetSettingsButton.disabled = false;
        resetSettingsButton.classList.remove('resetting');
      }, () => {
        // Handle error
        showSaveStatus('Error resetting settings');
        resetSettingsButton.disabled = false;
        resetSettingsButton.classList.remove('resetting');
      });
    }
  } catch (error) {
    console.error('Error resetting settings:', error);
    showSaveStatus('Error resetting settings');
    resetSettingsButton.disabled = false;
    resetSettingsButton.classList.remove('resetting');
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

/**
 * Toggle advanced settings visibility
 */
function toggleAdvancedSettings(): void {
  const isVisible = advancedSettingsDiv.classList.contains('visible');
  
  if (isVisible) {
    advancedSettingsDiv.classList.remove('visible');
    advancedSettingsDiv.classList.add('hidden');
    toggleAdvancedButton.textContent = 'Show';
    toggleAdvancedButton.classList.remove('active');
  } else {
    advancedSettingsDiv.classList.remove('hidden');
    advancedSettingsDiv.classList.add('visible');
    toggleAdvancedButton.textContent = 'Hide';
    toggleAdvancedButton.classList.add('active');
  }
}

/**
 * Update debounce value display
 */
function updateDebounceValue(): void {
  debounceValueSpan.textContent = debounceThresholdSlider.value;
}

/**
 * Update distance value display
 */
function updateDistanceValue(): void {
  distanceValueSpan.textContent = clickDistanceThresholdSlider.value;
}

/**
 * Update time value display
 */
function updateTimeValue(): void {
  timeValueSpan.textContent = clickTimeThresholdSlider.value;
}

/**
 * Save advanced settings
 */
function saveAdvancedSettings(): void {
  try {
    // Disable button while saving
    saveAdvancedButton.disabled = true;
    saveAdvancedButton.classList.add('saving');
    
    // Gather settings values
    const settings = {
      debounceThreshold: parseInt(debounceThresholdSlider.value, 10),
      clickDistanceThreshold: parseInt(clickDistanceThresholdSlider.value, 10),
      clickTimeThreshold: parseInt(clickTimeThresholdSlider.value, 10),
      debugMode: debugModeToggle.checked,
      urlPatternType: urlPatternSelect.value
    };
    
    // Save to storage
    setStorage(settings, () => {
      // Notify background script of changes
      safeBrowserCall(() => 
        browserAPI.runtime.sendMessage({
          action: 'settingsUpdated',
          settings: settings
        })
      );
      
      // Update UI
      showAdvancedSaveStatus('Advanced settings saved');
      
      // Re-enable button
      saveAdvancedButton.disabled = false;
      saveAdvancedButton.classList.remove('saving');
      
      // Add animation class for smooth transition
      advancedSettingsDiv.classList.add('closing');
      
      // Hide advanced settings panel after the animation completes
      setTimeout(() => {
        toggleAdvancedSettings();
        // Remove the animation class after toggle completes
        setTimeout(() => {
          advancedSettingsDiv.classList.remove('closing');
        }, 300);
      }, 1000);
    }, () => {
      // Handle error
      showAdvancedSaveStatus('Error saving settings');
      saveAdvancedButton.disabled = false;
      saveAdvancedButton.classList.remove('saving');
    });
  } catch (error) {
    console.error('Error saving advanced settings:', error);
    showAdvancedSaveStatus('Error saving settings');
    saveAdvancedButton.disabled = false;
    saveAdvancedButton.classList.remove('saving');
  }
}

/**
 * Show save status for advanced settings
 */
function showAdvancedSaveStatus(message: string): void {
  advancedSaveStatus.textContent = message;
  advancedSaveStatus.classList.add('visible');
  
  // Clear after a few seconds
  setTimeout(() => {
    advancedSaveStatus.classList.remove('visible');
  }, 3000);
} 