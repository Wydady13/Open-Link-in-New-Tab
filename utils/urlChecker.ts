/**
 * Checks if a string looks like a valid URL
 * Accepts patterns like: example.com, www.example.com, https://example.com
 */
export function isValidUrl(text: string): boolean {
  // Trim whitespace and check if empty
  const trimmedText = text.trim();
  if (!trimmedText) {
    return false;
  }

  // URL regex pattern
  // Matches domains like example.com, www.example.com, sub.example.co.uk
  // Also matches URLs with protocols like http://, https://, file://
  // Supports localhost and IP addresses
  const urlPattern = /^(https?:\/\/|file:\/\/|www\.)?(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)(:\d+)?(\/[^/\s]*)*/i;
  
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
 */
export function extractUrls(text: string): string[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line);
  return lines.filter(isValidUrl).map(normalizeUrl);
} 