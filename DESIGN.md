# AYUSH_TRACKER — CHRONO-OPTIC DESIGN SPECIFICATION

## 1. Design Vision & Material Identity

**Ayush_Tracker** is engineered as a **tactile precision instrument** ("Chrono-Optic") inspired by Braun industrial design, Dieter Rams' minimalist product philosophy, Leica optical instrumentation, and precision aviation chronometers.

- **Manufactured, Not Illustrated**: A unified brushed-aluminum chassis (`#ECECE7` / `#E1E1DB`) housing recessed carbon-black instrument displays (`#161614`), machined metallic bezels, corner fasteners, physical toggle switches, and a rotary sensitivity dial.
- **Zero Generic SaaS Aesthetics**: Strictly avoids floating SaaS cards, glassmorphism blur, purple/blue gradients, neon glows, and decorative charts on the tracker screen.
- **Dual-Mode Hardware Finish**:
  - **Light Mode (Brushed Technical Aluminum)**: Technical Chalk (`#ECECE7`), Recessed Aluminum (`#E1E1DB`), Carbon Ink (`#161614`), Muted Slate (`#52524C`), Signal Orange (`#D94E1F`), Optical Sage (`#1E6B4B`).
  - **Dark Mode (Anodized Graphite)**: Matte Anodized Chassis (`#1D1E1C`), Machined Slate (`#252724`), Deep Carbon Display (`#0E0F0D`), Warm Bone Ink (`#F2F1EC`), Signal Orange (`#E86233`), Optical Sage (`#57B889`).

---

## 2. Color System

| Role | Light HEX | Dark HEX | Purpose |
| :--- | :--- | :--- | :--- |
| **Technical Chalk / Desk** | `#ECECE7` | `#141513` | Viewport backdrop & outer field |
| **Brushed Aluminum Chassis** | `#E1E1DB` | `#232421` | Unified instrument body & header bar |
| **Recessed Carbon Display** | `#161614` | `#0E0F0D` | Chronometer OLED, viewfinder well, progress bar |
| **Primary Ink** | `#161614` | `#F2F1EC` | Primary aluminum labels, switches, wordmark |
| **Display Digits (On Carbon)** | `#F2F1EC` | `#F2F1EC` | High-contrast chronometer numerals |
| **Slate Secondary** | `#52524C` | `#A4A49B` | Secondary labels, degree ticks, metadata |
| **Signal Orange** | `#D94E1F` | `#E86233` | Primary CTA, active nav indicator, warnings, reticle markers |
| **Optical Sage** | `#1E6B4B` (`#57B889` on dark) | `#57B889` | Verified lock status, artificial horizon, goal segments, streak |

---

## 3. Typography System

- **Interface Sans**: `'Nunito'`, `-apple-system`, `sans-serif` — medium-weight wordmark, navigation, and uppercase micro-labels with increased letter tracking (`0.12em–0.22em`).
- **Numerical Monospace**: `'JetBrains Mono'`, `'SF Mono'`, `monospace` — `tabular-nums`, lightweight/regular hero timer (`clamp(2.8rem, 5.2vw, 4.75rem)`), yaw/pitch readouts, and active/paused counters.

---

## 4. Layout & Instrument Components

1. **Global Physical Control Bar**: Left target icon + `AYUSH_TRACKER` wordmark; center physical tab switch (`Tracker` / `Analytics`); right `PiP`, theme contrast switch, and settings gear (`>= 44×44px` hit targets).
2. **Unified Two-Column Instrument Chassis**:
   - **Left — Chronometer Console**: Recessed carbon display with `STATUS` + signal bars, corner-bracketed timer, `VERIFIED FOCUS TIME`, recessed `Active` / `Paused` indicators, and rectangular `Start / End Session` + `Recalibrate` physical switches.
   - **Right — Optical Viewfinder & Hardware Column**: Machined circular metallic bezel with radial ticks, 4 screws, artificial horizon, center crosshair, dotted face silhouette (or live Face Mesh video preview), `Y` / `P` readouts, inline 5-second viewfinder calibration ring, bottom `Cam | Model | FPS` strip, and right-side `CAL` button + LED, rotary sensitivity dial, and `PREVIEW` rocker switch.
3. **Integrated Bottom Progress Console**: Full-width recessed carbon strip with 20-segment `Today` goal bar, `Streak` indicator, and `Analytics` shortcut.
4. **Focus Mode**: Active sessions dim/collapse secondary audit history so the Chronometer and Optical Viewfinder remain the sole focus.
