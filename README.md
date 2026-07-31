<div align="center">
  <img src="resources/desmos-logo.svg" width="104" alt="Desmos Graphing Calculator logo">

  # Desmos Graphing Calculator

  **A focused, offline graphing workspace — native to the VS Code editor.**

  [![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.70.0-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
  [![Offline](https://img.shields.io/badge/Works-Offline-3D9852)](#privacy--offline-first)
  [![License](https://img.shields.io/badge/License-See%20LICENSE-6B7280)](LICENSE)
</div>

<br>

Desmos Graphing Calculator brings a complete local graphing canvas into VS Code. Explore functions beside your source code, save portable graph states, and export polished PNGs — all without leaving your editor or relying on a network connection.

> **Built for flow.** Open the calculator in a dedicated editor tab, work in a dark interface that belongs in VS Code, and return to your code whenever you need.

---

## Highlights

<table>
  <tr>
    <td width="50%">
      <h3>▣ Editor-native workspace</h3>
      Open Desmos as a first-class editor tab, not a browser window or a crowded sidebar.
    </td>
    <td width="50%">
      <h3>◒ Offline by design</h3>
      The calculator runtime is bundled locally, so graphing remains available without an internet connection.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>⌁ Full graphing canvas</h3>
      Work with functions, parametric equations, tables, expressions, sliders, and graph settings.
    </td>
    <td width="50%">
      <h3>⇩ Portable output</h3>
      Keep editable `.des` graph states or export the current view as a high-resolution PNG.
    </td>
  </tr>
</table>

## Quick Start

### Open the calculator

| Method | Action |
| --- | --- |
| **Command Palette** | Press `Ctrl+Shift+P`, then run **Desmos: Open Calculator**. |
| **Editor toolbar** | Click the Desmos icon in the upper-right corner of any editor. If space is limited, find it in the `...` overflow menu. |
| **Graph file** | Open any `.des` file and VS Code launches the Desmos Graph editor automatically. |

The calculator always opens in the **editor area**, alongside files and split editor groups.

### Create your first graph

1. Open **Desmos: Open Calculator**.
2. Enter an expression such as `y=sin(x)` or `y=x^2` in the expressions panel.
3. Pan, zoom, or adjust graph settings as needed.
4. Select **Save** to create a reusable `.des` graph file, or **Export** to capture a PNG.

## What You Can Do

| Capability | Details |
| --- | --- |
| **Graph expressions** | Plot functions, inequalities, parametric equations, polar relations, points, and lists. |
| **Use data tables** | Enter, inspect, and visualize tabular values directly in the graph workspace. |
| **Save graph state** | Store expressions, folders, graph settings, viewport information, and other Desmos state in a `.des` file. |
| **Open existing work** | Open local `.des` files through VS Code or from the calculator toolbar. |
| **Export visual output** | Export the active graph canvas as a PNG image. |
| **Stay offline** | No remote graphing service is required during normal calculator use. |

## File Format

`.des` files are JSON-based Desmos graph states. They preserve the editable graph — not just an image — so you can commit them with a project, exchange them with teammates, or reopen them later in this extension.

```text
my-model.des     # Editable graph state
my-model.png     # Exported graph snapshot
```

## Interface Philosophy

The extension is intentionally optimized for development workflows:

- **Editor-first** — the calculator appears where your code already lives.
- **Dark by default** — a deep visual theme reduces contrast switching in dark VS Code setups.
- **Minimal chrome** — the toolbar exposes only essential file actions: New, Open, Save, Save As, and Export.
- **No side-panel lock-in** — use VS Code split editors to keep code and graphs visible together.

## Development

### Prerequisites

- Visual Studio Code `^1.70.0`
- Node.js, for validation and extension debugging

### Run locally

```bash
# Open this repository in VS Code, then:
# Press F5 to launch an Extension Development Host.
```

In the development host, open the Command Palette and run **Desmos: Open Calculator**.

For a symbolic-link installation, update the source files and run **Developer: Reload Window** to refresh the loaded extension.

### Architecture

```text
.
├── extension.js                    Minimal VS Code extension entry point
├── resources/                      Product and command icons
├── vendor/
│   └── desmos/
│       └── calculator.js           Bundled third-party Desmos runtime
└── src/
    ├── extension/                  Extension composition root
    │   ├── activate.js             VS Code command and editor registration
    │   └── constants.js            Shared extension identifiers
    ├── editor/                     Custom editor lifecycle and document state
    │   ├── desmosDocument.js
    │   └── desmosEditorProvider.js
    ├── platform/                   VS Code platform integrations
    │   └── fileService.js          File I/O and native dialogs
    ├── bridge/                     Host ↔ Webview communication boundary
    │   └── messageRouter.js
    └── webview/                    Browser-side UI assets and behavior
        ├── app.js                  Desmos initialization and UI events
        ├── styles.css              Dark interface and toolbar presentation
        └── webviewHtml.js          CSP-safe Webview document generation
```

### Design Boundaries

| Layer | Responsibility |
| --- | --- |
| **Webview** | Renders the calculator and handles user interaction. It never directly reads or writes local files. |
| **Extension Host** | Handles native dialogs, `.des` persistence, PNG export, and VS Code editor integration. |
| **Message boundary** | Keeps UI code isolated from file-system access through structured Webview messages. |

`vendor/desmos/calculator.js` is a bundled third-party runtime. Extend or maintain this project through `src/` and `extension.js` rather than modifying the bundle.

## Privacy & Offline-First

Graphing, local file access, and PNG export happen on your machine. The extension does not require a Desmos account, browser session, or network connection for its normal calculator workflow.

## License & Attribution

This project is distributed under the terms in [`LICENSE`](LICENSE).

Desmos, the Desmos name, and the Graphing Calculator are trademarks or property of their respective owners. This project packages a local calculator runtime for VS Code integration and is not affiliated with or endorsed by Desmos Studio PBC.

---

<div align="center">
  Built for mathematical thinking without breaking your coding flow.
</div>
