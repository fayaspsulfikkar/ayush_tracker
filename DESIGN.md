# AYUSH_TRACKER — SOFT BLUE GLASSMORPHISM + NEUMORPHISM SPECIFICATION

## 1. Visual Philosophy & Distinctive Identity

**Ayush_Tracker** is an intelligent, privacy-first computer-vision productivity application designed to cultivate deep, unbroken focus.

The visual identity is built on a **refined synthesis of Soft Blue Glassmorphism + Neumorphism**:
- **Soft Blue Powder & Ice Foundation**: Organic, translucent, low-glare surfaces engineered for extended study sessions without visual strain. Light theme uses Soft Blue-Grey canvas (`#E0E7EC`) with frosted Soft Icy-Blue card surfaces (`#ECF2F6`) and Elevated Ice glass (`#F4F8FA`). Dark theme uses Rich Deep Navy-Charcoal canvas (`#101724`) with layered Navy glass surfaces (`#182337`) and Elevated Navy (`#202F49`).
- **Directional Top-Left Soft Blue Dual Shadow Physics**: Real-world lighting physics where light originates from the top-left, casting a soft highlight upward and a calculated ambient drop shadow downward, tinted with soft blue-grey tones derived directly from the background.
- **Frosted Translucent Glassmorphism**: Cards feature subtle `backdrop-filter: blur(12px)` and delicate frosted glass borders (`1px solid rgba(255, 255, 255, 0.75)` in Light; `rgba(110, 170, 230, 0.16)` in Dark) providing distinct depth and surface plasticity without harsh outlines.
- **Restrained Coral & Muted Cyan Accents**: Coral Red (`#DE5B5E` / `#E26A6D`) is reserved for primary actions ("Start Studying") and active focus highlights. In dark mode, Muted Cyan (`#38BDF8`) provides high-contrast, cool telemetry and verified focus indications.
- **Zero Generic AI Aesthetics**: Strictly avoids loud purple gradients, radioactively glowing neon blurs, and unnecessary animations.
- **Scientific Instrument Restraint**: Clean monospace data displays (`JetBrains Mono`) alongside warm humanist body typography (`Nunito` / `Inter`).

---

## 2. Color Palette & Semantic System

### 2.1 Light Theme: Soft Blue Glassmorphism + Neumorphism

| Role | Name | HEX | RGB | WCAG Contrast | Semantic Application |
|---|---|---|---|---|---|
| **Base Canvas** | Soft Blue-Grey | `#E0E7EC` | `224, 231, 236` | Base | Viewport backdrop, outer boundary |
| **Card Surface** | Soft Icy-Blue Frosted | `#ECF2F6` | `236, 242, 246` | Layered | Frosted glass cards, dashboard panels |
| **Elevated Surface** | Elevated Ice Highlight | `#F4F8FA` | `244, 248, 250` | Layered | Toolbars, active pills, modal dialogs |
| **Primary Typography** | Deep Navy Ink | `#132238` | `19, 34, 56` | **14.16:1 (AAA)** | High-contrast headers, timer display, metrics |
| **Secondary Typography** | Muted Slate Blue | `#4B6685` | `75, 102, 133` | **5.26:1 (AA)** | Secondary labels, descriptions, subheaders |
| **High-Contrast Text** | Deep Slate Blue | `#204368` | `32, 67, 104` | **8.42:1 (AAA)** | Microcopy, captions, AA minimums |
| **Primary Accent** | Restrained Coral | `#DE5B5E` | `222, 91, 94` | **4.52:1 (AA)** | Primary CTA ("Start Studying"), active indicator |
| **Verified Focus / Success**| Fresh Mint Emerald | `#258564` | `37, 133, 100` | **4.55:1 (AA)** | Positive productivity, face facing screen |
| **Warnings & Distractions** | Warm Amber | `#D97706` | `217, 119, 6` | **3.8:1** | Distraction count, look-away warning states |
| **Error / Interrupted** | Coral Brick | `#DE5B5E` | `222, 91, 94` | **4.52:1 (AA)** | Away from screen, clear all data, end session |
| **Technical Telemetry** | Cyan Slate | `#0284C7` | `2, 132, 199` | **4.55:1 (AA)** | Neutral telemetry, FPS, tags, hardware status |

### 2.2 Dark Theme: Warm Obsidian & Earthy Charcoal System

| Role | Name | HEX | RGB | WCAG Contrast | Purpose |
|---|---|---|---|---|---|
| **Base Canvas** | Warm Obsidian | `#211F1C` | `33, 31, 28` | Base | Viewport backdrop & base surface |
| **Secondary Surface** | Earthy Umber | `#292722` | `41, 39, 34` | Layered | Troughs, recessed inputs, segmented controls |
| **Card Surface** | Tactile Charcoal Card | `#322F29` | `50, 47, 41` | Layered | Primary cards, dashboard panels, telemetry container |
| **Elevated Surface** | Highlight Charcoal | `#3D3932` | `61, 57, 50` | Layered | Modals, calibration overlay, dropdowns |
| **Light Shadow** | Warm Stone Highlight | `#443F37` | `68, 63, 55` | — | Top-left neumorphic highlight |
| **Dark Shadow** | Deep Obsidian Shadow | `#141311` | `20, 19, 17` | — | Bottom-right drop shadow |
| **Primary Text** | Warm Off-White | `#F0ECE3` | `240, 236, 227` | **11.4:1 (AAA)**| High-contrast typography & timer digits |
| **Secondary Text** | Soft Muted Sand | `#AAA397` | `170, 163, 151` | **5.4:1 (AA)** | Secondary labels, descriptions, subheaders |
| **Muted Text** | Deep Muted Earth | `#827B70` | `130, 123, 112` | **3.5:1** | Inactive tabs, disabled controls |
| **Primary Accent** | Warm Terracotta | `#C78B70` | `199, 139, 112` | **4.7:1 (AA)** | Primary buttons ("Start Studying"), active indicators |
| **Secondary Accent** | Earthy Sage | `#A3AD91` | `163, 173, 145` | **5.7:1 (AA)** | Verified face present, active focus score |
| **Warnings & Cautions** | Warm Amber | `#D49B4B` | `212, 155, 75` | **5.1:1 (AA)** | Looking away warning count |
| **Error / Interrupted** | Warm Terracotta | `#C78B70` | `199, 139, 112` | **4.7:1 (AA)** | Away state / pause / warning badge |
| **Borders** | Earthy Charcoal Border | `#413C33` | `65, 60, 51` | — | Crisp tactile borders on cards and inputs |

---

## 3. Neumorphic Dual-Shadow & Glass Matrix

Light source is strictly **top-left (-6px, -6px light / +6px, +6px dark)**:

| Elevation Level | Light Mode Syntax | Dark Mode Syntax | Applied Components |
|---|---|---|---|
| **Raised Standard (`--shadow-raised`)** | `6px 6px 16px rgba(160, 185, 206, 0.48), -6px -6px 16px #FFFFFF` | `6px 6px 16px rgba(18, 16, 14, 0.75), -5px -5px 15px rgba(85, 78, 68, 0.28)` | Main cards, hero container, summary cards |
| **Raised Subtle (`--shadow-raised-sm`)** | `3px 3px 8px rgba(160, 185, 206, 0.42), -3px -3px 8px #FFFFFF` | `3px 3px 8px rgba(18, 16, 14, 0.70), -3px -3px 8px rgba(85, 78, 68, 0.22)` | Status chips, navigation buttons, header pills |
| **Raised Large (`--shadow-raised-lg`)** | `10px 10px 24px rgba(160, 185, 206, 0.52), -10px -10px 24px #FFFFFF` | `10px 10px 24px rgba(18, 16, 14, 0.85), -8px -8px 22px rgba(90, 83, 72, 0.32)` | Hover state of buttons, floating active dialogs |
| **Recessed / Inset (`--shadow-inset`)** | `inset 3px 3px 7px rgba(160, 185, 206, 0.42), inset -3px -3px 7px #FFFFFF` | `inset 3px 3px 7px rgba(18, 16, 14, 0.75), inset -3px -3px 7px rgba(85, 78, 68, 0.18)` | Input fields, select boxes, toggle tracks, chart tracks |
| **Pressed / Inset Small (`--shadow-pressed`)**| `inset 2px 2px 5px rgba(160, 185, 206, 0.48), inset -2px -2px 5px #FFFFFF` | `inset 2px 2px 5px rgba(18, 16, 14, 0.80), inset -2px -2px 5px rgba(85, 78, 68, 0.18)` | Button active states, selected tab states |
| **Card Borders (`--border`)** | `1px solid rgba(255, 255, 255, 0.75)` | `1px solid #413C33` | Physical tactile edges |

---

## 4. Typography System

### 4.1 Font Families
- **Primary Humanist Sans**: `'Nunito'`, `'Inter'`, `-apple-system`, `sans-serif`
  - Friendly, organic curves that balance the physical nature of soft UI. Loaded 100% locally from bundled woff2 assets (`fonts/Nunito-*.woff2`) with zero external Google Fonts network dependencies for total offline reliability.
- **Technical Monospace**: `'JetBrains Mono'`, `'SF Mono'`, `monospace`
  - Used for timer figures, yaw/pitch coordinates, FPS telemetry, and study durations. Loaded locally from `fonts/JetBrainsMono-Bold.woff2`.
  - Formatted with `tabular-nums` to eliminate layout shift during second-by-second updates.

### 4.2 Standardized Typography Scale
| Variable | Value | CSS Equivalent | Applied Components |
|---|---|---|---|
| `--text-display` | `clamp(3.5rem, 6.5vw, 5.5rem)` | 56px – 88px | Study timer hero readout |
| `--text-page-title` | `1.625rem` | 26px | Main page headings |
| `--text-section-title` | `1.15rem` | 18.4px | Section titles, card group headers |
| `--text-card-title` | `1.05rem` | 16.8px | Card titles, modal titles |
| `--text-metric-lg` | `2.125rem` | 34px | Today's study time, average focus %, distraction count |
| `--text-metric-md` | `1.25rem` | 20px | Diagnostic counts, stat card secondary values |
| `--text-body` | `0.9375rem` | 15px | Standard paragraphs, setting descriptions |
| `--text-body-sm` | `0.8125rem` | 13px | Card labels, nav tab labels, subheaders |
| `--text-label` | `0.75rem` | 12px | Badge chips, reticle coordinate labels, chart days |
| `--text-caption` | `0.6875rem` | 11px | Telemetry status tags, mini pill labels |
| `--text-micro` | `0.625rem` | 10px | Technical metadata, revision timestamps |

---

## 5. Global Layout System

- **Maximum Content Width**: `--container-max-width: 1360px` (centered via `margin: 0 auto`).
- **Responsive Padding**: `--page-pad-x: clamp(1rem, 2.5vw, 1.75rem)` ensuring comfortable margins from mobile (320px) to ultrawide (2560px+).
- **Proportional Tracking Grid**: Desktop `1.35fr 1fr` ratio prioritizing the primary study timer while allowing full telemetry metrics to display without compression.
- **Standardized Card Hierarchy**: Uniform 1.5rem padding (`--card-pad`) and matching minimum heights (144px) across productivity summary cards and analytics cards.
- **Diagnostic Breakdown Row Alignment**: Identical padding (`1.125rem 1.25rem`), minimum height 64px, and vertically centered icon, label, and metric counts.
- **Weekly Focus Chart Alignment**: Equal 7-column grid distribution (`repeat(7, 1fr)`), fixed 18px top hour metric height, fixed 20px day label height, perfectly horizontally aligned regardless of individual bar heights.

---

## 6. Component Engineering Specifications

### 6.1 Study Timer Hero
- **Central Digital Timer Display**: 700-weight JetBrains Mono (`var(--text-display)`).
- **Sub-Metric Chips**: Recessed horizontal capsules detailing *Active Today* vs *Paused Time*.
- **Primary CTA Button**: Raised Coral surface (`#E45F62` / `#F06A6D`) with white text and smooth transition to inset press state (`transform: scale(0.98)`).

### 6.2 Vision Telemetry HUD
- **Pipeline Checklist**: Recessed pill items indicating optical sensor, WASM model, face presence, orientation angle, and worker heartbeat.
- **Focus Arc Gauge**: Radial gauge with soft blue background track ring and dynamic Coral progress arc.
- **Directional Reticle**: Recessed square well with subtle crosshair grid and coordinate dot tracking head yaw and pitch.

### 6.3 Productivity & Analytics
- **Today's Summary Cards**: 3 raised capsules for Study Time, Average Focus %, and Total Distractions. Average Focus displays `—` in empty states when no session tracking data exists, switching to accurate calculated percentages (`X%`) once sessions are recorded.
- **7-Day Bar Chart**: Individual recessed vertical grooves for each weekday with rising coral gradient fills.
- **Days Learned Archive**: Raised session item cards featuring tabular breakdown and date stamps.

### 6.4 Preferences & Settings Panel
- **Slide-out Drawer**: Frosted navy/ice glass surface with soft left-edge shadow and `backdrop-filter: blur(16px)`.
- **Tactile Range Sliders**: Recessed horizontal grooves with raised spherical thumb.
- **Toggle Switches**: Recessed track wells with raised white pill thumbs.

---

## 7. Accessibility & Motion Standards

- **Color Contrast**: All body text maintains WCAG AA (4.5:1+) against surfaces; primary headers achieve 9.6:1+ (Light) and 13.8:1+ (Dark) contrast.
- **Keyboard Navigation**: Distinct Coral focus rings (`outline: 2px solid var(--accent-primary); outline-offset: 2px`).
- **Reduced Motion**: Full support for `prefers-reduced-motion: reduce`, instantly disabling CSS transitions and keyframe animations.
- **Touch Targets**: All interactive elements exceed 44×44px for optimal tablet and mobile usability.
