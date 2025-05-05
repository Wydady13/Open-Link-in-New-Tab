import { isValidUrl, normalizeUrl, extractUrls } from './utils/urlChecker';
import { browserAPI, isFirefox, safeBrowserCall, getStorage, setStorage } from './utils/browserAPI';

// Menu item constants
const MENU_ID = 'openLinkInNewTab';
const MENU_TITLE = '🔗 Open Link in New Tab';
const MULTI_URL_MENU_ID = 'openMultipleUrls';
const MULTI_URL_MENU_TITLE = '🔗🔗 Open Multiple URLs';

// Extension settings with defaults
const settings: {
  enableExtension: boolean;
  activateTabs: boolean;
  supportMultipleUrls: boolean;
  excludedDomains: string[];
  directLinkOpen: boolean;
  // Advanced settings
  debounceThreshold: number;
  clickDistanceThreshold: number;
  clickTimeThreshold: number;
  debugMode: boolean;
  urlPatternType: string;
} = {
  enableExtension: true,
  activateTabs: false,
  supportMultipleUrls: true,
  excludedDomains: [],
  directLinkOpen: true,
  // Advanced settings with defaults
  debounceThreshold: 500,
  clickDistanceThreshold: 5,
  clickTimeThreshold: 300,
  debugMode: false,
  urlPatternType: 'standard'
};

// Queue for opening URLs to prevent race conditions
let openingQueue: string[] = [];
let isProcessingQueue = false;
let previousEnableState = true;

// Track processed request IDs to prevent duplicates
const processedRequestIds = new Set<string>();
const REQUEST_ID_EXPIRY = 2000; // ms - time to keep request IDs in memory

// Create context menu items when extension is installed or updated
browserAPI.runtime.onInstalled.addListener(() => {
  // Create single link context menu
  browserAPI.contextMenus.create({
    id: MENU_ID,
    title: MENU_TITLE,
    contexts: ['link', 'selection']
  });
  
  // Create multiple URLs context menu
  browserAPI.contextMenus.create({
    id: MULTI_URL_MENU_ID,
    title: MULTI_URL_MENU_TITLE,
    contexts: ['selection']
  });

  // Initialize settings
  loadSettings();
});

// Load settings from storage
function loadSettings(): void {
  browserAPI.storage.sync.get({
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
  }, (items) => {
    // Track previous enable state before updating
    previousEnableState = settings.enableExtension;
    
    // Update settings
    Object.assign(settings, items);
    
    // If extension was enabled after being disabled, clear the queue
    if (settings.enableExtension && !previousEnableState) {
      clearOpeningQueue();
    }
    
    // Configure debugging based on settings
    if (settings.debugMode) {
      console.log('Loaded settings:', settings);
    }
    
    updateContextMenu();
  });
}

// Update context menu based on extension enabled/disabled state
function updateContextMenu(): void {
  // Update menu visibility based on whether extension is enabled
  try {
    // Update main context menu item
    browserAPI.contextMenus.update(MENU_ID, {
      visible: settings.enableExtension && !settings.directLinkOpen // Hide menu if direct open is enabled
    });
    
    // Update multiple URLs context menu item
    browserAPI.contextMenus.update(MULTI_URL_MENU_ID, {
      visible: settings.enableExtension && settings.supportMultipleUrls
    });
  } catch (error) {
    // Some browsers might not fully support this API
    console.error("Error updating context menu:", error);
  }
}

// Clear the opening queue
function clearOpeningQueue(): void {
  openingQueue = [];
  isProcessingQueue = false;
  console.log('Queue cleared due to extension state change');
}

// Handle context menu item click
browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !settings.enableExtension) return;

  // Handle single link opening
  if (info.menuItemId === MENU_ID) {
    if (info.linkUrl) {
      // Handle clicked link
      const url = info.linkUrl;
      
      if (!isExcludedDomain(url)) {
        queueUrlForOpening(url);
      }
    } else if (info.selectionText && settings.supportMultipleUrls) {
      // Handle selected text (if multiple URLs support is enabled)
      const selectedText = info.selectionText.trim();
      
      // Extract and open URLs
      openMultipleUrls(selectedText);
    }
  }
  // Handle multiple URLs opening
  else if (info.menuItemId === MULTI_URL_MENU_ID && info.selectionText) {
    const selectedText = info.selectionText.trim();
    
    // For better user experience, notify the content script first
    // This allows the content script to highlight the selection or provide visual feedback
    if (tab.id) {
      browserAPI.tabs.sendMessage(tab.id, {
        action: 'openMultipleFromSelection',
        text: selectedText
      }).catch(error => {
        // If sending to content script fails (e.g., not loaded), open directly
        console.log('Could not send to content script, opening directly:', error);
        openMultipleUrls(selectedText);
      });
    } else {
      // Fallback if tab ID is not available
      openMultipleUrls(selectedText);
    }
  }
});

/**
 * Process text and open all valid URLs found - with URL pattern sensitivity
 */
function openMultipleUrls(text: string): void {
  // Check for multiple URLs with appropriate URL pattern sensitivity
  const urls = extractUrls(text, settings.urlPatternType);
  
  if (urls.length > 0) {
    if (settings.debugMode) {
      console.log(`Found ${urls.length} URLs in text with pattern type ${settings.urlPatternType}`);
    }
    
    // Open all valid, non-excluded URLs in new tabs
    urls.filter(url => !isExcludedDomain(url))
        .forEach(url => queueUrlForOpening(url));
  }
}

// Check if a URL is from an excluded domain
function isExcludedDomain(url: string): boolean {
  try {
    if (!settings.excludedDomains.length) return false;
    
    const hostname = new URL(url).hostname;
    // Normalize domain by removing www. prefix for comparison
    const normalizedHostname = hostname.replace(/^www\./, '');
    
    return settings.excludedDomains.some(domain => {
      // Normalize each excluded domain by removing www. prefix
      const cleanDomain = domain.replace(/^www\./, '');
      return normalizedHostname === cleanDomain || normalizedHostname.endsWith('.' + cleanDomain);
    });
  } catch (e) {
    console.error('Error checking excluded domain:', e);
    return false;
  }
}

// Queue URL for opening to prevent race conditions
function queueUrlForOpening(url: string): void {
  // Only add to queue if extension is enabled
  if (!settings.enableExtension) {
    console.log('URL not added to queue because extension is disabled:', url);
    return;
  }
  
  // Add URL to queue
  openingQueue.push(url);
  
  // Start processing the queue if not already in progress
  if (!isProcessingQueue) {
    processUrlQueue();
  }
}

// Process URL queue one at a time
async function processUrlQueue(): Promise<void> {
  isProcessingQueue = true;
  
  while (openingQueue.length > 0 && settings.enableExtension) {
    const url = openingQueue.shift() as string;
    await openUrlInNewTab(url);
    
    // Brief delay to prevent overloading the browser
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  isProcessingQueue = false;
}

// Message handler for various actions
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if selected text is a valid URL
  if (message.action === 'checkSelection') {
    const isValid = settings.enableExtension && isValidUrl(message.text);
    const directOpen = isValid && settings.directLinkOpen;
    
    if (directOpen && settings.supportMultipleUrls) {
      // If direct open is enabled and text is valid URL, open it
      openMultipleUrls(message.text);
    }
    
    sendResponse({ 
      showContextMenu: isValid && !settings.directLinkOpen,
      directOpen: directOpen
    });
  } 
  // Handle opening multiple URLs from selection
  else if (message.action === 'openMultipleUrls' && message.text) {
    if (settings.enableExtension && settings.supportMultipleUrls) {
      openMultipleUrls(message.text);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  }
  // Check if we should directly open a link on right-click
  else if (message.action === 'shouldOpenLink' || message.action === 'directLinkClick') {
    const shouldIntercept = settings.enableExtension && settings.directLinkOpen;
    
    // For shouldOpenLink action, just return if we should intercept without opening
    if (message.action === 'shouldOpenLink') {
      sendResponse({ 
        shouldIntercept: shouldIntercept
      });
      return;
    }
    
    // For directLinkClick, actually open the URL if appropriate
    if (shouldIntercept && !isExcludedDomain(message.url)) {
      // Queue the URL for opening
      queueUrlForOpening(message.url);
      
      // Respond that we've handled it
      sendResponse({ 
        shouldOpen: true,
        shouldIntercept: shouldIntercept
      });
      return;
    }
    
    // Default response
    sendResponse({ 
      shouldOpen: false,
      shouldIntercept: shouldIntercept
    });
  } 
  // Get the current extension enabled state
  else if (message.action === 'getExtensionState') {
    sendResponse({ enabled: settings.enableExtension });
  }
  // Get advanced settings for content script
  else if (message.action === 'getAdvancedSettings') {
    sendResponse({
      debounceThreshold: settings.debounceThreshold,
      clickDistanceThreshold: settings.clickDistanceThreshold,
      clickTimeThreshold: settings.clickTimeThreshold,
      debugMode: settings.debugMode,
      urlPatternType: settings.urlPatternType
    });
  }
  // Return the current domain for the addCurrentDomain feature
  else if (message.action === 'getCurrentDomain') {
    // This is used by the popup to get the current tab's domain
    if (sender.tab && sender.tab.url) {
      try {
        const url = new URL(sender.tab.url);
        sendResponse({ domain: url.hostname });
      } catch (e) {
        sendResponse({ error: 'Invalid URL' });
      }
    } else {
      sendResponse({ error: 'No active tab' });
    }
  }
  // Handle settings updates
  else if (message.action === 'settingsUpdated') {
    // Track previous enable state before updating
    previousEnableState = settings.enableExtension;
    
    // Update settings when changes are made in the popup
    if (message.settings) {
      // Check if we're updating the enabled state
      const enableStateChanging = 
        typeof message.settings.enableExtension !== 'undefined' && 
        message.settings.enableExtension !== settings.enableExtension;
      
      // Check if advanced settings are changing
      const advancedSettingsChanging = 
        (typeof message.settings.debounceThreshold !== 'undefined' && 
        message.settings.debounceThreshold !== settings.debounceThreshold) ||
        (typeof message.settings.clickDistanceThreshold !== 'undefined' && 
        message.settings.clickDistanceThreshold !== settings.clickDistanceThreshold) ||
        (typeof message.settings.clickTimeThreshold !== 'undefined' && 
        message.settings.clickTimeThreshold !== settings.clickTimeThreshold) ||
        (typeof message.settings.debugMode !== 'undefined' && 
        message.settings.debugMode !== settings.debugMode) ||
        (typeof message.settings.urlPatternType !== 'undefined' && 
        message.settings.urlPatternType !== settings.urlPatternType);
      
      Object.assign(settings, message.settings);
      
      // Log changes if debug mode is enabled
      if (settings.debugMode) {
        console.log('Settings updated:', settings);
      }
      
      // If extension was disabled, clear the queue
      if (!settings.enableExtension && previousEnableState) {
        clearOpeningQueue();
      }
      
      // Notify content scripts about the state change if needed
      if (enableStateChanging) {
        notifyExtensionStateChange();
      }
      
      // Notify content scripts about advanced settings changes if needed
      if (advancedSettingsChanging) {
        notifyAdvancedSettingsChange();
      }
      
      updateContextMenu();
    }
  }
  
  // Required for Firefox to handle async responses
  return isFirefox ? new Promise(resolve => {
    // Firefox requires a Promise to be returned for async messaging
    setTimeout(() => resolve(true), 1);
  }) : true;
});

/**
 * Notify all content scripts about extension state changes
 */
function notifyExtensionStateChange(): void {
  browserAPI.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        try {
          browserAPI.tabs.sendMessage(tab.id, {
            action: 'extensionStateChanged',
            enabled: settings.enableExtension
          }).catch(() => {
            // Ignore errors - content script might not be loaded on some tabs
          });
        } catch (e) {
          // Ignore errors in some browsers
        }
      }
    });
  });
}

/**
 * Notify all content scripts about advanced settings changes
 */
function notifyAdvancedSettingsChange(): void {
  browserAPI.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        try {
          browserAPI.tabs.sendMessage(tab.id, {
            action: 'advancedSettingsUpdated',
            settings: {
              debounceThreshold: settings.debounceThreshold,
              clickDistanceThreshold: settings.clickDistanceThreshold,
              clickTimeThreshold: settings.clickTimeThreshold,
              debugMode: settings.debugMode,
              urlPatternType: settings.urlPatternType
            }
          }).catch(() => {
            // Ignore errors - content script might not be loaded on some tabs
          });
        } catch (e) {
          // Ignore errors in some browsers
        }
      }
    });
  });
}

// Function to inject content script for selection validation
browserAPI.tabs.onActivated.addListener((activeInfo) => {
  if (activeInfo.tabId && settings.enableExtension) {
    try {
      // Chrome/Edge way
      if (!isFirefox) {
        browserAPI.scripting.executeScript({
          target: { tabId: activeInfo.tabId },
          files: ['contentScript.js']
        }).catch(err => console.error('Script injection failed:', err));
      } else {
        // Firefox way
        browserAPI.tabs.executeScript(activeInfo.tabId, {
          file: 'contentScript.js'
        }).catch(err => console.error('Script injection failed:', err));
      }
    } catch (error) {
      console.error('Error injecting script:', error);
    }
  }
});

// Helper function to open URL in new background tab
async function openUrlInNewTab(url: string): Promise<void> {
  // Double-check that extension is still enabled before opening
  if (!settings.enableExtension) {
    console.log('URL not opened because extension is now disabled:', url);
    return Promise.resolve();
  }
  
  return new Promise((resolve) => {
    browserAPI.tabs.create({ 
      url: url,
      active: settings.activateTabs  // Use setting to determine if tab should be activated
    }, () => {
      // Check for any browser errors
      const err = browserAPI.runtime.lastError;
      if (err) {
        console.error('Error opening tab:', err);
      }
      resolve();
    });
  });
} 