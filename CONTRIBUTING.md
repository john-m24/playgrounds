# Contributing to Playgrounds Desktop

Thank you for your interest in contributing to Playgrounds Desktop! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- Git
- Docker (optional, for testing Docker playgrounds)
- VS Code or another editor for development

### Getting Started

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/your-username/playgrounds-desktop.git
   cd playgrounds-desktop
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development version:
   ```bash
   npm run dev
   ```

This will start the Electron app with hot-reloading enabled.

## Building

To build the project:

```bash
npm run build
```

To run the built version:

```bash
npm start
```

## Code Style

- Use TypeScript for all code
- Follow the existing code style and formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and single-purpose

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them with clear, descriptive messages:
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

3. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a Pull Request on GitHub with:
   - A clear title and description
   - Reference any related issues
   - Screenshots or examples if applicable

5. Ensure all checks pass and address any review feedback

## Issue Reporting

When reporting issues, please include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, etc.)
- Screenshots if applicable

## Testing

Before submitting a PR, please:

- Test your changes thoroughly
- Ensure the app builds successfully
- Test on your operating system (we support macOS, Windows, and Linux)
- Verify that existing functionality still works

## Project Structure

- `src/main/` - Electron main process code
- `src/preload/` - Preload scripts for secure IPC
- `src/renderer/` - React UI components
- `src/common/` - Shared types and utilities

## Questions?

Feel free to open an issue for questions or discussions about contributions.

Thank you for contributing!

