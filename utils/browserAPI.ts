/**
 * Browser API utility module to provide cross-browser compatibility
 */

// Type definition for the browser object (for Firefox)
declare const browser: typeof chrome;

// Detect browser type
export const isFirefox = typeof browser !== 'undefined';

// Use appropriate browser API
export const browserAPI = isFirefox ? browser : chrome;

// Helper functions for cross-browser compatibility

/**
 * Safely executes a browser API function with error handling
 */
export function safeBrowserCall<T>(
  apiCall: () => Promise<T> | void, 
  errorCallback?: (error: any) => void
): void {
  try {
    const result = apiCall();
    
    // Handle promise if returned
    if (result && typeof (result as Promise<T>).catch === 'function') {
      (result as Promise<T>).catch(err => {
        if (errorCallback) {
          errorCallback(err);
        } else {
          console.error('Browser API error:', err);
        }
      });
    }
  } catch (error) {
    if (errorCallback) {
      errorCallback(error);
    } else {
      console.error('Browser API error:', error);
    }
  }
}

/**
 * Gets a value safely from storage with proper error handling
 */
export function getStorage<T>(
  key: string | object, 
  callback: (result: T) => void,
  defaultValue?: T
): void {
  safeBrowserCall(
    () => {
      browserAPI.storage.sync.get(key, (result) => {
        const error = browserAPI.runtime.lastError;
        if (error) {
          console.error('Storage get error:', error);
          if (defaultValue !== undefined) {
            callback(defaultValue as T);
          }
        } else {
          callback(result as T);
        }
      });
    },
    (error) => {
      console.error('Storage get failed:', error);
      if (defaultValue !== undefined) {
        callback(defaultValue as T);
      }
    }
  );
}

/**
 * Sets a value safely to storage with proper error handling
 */
export function setStorage(
  data: object,
  callback?: () => void,
  errorCallback?: () => void
): void {
  safeBrowserCall(
    () => {
      browserAPI.storage.sync.set(data, () => {
        const error = browserAPI.runtime.lastError;
        if (error) {
          console.error('Storage set error:', error);
          if (errorCallback) errorCallback();
        } else {
          if (callback) callback();
        }
      });
    },
    (error) => {
      console.error('Storage set failed:', error);
      if (errorCallback) errorCallback();
    }
  );
} 