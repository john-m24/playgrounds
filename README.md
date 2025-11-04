Playground
==========

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/john-m24/playground)

An Electron + TypeScript desktop app to spin up and throw away "playgrounds" for GitHub repos and Docker images — without manually running git clone, rm -rf, docker pull, docker run, etc.

## Repository

[GitHub Repository](https://github.com/john-m24/playground)

Features
--------
- One-click GitHub playgrounds
  - Paste a GitHub URL; shallow clones into `~/.playgrounds/github/<id>`
  - Stores metadata in `~/.playgrounds/meta.json`
  - Open in editor (VS Code if available) and open a terminal
  - Run dev command with live logs; stop when done
- One-click Docker playgrounds
  - Pulls and runs an image (`docker run -d ...`) with optional port mapping
  - Shows container status (Running / Stopped) and stop/delete actions
- Easy cleanup
  - Delete a GitHub playground (removes dir + metadata)
  - Delete a Docker playground (stops/removes container + metadata)

Project Structure
-----------------
- `src/common/types.ts` — shared types
- `src/main/` — Electron main process (Node, TypeScript)
  - `index.ts` — window + IPC wiring
  - `playgrounds.ts` — Git/Docker operations, metadata, dev runner
  - `utils/shell.ts` — small wrapper for running commands
- `src/preload/` — secure IPC bridge exposed on `window.api`
- `src/renderer/` — React UI
  - `App.tsx` — create/list/manage GitHub and Docker playgrounds, log viewer
  - `index.html`, `main.tsx`, `styles.css`

Getting Started
---------------
Prerequisites: Node 18+, git, and (optional) docker must be on PATH.

1. Install dependencies

   - `npm install`

2. Run in development (Electron + Vite)

   - `npm run dev`

3. Build

   - `npm run build`

4. Start built app locally

   - `npm start`

Usage
-----
- GitHub
  - Paste a repo URL (e.g., `https://github.com/user/repo`).
  - Optional run command (e.g., `npm install && npm run dev`).
  - Open in editor / terminal.
  - Run Dev: if no command is provided, the app tries a heuristic (`npm install && npm run dev` when `package.json` is present). Logs stream live.
  - Delete removes the directory and metadata entry.
- Docker
  - Provide an image (e.g., `redis:latest`), optional port, and extra args.
  - Stop or delete (which also removes the container) from the list.

Notes
-----
- Base directory: `~/.playgrounds` (with GitHub clones under `~/.playgrounds/github/<id>`)
- Metadata: `~/.playgrounds/meta.json`
- Editor detection prefers `code` if available; macOS/Windows/Linux fallbacks are attempted.
- Terminal opening varies by OS/DE; common terminals are attempted on Linux.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

