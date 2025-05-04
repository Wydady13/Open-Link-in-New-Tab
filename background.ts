import { isValidUrl, normalizeUrl, extractUrls } from './utils/urlChecker';
import { browserAPI, isFirefox, safeBrowserCall, getStorage, setStorage } from './utils/browserAPI';

// Menu item constants
const MENU_ID = 'openLinkInNewTab';
const MENU_TITLE = '🔗 Open Link in New Tab';

// Extension settings with defaults
const settings: {
  enableExtension: boolean;
  activateTabs: boolean;
  supportMultipleUrls: boolean;
  excludedDomains: string[];
  directLinkOpen: boolean;
} = {
  enableExtension: true,
  activateTabs: false,
  supportMultipleUrls: true,
  excludedDomains: [],
  directLinkOpen: true
};

// Queue for opening URLs to prevent race conditions
let openingQueue: string[] = [];
let isProcessingQueue = false;
let previousEnableState = true;

// Create context menu item when extension is installed or updated
browserAPI.runtime.onInstalled.addListener(() => {
  // Create context menu
  browserAPI.contextMenus.create({
    id: MENU_ID,
    title: MENU_TITLE,
    contexts: ['link', 'selection']
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
    directLinkOpen: true  // Default to true for direct link opening
  }, (items) => {
    // Track previous enable state before updating
    previousEnableState = settings.enableExtension;
    
    // Update settings
    Object.assign(settings, items);
    
    // If extension was enabled after being disabled, clear the queue
    if (settings.enableExtension && !previousEnableState) {
      clearOpeningQueue();
    }
    
    updateContextMenu();
  });
}

// Update context menu based on extension enabled/disabled state
function updateContextMenu(): void {
  // Update menu visibility based on whether extension is enabled
  try {
    browserAPI.contextMenus.update(MENU_ID, {
      visible: settings.enableExtension && !settings.directLinkOpen // Hide menu if direct open is enabled
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
  if (!tab?.id || info.menuItemId !== MENU_ID || !settings.enableExtension) return;

  if (info.linkUrl) {
    // Handle clicked link
    const url = info.linkUrl;
    
    if (!isExcludedDomain(url)) {
      queueUrlForOpening(url);
    }
  } else if (info.selectionText && settings.supportMultipleUrls) {
    // Handle selected text (if multiple URLs support is enabled)
    const selectedText = info.selectionText.trim();
    
    // Check for multiple URLs (separated by newlines)
    const urls = extractUrls(selectedText);
    
    if (urls.length > 0) {
      // Open all valid, non-excluded URLs in new tabs
      urls.filter(url => !isExcludedDomain(url))
          .forEach(url => queueUrlForOpening(url));
    }
  }
});

// Check if a URL is from an excluded domain
function isExcludedDomain(url: string): boolean {
  try {
    if (!settings.excludedDomains.length) return false;
    
    const hostname = new URL(url).hostname;
    return settings.excludedDomains.some(domain => {
      const cleanDomain = domain.replace(/^www\./, '');
      return hostname === cleanDomain || hostname.endsWith('.' + cleanDomain);
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
      const urls = extractUrls(message.text);
      if (urls.length > 0) {
        urls.filter(url => !isExcludedDomain(url))
            .forEach(url => queueUrlForOpening(url));
      }
    }
    
    sendResponse({ 
      showContextMenu: isValid && !settings.directLinkOpen,
      directOpen: directOpen
    });
  } 
  // Check if we should directly open a link on right-click
  else if (message.action === 'shouldOpenLink' || message.action === 'directLinkClick') {
    const shouldIntercept = settings.enableExtension && settings.directLinkOpen;
    
    if (shouldIntercept && !isExcludedDomain(message.url)) {
      // Open the link directly if not excluded
      queueUrlForOpening(message.url);
    }
    
    sendResponse({ 
      shouldOpen: shouldIntercept,
      shouldIntercept: shouldIntercept
    });
  } 
  // Get the current extension enabled state
  else if (message.action === 'getExtensionState') {
    sendResponse({ enabled: settings.enableExtension });
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
      
      Object.assign(settings, message.settings);
      
      // If extension was disabled, clear the queue
      if (!settings.enableExtension && previousEnableState) {
        clearOpeningQueue();
      }
      
      // Notify content scripts about the state change if needed
      if (enableStateChanging) {
        notifyExtensionStateChange();
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