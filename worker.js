/* ============================================
   Ayush_Tracker — Web Worker (Heartbeat Ticker)
   ============================================
   
   WHY A WEB WORKER?
   Chrome throttles setInterval/setTimeout to once per minute
   when a tab is hidden or minimized. But Web Workers run on
   a separate thread and are NOT throttled. This lets us keep
   accurate 1-second ticks even when the app is in the background.
   
   Uses a drift-compensated monotonic setTimeout loop so ticks
   stay aligned to 1000ms intervals without skipping seconds on
   cumulative scheduling drift.
   ============================================ */

let timeoutId = null;
let startMonotonic = 0;
let tickIndex = 0;
let lastTick = 0;
let lastMonotonic = 0;

function scheduleNextTick() {
  const nowMono = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const targetMono = startMonotonic + (tickIndex + 1) * 1000;
  let delay = targetMono - nowMono;

  // If the runtime slept or stalled far past the target, re-anchor cleanly
  if (delay < -2000) {
    startMonotonic = nowMono;
    tickIndex = 0;
    delay = 1000;
  } else {
    delay = Math.max(20, delay);
  }

  timeoutId = setTimeout(() => {
    timeoutId = null;
    tickIndex += 1;

    const now = Date.now();
    const monotonicNow = typeof performance !== 'undefined' ? performance.now() : now;
    const monotonicGap = typeof performance !== 'undefined'
      ? (monotonicNow - lastMonotonic)
      : (now - lastTick);

    self.postMessage({
      type: 'tick',
      timestamp: now,
      monotonic: monotonicNow,
      // Prefer monotonic elapsed time so wall-clock adjustments don't mimic sleep gaps.
      gap: monotonicGap,
      wallGap: now - lastTick,
    });

    lastTick = now;
    lastMonotonic = monotonicNow;
    scheduleNextTick();
  }, delay);
}

/**
 * Listen for commands from the main thread.
 * Commands: 'start', 'stop'
 */
self.onmessage = function (e) {
  const command = e.data;

  if (command === 'start') {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    lastTick = Date.now();
    startMonotonic = typeof performance !== 'undefined' ? performance.now() : lastTick;
    lastMonotonic = startMonotonic;
    tickIndex = 0;

    // Send the first tick immediately
    self.postMessage({
      type: 'tick',
      timestamp: lastTick,
      monotonic: startMonotonic,
      gap: 0,
      wallGap: 0,
    });

    scheduleNextTick();
  }

  if (command === 'stop') {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }
};
