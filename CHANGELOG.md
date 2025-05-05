# Changelog

All notable changes to the "Open Link in New Tab" extension will be documented in this file.

## [1.1.0] - 2025-05-05

### Added
- Advanced settings panel for fine-tuning extension behavior
  - Debounce threshold adjustment (100-1000ms)
  - Click distance threshold adjustment (1-20px)
  - Click time threshold adjustment (100-1000ms)
  - URL detection sensitivity options (strict/standard/relaxed)
  - Debug mode toggle for troubleshooting
- Animated closing of advanced settings panel after saving
- Import/export functionality for domain exclusion lists
- "Add Current Domain" button for quick exclusion
- Improved TypeScript type safety
- GitHub workflow for automated builds and linting

### Fixed
- Browser compatibility issues between Chrome and Firefox
- Type safety improvements throughout the codebase
- Enhanced error handling in background and content scripts
- Fixed URL pattern matching for better accuracy
