/* ============================================
   AI Spectator — Web Worker (Heartbeat Ticker)
   ============================================
   
   WHY A WEB WORKER?
   Chrome throttles setInterval/setTimeout to once per minute
   when a tab is hidden or minimized. But Web Workers run on
   a separate thread and are NOT throttled. This lets us keep
   accurate 1-second ticks even when the app is in the background.
   
   The worker sends a 'tick' message every second with the current
   timestamp. The main thread uses these ticks to:
   - Update the timer display
   - Detect gaps (lid closed / sleep)
   - Check if face detection is still running
   ============================================ */

let intervalId = null;
let lastTick = 0;

/**
 * Listen for commands from the main thread.
 * Commands: 'start', 'stop'
 */
self.onmessage = function (e) {
  const command = e.data;

  if (command === 'start') {
    // Clear any existing interval (safety)
    if (intervalId) clearInterval(intervalId);

    lastTick = Date.now();

    // Send a tick every 1000ms
    intervalId = setInterval(() => {
      const now = Date.now();

      self.postMessage({
        type: 'tick',
        timestamp: now,
        // The gap between ticks. Normally ~1000ms.
        // If it's much larger, the laptop was probably asleep.
        gap: now - lastTick,
      });

      lastTick = now;
    }, 1000);

    // Send the first tick immediately
    self.postMessage({
      type: 'tick',
      timestamp: lastTick,
      gap: 0,
    });
  }

  if (command === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
