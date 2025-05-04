# Open Link in New Tab Extension

A powerful browser extension that adds right-click functionality to open links and selected URLs in a new background tab. Built with TypeScript for Chrome and Firefox.

## Features

- **Direct Link Opening**: Right-click on links to open them immediately in a new tab
- **Text URL Recognition**: Select text containing URLs and open them with a right-click
- **Multiple URL Support**: Open multiple URLs simultaneously when they're separated by newlines
- **Domain Exclusions**: Specify domains that should never be opened by the extension
- **Tab Behavior Control**: Choose whether new tabs should be activated or remain in the background
- **Smart URL Handling**: Automatically adds https:// to URLs if no protocol is specified
- **Support for Special URLs**: Works with localhost and file:// links

## Installation

### Chrome Web Store

*Coming soon*

### Firefox Add-ons

*Coming soon*

### Installing from Source

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run build`
4. Load the extension:
   - **Chrome**: 
     1. Open `chrome://extensions/`
     2. Enable "Developer mode" (toggle in the top right)
     3. Click "Load unpacked"
     4. Select the `dist` folder
   - **Firefox**: 
     1. Open `about:debugging`
     2. Click "This Firefox"
     3. Click "Load Temporary Add-on"
     4. Select the `manifest.json` file from the `dist` folder

## Usage

### Opening Links

1. Right-click on any link while browsing
2. The link will open automatically in a new tab (with direct link opening enabled)
3. Alternatively, use the context menu item if direct opening is disabled

### Opening URLs from Text

1. Select any text that contains a URL (e.g., "Visit example.com for more info")
2. Right-click on the selection
3. The URL will be detected and opened in a new tab

### Opening Multiple URLs

1. Select multiple URLs that are separated by newlines
2. Right-click on the selection
3. All valid URLs will open in separate tabs

### Configuration

Click the extension icon in your browser toolbar to access settings:

- **Enable Extension**: Turn the extension on or off
- **Direct Link Opening**: Open links immediately on right-click without showing a context menu
- **Activate New Tabs**: Automatically switch to new tabs when opened
- **Support Multiple URLs**: Enable opening multiple URLs from selected text
- **Excluded Domains**: Specify domains that should not be opened by the extension

## Development

### Project Structure

```
extension/
├── manifest.json      # Extension manifest
├── background.ts      # Background service worker
├── contentScript.ts   # Content script for webpage interaction
├── utils/
│   └── urlChecker.ts  # URL validation utilities
├── popup/
│   ├── popup.html     # Settings popup HTML
│   ├── popup.css      # Popup styles
│   └── popup.ts       # Popup functionality
├── tsconfig.json      # TypeScript configuration
├── webpack.config.js  # Build configuration
└── package.json       # Dependencies and scripts
```

### Development Commands

- `npm run dev`: Start development mode with automatic rebuilding
- `npm run build`: Build the extension for production
- `npm run lint`: Lint the codebase

## Troubleshooting

- **Extension not working**: Make sure it's enabled in the popup settings
- **Link opening multiple times**: This can happen with certain page configurations. Try reloading the page.
- **URLs not being detected**: Make sure the text is properly selected and contains a valid URL
- **Links not opening immediately**: Check if direct link opening is enabled in the settings

## Future Plans

- Add keyboard shortcuts for common operations
- Implement domain groups for better organization of exclusions
- Add dark mode support for the popup interface
- Improve performance on large pages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 