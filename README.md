# AI Spectator 👁️

**AI Spectator** is a private, offline-first, locally-run study time tracker built directly into the browser. It uses your webcam to accurately measure how long you *actually* look at your screen and study, automatically pausing the timer when you look away, step away, or close your laptop.

Built as a Progressive Web App (PWA), it installs as a standalone desktop app and requires **no backend, no accounts, and no paid services**.

## ✨ Features

- **True Study Hours:** Tracks time only when your face is pointing at the screen.
- **Privacy First:** Video frames are analysed directly in your browser using WebAssembly. No video is ever recorded, saved, or sent anywhere.
- **Offline Capable:** All AI models, styles, and scripts are hosted locally. Once loaded, it works entirely without an internet connection.
- **Smart Distraction Tracking:** Differentiates between looking away (momentary distraction) and stepping away (leaving the desk).
- **Back-Dated Pauses:** When a pause is triggered, the timer rolls back to the exact second you lost focus, ensuring 100% accurate time tracking.
- **Picture-in-Picture (PiP):** Keep a mini always-on-top timer window visible while you work in other apps.
- **Dashboard & Analytics:** Saves all sessions to a local database (`IndexedDB`) to track streaks, weekly totals, and distraction metrics.
- **Background Defense:** Uses Web Workers to keep the timer accurate even when Chrome aggressively throttles background tabs.

## 🚀 How to Run

1. Open a terminal in this project directory.
2. Start a local HTTP server:
   ```bash
   python3 -m http.server 8080
   ```
3. Open your browser (Google Chrome recommended) and go to `http://localhost:8080`.
4. **To install as a Desktop App:** Click the "Install AI Spectator" prompt or look for the install icon `[+]` in the Chrome address bar.

> **Note:** The camera and face detection require a secure context. `localhost` is considered secure, but if you host this elsewhere, you must use HTTPS.

## 🧠 How It Works (Technical Overview)

This app is built with **vanilla HTML, CSS, and JavaScript**. It is designed to be easily readable for students learning web development.

Here is a map of the codebase:

- **`index.html`**: The main layout. Uses native HTML5 elements, CSS variables, and a glassmorphism design system.
- **`styles.css`**: Contains all the styling, layout, dark/light mode tokens, and animations.
- **`app.js`**: The brains of the app. It manages:
  - **State Machine:** Tracks whether you are `idle`, `studying`, `looking-away`, or `away`.
  - **Camera & Face Detection:** Uses Google's MediaPipe Face Landmarker. It runs a detection loop at ~5 frames per second (fps) to keep CPU usage low while remaining highly responsive.
  - **Head Pose Math:** Calculates your head's Yaw (left/right) and Pitch (up/down) by measuring distances between key facial landmarks (nose, cheeks, chin, forehead).
  - **IndexedDB:** Saves your session history locally.
  - **Picture-in-Picture:** Uses the modern Document PiP API to spawn an always-on-top window.
- **`worker.js`**: A Web Worker that sends a heartbeat tick every second. Browsers heavily throttle inactive tabs, which would break the timer. Running the timer engine in a background worker ensures your time is tracked perfectly even if the app is buried under other windows.
- **`sw.js`**: A Service Worker that caches all files (including the AI models) so the app works completely offline.
- **`/models`**: Contains the downloaded MediaPipe WASM runtime and the `.task` model file so we don't rely on external CDNs.

## 🔒 The Privacy Promise

1. **No Backend:** There is no server to receive data.
2. **Local Processing:** The webcam stream is attached to a hidden `<video>` element. The AI model inspects the frames in real-time, calculates numerical coordinates (landmarks), and immediately discards the image.
3. **Local Storage:** Your study statistics are saved in `IndexedDB` on your hard drive. They never leave your machine unless you explicitly export them as a CSV.

---
*Built with ❤️ for focused studying.*
