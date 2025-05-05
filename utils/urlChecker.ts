/**
 * Checks if a string looks like a valid URL
 * Accepts patterns like: example.com, www.example.com, https://example.com
 * 
 * @param text The text to check
 * @param patternType The pattern sensitivity: 'strict', 'standard', or 'relaxed'
 */
export function isValidUrl(text: string, patternType: string = 'standard'): boolean {
  // Trim whitespace and check if empty
  const trimmedText = text.trim();
  if (!trimmedText) {
    return false;
  }

  // Choose URL regex pattern based on pattern type
  let urlPattern: RegExp;
  
  switch (patternType) {
    case 'strict':
      // Strict pattern - only matches well-formed URLs with common TLDs
      urlPattern = /^(https?:\/\/|file:\/\/|www\.)([-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6})\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/i;
      break;
      
    case 'relaxed':
      // Relaxed pattern - catches more potential URLs including single-word domains
      urlPattern = /^(https?:\/\/|file:\/\/|www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)*|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/[^/\s]*)*$/i;
      break;
      
    case 'standard':
    default:
      // Standard pattern (default) - balanced approach
      urlPattern = /^(https?:\/\/|file:\/\/|www\.)?(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)(:\d+)?(\/[^/\s]*)*/i;
      break;
  }
  
  return urlPattern.test(trimmedText);
}

/**
 * Ensures a URL has a protocol (defaults to https:// if none is present)
 */
export function normalizeUrl(url: string): string {
  const trimmedUrl = url.trim();
  
  // Check for existing protocol
  if (/^(https?|file):\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }
  
  // Check if it's localhost
  if (/^localhost(:\d+)?/i.test(trimmedUrl)) {
    return `http://${trimmedUrl}`;
  }
  
  // Add https:// for all other URLs
  return `https://${trimmedUrl}`;
}

/**
 * Extracts multiple URLs from text (separated by newlines)
 * 
 * @param text The text to extract URLs from
 * @param patternType The pattern sensitivity: 'strict', 'standard', or 'relaxed'
 */
export function extractUrls(text: string, patternType: string = 'standard'): string[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line);
  return lines.filter(line => isValidUrl(line, patternType)).map(normalizeUrl);
} 