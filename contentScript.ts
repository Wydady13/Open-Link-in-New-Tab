/**
 * Content script to detect when text is selected and validate if it looks like a URL
 */

// TypeScript declarations for browser API
declare const browser: typeof chrome;

// Use a self-executing function to isolate variables and avoid conflicts
(function() {
  // Browser API access - compatible with both Chrome and Firefox
  const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

  // Track if we've already handled the current right-click
  let handledRightClick = false;

  // Debounce mechanism - configurable via advanced settings
  let lastOpenTime = 0;
  let DEBOUNCE_THRESHOLD = 500; // ms - default, will be updated from settings

  // Extension state
  let isExtensionEnabled = true;
  let isContextValid = true;

  // Mouse tracking variables - configurable via advanced settings
  let mouseDownTarget: HTMLElement | null = null;
  let mouseDownTime = 0;
  let isIntentionalRightClick = false;
  let CLICK_DISTANCE_THRESHOLD = 5; // pixels - default, will be updated from settings
  let CLICK_TIME_THRESHOLD = 300; // ms - default, will be updated from settings

  // Request ID tracking to prevent duplicate opens
  let lastRequestId: string | null = null;

  // URL detection in text
  let currentSelection: string = '';
  let hasMultipleUrls: boolean = false;
  let urlPatternType: string = 'standard'; // default, will be updated from settings

  // Debug mode for troubleshooting
  let DEBUG = false; // default, will be updated from settings
  function debugLog(...args: any[]): void {
    if (DEBUG) console.log('[RightClickOpenLink]', ...args);
  }

  // Safe browser API call wrapper
  function safeBrowserCall<T>(
    apiCall: (...args: any[]) => Promise<T> | void,
    ...args: any[]
  ): Promise<T | void> {
    try {
      const result = apiCall(...args);
      if (result instanceof Promise) {
        return result.catch(handleError);
      }
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(handleError(err));
    }
  }

  // Error handler that checks for extension context invalidation
  function handleError(error: any): void {
    const errorMsg = error?.message || String(error);
    
    // Check for context invalidation
    if (errorMsg.includes('Extension context invalidated') || 
        errorMsg.includes('Invalid extension context')) {
      isContextValid = false;
      debugLog('Extension context invalidated - disabling listeners');
      removeAllListeners();
    }
    
    console.error('[RightClickOpenLink] Error:', errorMsg);
    return errorMsg;
  }

  // Remove all event listeners in case of context invalidation
  function removeAllListeners(): void {
    try {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('mousemove', handleMouseMove);
      debugLog('All listeners removed due to invalid context');
    } catch (e) {
      console.error('Error removing listeners:', e);
    }
  }

  // Initialize extension state
  function checkExtensionState(): void {
    try {
      safeBrowserCall(browserAPI.runtime.sendMessage, { action: 'getExtensionState' })
        .then((response: any) => {
          if (response && typeof response.enabled === 'boolean') {
            isExtensionEnabled = response.enabled;
            debugLog('Extension enabled state:', isExtensionEnabled);
          }
        })
        .catch(handleError);
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Track mouse movement to detect hovering vs. clicking
   */
  function handleMouseMove(event: MouseEvent): void {
    if (!isContextValid) return;
    
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }

  /**
   * Generate a unique request ID to prevent duplicate opens
   */
  function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Check if text contains URLs - more comprehensive pattern
   */
  function containsUrls(text: string): boolean {
    try {
      // More comprehensive URL pattern
      const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+\.[a-z]{2,}|[a-z0-9][-a-z0-9]+\.[a-z]{2,}\.[a-z]{2,}/i;
      return urlPattern.test(text);
    } catch (e) {
      handleError(e);
      return false;
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
      handleError(e);
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
      
      // Skip Chrome and browser internal pages
      if (href.startsWith('chrome://') || 
          href.startsWith('chrome-extension://') ||
          href.startsWith('about:') ||
          href.startsWith('moz-extension://')) {
        return false;
      }
      
      // Check for data: URLs - these should generally be processed
      if (href.startsWith('data:')) {
        return true;
      }
      
      return true;
    } catch (e) {
      handleError(e);
      return false;
    }
  }

  /**
   * Handles mouse down events
   */
  function handleMouseDown(event: MouseEvent): void {
    if (!isContextValid || !isExtensionEnabled) return;
    
    try {
      // Clear previous intentional click state
      isIntentionalRightClick = false;
      
      // Only track right clicks (button 2)
      if (event.button !== 2) return;
      
      // Store the target and time for later comparison
      mouseDownTarget = event.target as HTMLElement;
      mouseDownTime = Date.now();
      
      // Store mouse position
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Handles mouse up events
   */
  function handleMouseUp(event: MouseEvent): void {
    if (!isContextValid || !isExtensionEnabled) return;
    
    try {
      // Only care about right mouse button (button 2)
      if (event.button !== 2) return;
      
      // Calculate if this was an intentional click
      const clickDuration = Date.now() - mouseDownTime;
      const clickDistance = Math.sqrt(
        Math.pow(event.clientX - lastMouseX, 2) + 
        Math.pow(event.clientY - lastMouseY, 2)
      );
      
      // Only consider it an intentional click if:
      // 1. The mouse hasn't moved much (not a drag)
      // 2. The click duration is within a reasonable window
      // 3. The mousedown and mouseup targets are the same (or related)
      const sameTarget = !!(mouseDownTarget && event.target && (
        event.target === mouseDownTarget || 
        (event.target as HTMLElement).contains(mouseDownTarget) || 
        mouseDownTarget.contains(event.target as HTMLElement)
      ));
      
      isIntentionalRightClick = clickDistance < CLICK_DISTANCE_THRESHOLD && 
                              clickDuration < CLICK_TIME_THRESHOLD &&
                              sameTarget;
      
      // Process selection if any text is selected
      handleSelection();
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Handles text selection and sends it to background script for validation
   */
  function handleSelection(): void {
    if (!isContextValid || !isExtensionEnabled) return;
    
    try {
      // Wait a brief moment to ensure selection is complete
      setTimeout(() => {
        try {
          const selection = window.getSelection();
          if (selection && selection.toString().trim()) {
            // Store current selection for context menu use
            currentSelection = selection.toString().trim();
            
            // Check if the selection contains multiple URLs
            hasMultipleUrls = containsUrls(currentSelection);
            debugLog('Selection contains URLs:', hasMultipleUrls, 'Text:', currentSelection);
            
            // Send to background script for validation
            safeBrowserCall(browserAPI.runtime.sendMessage, {
              action: 'checkSelection',
              text: currentSelection
            }).catch(handleError);
          } else {
            // Clear selection state if nothing is selected
            currentSelection = '';
            hasMultipleUrls = false;
          }
        } catch (e) {
          handleError(e);
        }
      }, 10);
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Process a link element with the direct link opening feature
   */
  function processDirectLinkOpening(linkElement: HTMLAnchorElement, event: MouseEvent): void {
    if (!isContextValid) return;
    
    try {
      // Generate a request ID to prevent duplicate opens
      const requestId = generateRequestId();
      lastRequestId = requestId;
      
      debugLog('Processing direct link opening:', linkElement.href);
      
      // Send message to background script asking if we should open this link
      safeBrowserCall(browserAPI.runtime.sendMessage, {
        action: 'directLinkClick',
        url: linkElement.href,
        requestId: requestId
      })
      .then((response: any) => {
        if (response && response.shouldOpen) {
          // Mark that we've handled this right-click
          handledRightClick = true;
          lastOpenTime = Date.now();
          
          // Prevent the context menu from showing
          event.preventDefault();
          event.stopPropagation();
        }
      })
      .catch(handleError);
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Send selected text with multiple URLs to be opened
   */
  function processMultipleUrls(text?: string): void {
    if (!isContextValid) return;
    
    try {
      // Use provided text or current selection
      const textToProcess = text || currentSelection;
      
      if (!textToProcess) {
        debugLog('No text to process for multiple URLs');
        return;
      }
      
      debugLog('Processing multiple URLs from text:', textToProcess);
      
      // Send message to open multiple URLs
      safeBrowserCall(browserAPI.runtime.sendMessage, {
        action: 'openMultipleUrls',
        text: textToProcess
      })
      .then((response: any) => {
        debugLog('Response from opening multiple URLs:', response);
      })
      .catch(handleError);
      
      // Update last open time to prevent rapid reopening
      lastOpenTime = Date.now();
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Handles context menu opening
   */
  function handleContextMenu(event: MouseEvent): void {
    if (!isContextValid || !isExtensionEnabled) return;
    
    try {
      // If we've already handled this right-click, skip it
      if (handledRightClick) {
        handledRightClick = false; // Reset the flag
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      
      // Debounce - prevent multiple openings within a short time period
      const now = Date.now();
      if (now - lastOpenTime < DEBOUNCE_THRESHOLD) {
        return;
      }

      // Check for link elements
      const target = event.target as HTMLElement;
      const linkElement = extractLinkInfo(target);
      
      // If this is a link and direct link opening is enabled, process it
      if (linkElement && linkElement.href && shouldProcessLink(linkElement.href)) {
        // Check if the extension should intercept this link
        safeBrowserCall(browserAPI.runtime.sendMessage, {
          action: 'shouldOpenLink',
          url: linkElement.href
        })
        .then((response: any) => {
          if (response && response.shouldIntercept) {
            // Process the direct link opening
            processDirectLinkOpening(linkElement, event);
          }
        })
        .catch(handleError);
      } 
      // Otherwise check if selected text contains URLs
      else if (currentSelection && hasMultipleUrls) {
        debugLog('Context menu on text with URLs:', currentSelection);
        
        // If direct open is enabled, send to background script
        safeBrowserCall(browserAPI.runtime.sendMessage, {
          action: 'checkSelection',
          text: currentSelection
        })
        .then((response: any) => {
          // If we should handle the selected text directly
          if (response && response.directOpen) {
            processMultipleUrls();
            event.preventDefault();
            event.stopPropagation();
          }
          // Otherwise let the context menu show (background script will handle it)
        })
        .catch(handleError);
      }
    } catch (e) {
      handleError(e);
    }
  }

  /**
   * Load advanced settings from the background script
   */
  function loadAdvancedSettings(): void {
    try {
      safeBrowserCall(browserAPI.runtime.sendMessage, { action: 'getAdvancedSettings' })
        .then((response: any) => {
          if (response) {
            // Update threshold settings if available
            if (response.debounceThreshold) {
              DEBOUNCE_THRESHOLD = response.debounceThreshold;
            }
            
            if (response.clickDistanceThreshold) {
              CLICK_DISTANCE_THRESHOLD = response.clickDistanceThreshold;
            }
            
            if (response.clickTimeThreshold) {
              CLICK_TIME_THRESHOLD = response.clickTimeThreshold;
            }
            
            // Update debug mode
            if (typeof response.debugMode === 'boolean') {
              DEBUG = response.debugMode;
              debugLog('Debug mode enabled, settings loaded:', response);
            }
            
            // Update URL pattern type
            if (response.urlPatternType) {
              urlPatternType = response.urlPatternType;
              debugLog('URL pattern type set to:', urlPatternType);
            }
          }
        })
        .catch(handleError);
    } catch (e) {
      handleError(e);
    }
  }

  // Listen for extension state changes and messages from background script
  browserAPI.runtime.onMessage.addListener(function(
    message: any, 
    sender: chrome.runtime.MessageSender, 
    sendResponse: (response?: any) => void
  ) {
    if (!isContextValid) return false;
    
    try {
      debugLog('Received message:', message);
      
      if (message.action === 'extensionStateChanged') {
        isExtensionEnabled = message.enabled;
        sendResponse({ success: true });
      }
      // Add handler for open multiple URLs request from context menu
      else if (message.action === 'openMultipleFromSelection') {
        // Use the text from the message if provided, otherwise use current selection
        const textToProcess = message.text || currentSelection;
        debugLog('Opening multiple URLs from selection via context menu:', textToProcess);
        
        if (textToProcess) {
          processMultipleUrls(textToProcess);
          // Send response to confirm handling
          sendResponse({ success: true });
        } else {
          // Send response indicating failure
          sendResponse({ success: false, error: 'No text available' });
        }
      }
      // Add handler for advanced settings updates
      else if (message.action === 'advancedSettingsUpdated') {
        if (message.settings) {
          // Update threshold settings
          if (typeof message.settings.debounceThreshold === 'number') {
            DEBOUNCE_THRESHOLD = message.settings.debounceThreshold;
          }
          
          if (typeof message.settings.clickDistanceThreshold === 'number') {
            CLICK_DISTANCE_THRESHOLD = message.settings.clickDistanceThreshold;
          }
          
          if (typeof message.settings.clickTimeThreshold === 'number') {
            CLICK_TIME_THRESHOLD = message.settings.clickTimeThreshold;
          }
          
          // Update debug mode
          if (typeof message.settings.debugMode === 'boolean') {
            DEBUG = message.settings.debugMode;
            debugLog('Debug mode updated:', DEBUG);
          }
          
          // Update URL pattern type
          if (message.settings.urlPatternType) {
            urlPatternType = message.settings.urlPatternType;
            debugLog('URL pattern type updated:', urlPatternType);
          }
          
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No settings provided' });
        }
      } else {
        // Unknown message
        sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (e) {
      // Handle errors gracefully to prevent script crashes
      const errorMessage = (e as Error).message || 'Unknown error';
      console.error('Error handling message:', errorMessage);
      sendResponse({ success: false, error: errorMessage });
    }
    
    // Return true to indicate we'll handle the response asynchronously
    return true;
  });

  // Track mouse position
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Initialize and add event listeners
  function initialize(): void {
    // Check extension state
    checkExtensionState();
    
    // Load advanced settings
    loadAdvancedSettings();
    
    // Add event listeners only if context is valid
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    debugLog('Content script initialized');
  }

  // Start the extension
  initialize();
})(); 