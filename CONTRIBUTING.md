# Contributing to Ayush_Tracker

Thank you for your interest in improving **Ayush_Tracker**! We welcome bug reports, feature requests, and code contributions.

---

## 🛠️ Development Setup

1. **Fork and Clone** the repository:
   ```bash
   git clone https://github.com/fayaspsulfikkar/ayush_tracker.git
   cd ayush_tracker
   ```

2. **Run Locally:**
   Any static HTTP server works. For example:
   ```bash
   python3 -m http.server 8080
   # or with Node.js
   npx serve .
   ```
   Open `http://localhost:8080` in Google Chrome (recommended for full Document Picture-in-Picture support).

3. **Run Tests:**
   ```bash
   node --test
   ```

---

## 📜 Pull Request Guidelines

1. **Create a branch** for your feature or bugfix:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Follow Conventional Commits:**
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation updates
   - `test:` for adding or updating tests
   - `chore:` for tooling and maintenance
3. **Privacy First:** Ensure no external analytics, tracking, or network telemetry is introduced. All processing must remain 100% client-side.
4. **Test your changes:** Verify camera detection, timer transitions, and IndexedDB session persistence before submitting.
5. **Submit your Pull Request** with a concise description of what was changed and why.

---

## 🛡️ Reporting Issues

If you find a bug or have a suggestion, please open an Issue on GitHub with:
- Steps to reproduce
- Expected vs. actual behavior
- Browser version and OS
