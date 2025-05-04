/**
 * Content script to detect when text is selected and validate if it looks like a URL
 */

import { browserAPI, safeBrowserCall } from './utils/browserAPI';

// Track if we've already handled the current right-click
let handledRightClick = false;

// Debounce mechanism
let lastOpenTime = 0;
const DEBOUNCE_THRESHOLD = 500; // ms

// Extension state
let isExtensionEnabled = true;

// Initialize extension state
checkExtensionState();

// Listen for mouseup events to detect text selection
document.addEventListener('mouseup', handleSelection, { passive: true });
// Listen for contextmenu events to update context menu visibility
document.addEventListener('contextmenu', handleContextMenu, true);
// Listen for right click on links - use capture phase for earlier interception
document.addEventListener('mousedown', handleLinkRightClick, true);
// Listen for auxclick events to catch middle/right clicks that might be missed
document.addEventListener('auxclick', handleAuxClick, true);

/**
 * Check the current extension state
 */
function checkExtensionState(): void {
  try {
    browserAPI.runtime.sendMessage({ action: 'getExtensionState' }, (response) => {
      if (response && typeof response.enabled === 'boolean') {
        isExtensionEnabled = response.enabled;
      }
    });
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error checking extension state:', e);
  }
}

/**
 * Extracts link information from an element
 * @returns Link element or null if not found
 */
function extractLinkInfo(target: HTMLElement): HTMLAnchorElement | null {
  try {
    // Try different methods to find the link
    if (target.tagName === 'A') {
      return target as HTMLAnchorElement;
    } else if (target.closest('a')) {
      return target.closest('a') as HTMLAnchorElement;
    } else {
      // Try to find if we're clicking on something inside a button that acts like a link
      const buttonElement = target.closest('button') || 
                           target.closest('[role="button"]') || 
                           target.closest('[onclick]');
      
      if (buttonElement) {
        // Check for onclick handlers that might be navigation
        if (buttonElement.hasAttribute('href') || 
            buttonElement.hasAttribute('data-href') || 
            buttonElement.onclick) {
          // Extract URL from data attributes that might contain links
          const possibleUrl = buttonElement.getAttribute('href') || 
                             buttonElement.getAttribute('data-href') || 
                             buttonElement.getAttribute('data-url') ||
                             buttonElement.getAttribute('data-link');
          
          if (possibleUrl) {
            // Create a synthetic anchor element
            const linkElement = document.createElement('a');
            linkElement.href = possibleUrl;
            return linkElement;
          }
        }
      }
    }
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error extracting link info:', e);
  }
  
  return null;
}

/**
 * Checks if a link should be processed
 * @returns true if link should be processed, false otherwise
 */
function shouldProcessLink(href: string): boolean {
  try {
    // Handle special cases where links have javascript: protocol or are empty
    if (href.startsWith('javascript:') || 
        href === '#' || 
        href === 'about:blank') {
      return false;
    }
    
    // Special handling for elements with click handlers but no real href
    if (href === window.location.href + '#') {
      return false;
    }
    
    // Check for data: URLs - these should generally be processed
    if (href.startsWith('data:')) {
      return true;
    }
    
    return true;
  } catch (e) {
    // Handle errors gracefully
    console.error('Error checking link:', e);
    return false;
  }
}

/**
 * Auxiliary click handler (for middle/right clicks)
 */
function handleAuxClick(event: MouseEvent): void {
  try {
    // Only handle right clicks (button 2)
    if (event.button !== 2) return;
    
    // If already handled by mousedown, don't process again
    if (handledRightClick) return;
    
    // Check if extension is enabled
    if (!isExtensionEnabled) return;
    
    // Process link if it hasn't been caught by the mousedown handler
    const target = event.target as HTMLElement;
    const linkElement = extractLinkInfo(target);
    
    if (linkElement && linkElement.href && shouldProcessLink(linkElement.href)) {
      browserAPI.runtime.sendMessage({
        action: 'shouldOpenLink',
        url: linkElement.href
      }, (response) => {
        if (response && response.shouldOpen) {
          // Prevent the default behavior
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error in auxclick handler:', e);
  }
}

/**
 * Handles direct link opening on right-click
 */
function handleLinkRightClick(event: MouseEvent): void {
  try {
    // Only handle right clicks (button 2)
    if (event.button !== 2) return;
    
    // Check if extension is enabled first
    if (!isExtensionEnabled) return;

    // Debounce - prevent multiple openings within a short time period
    const now = Date.now();
    if (now - lastOpenTime < DEBOUNCE_THRESHOLD) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // Extract link information
    const target = event.target as HTMLElement;
    const linkElement = extractLinkInfo(target);
    
    if (linkElement && linkElement.href && shouldProcessLink(linkElement.href)) {
      // Check if extension is enabled through a message to background
      browserAPI.runtime.sendMessage({
        action: 'shouldOpenLink',
        url: linkElement.href
      }, (response) => {
        if (response && response.shouldOpen) {
          // Mark that we've handled this right-click
          handledRightClick = true;
          lastOpenTime = Date.now();
          
          // Prevent the default context menu and stop event propagation
          event.preventDefault();
          event.stopPropagation();
          
          // Some websites use custom context menus, so we need to be more aggressive
          // Cancel any pending context menu
          setTimeout(() => {
            // Add a delayed click handler to cancel any context menu that might appear
            document.addEventListener('contextmenu', function cancelContextMenu(e) {
              e.preventDefault();
              e.stopPropagation();
              document.removeEventListener('contextmenu', cancelContextMenu, true);
            }, true);
          }, 0);
        }
      });
    }
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error in mousedown handler:', e);
  }
}

/**
 * Handles text selection and sends it to background script for validation
 */
function handleSelection(): void {
  try {
    // Check if extension is enabled first
    if (!isExtensionEnabled) return;

    // Wait a brief moment to ensure selection is complete
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        browserAPI.runtime.sendMessage({
          action: 'checkSelection',
          text: selection.toString()
        });
      }
    }, 10);
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error handling selection:', e);
  }
}

/**
 * Handles context menu opening and checks if selected text is a valid URL
 */
function handleContextMenu(event: MouseEvent): void {
  try {
    // If we've already handled this right-click in mousedown, don't process it again
    if (handledRightClick) {
      handledRightClick = false; // Reset the flag
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // Check if extension is enabled first
    if (!isExtensionEnabled) return;

    // Debounce - prevent multiple openings within a short time period
    const now = Date.now();
    if (now - lastOpenTime < DEBOUNCE_THRESHOLD) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Check for link elements
    const target = event.target as HTMLElement;
    const linkElement = extractLinkInfo(target);
    
    // If clicking on a link, check if we should intercept and open directly
    if (linkElement && linkElement.href && shouldProcessLink(linkElement.href)) {
      // Don't handle links again in contextmenu if we're using direct link opening
      // This is handled in mousedown event
      return;
    }
    
    // Handle selected text
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      browserAPI.runtime.sendMessage({
        action: 'checkSelection',
        text: selection.toString()
      }, (response) => {
        // If the response indicates the extension should handle this text
        if (response && response.directOpen) {
          lastOpenTime = Date.now();
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error in contextmenu handler:', e);
  }
}

// Listen for extension state changes
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === 'extensionStateChanged') {
      isExtensionEnabled = message.enabled;
    }
  } catch (e) {
    // Handle errors gracefully to prevent script crashes
    console.error('Error handling message:', e);
  }
}); 