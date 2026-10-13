/**
 * Unit tests for Ayush_Tracker core logic:
 * - Time and duration formatting
 * - Head pose yaw and pitch estimations
 * - Focus detection threshold math
 * - Study goal progress calculation
 * - Back-dated timer rollback logic
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Pure Logic Implementations matching Ayush_Tracker ──

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':');
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ms / 1000)}s`;
}

function calculateYaw(noseX, leftCheekX, rightCheekX) {
  const dLeft = Math.abs(noseX - leftCheekX);
  const dRight = Math.abs(noseX - rightCheekX);
  const yawRatio = (dLeft - dRight) / (dLeft + dRight);
  return yawRatio * 90;
}

function calculatePitch(noseY, foreheadY, chinY) {
  const dTop = Math.abs(noseY - foreheadY);
  const dBottom = Math.abs(noseY - chinY);
  const pitchRatio = (dTop - dBottom) / (dTop + dBottom);
  return pitchRatio * 90;
}

function isFacingScreen(pose, neutral, threshold) {
  const yawDev = Math.abs(pose.yaw - neutral.yaw);
  const pitchDev = Math.abs(pose.pitch - neutral.pitch);
  return yawDev < threshold && pitchDev < threshold;
}

function calculateGoalProgress(studyMs, goalHours) {
  const goalMs = goalHours * 3600 * 1000;
  if (goalMs <= 0) return 0;
  return Math.min(100, Math.round((studyMs / goalMs) * 100));
}

function calculateBackdatedStudyTime(recordedStudyTime, pauseDelayMs) {
  // Rolls back the unverified delay elapsed before distraction was confirmed
  return Math.max(0, recordedStudyTime - pauseDelayMs);
}

function calculateFocusScore(pose, neutral = { yaw: 0, pitch: 0 }, threshold = 25, readingMode = false) {
  if (!pose) return 0;
  const yawDev = Math.abs(pose.yaw - neutral.yaw);
  let pitchDev = Math.abs(pose.pitch - neutral.pitch);
  if (readingMode && pose.pitch > neutral.pitch) {
    pitchDev = 0;
  }
  const deviation = Math.hypot(yawDev, pitchDev * 0.85);
  const x = Math.min(1.0, deviation / threshold);
  return Math.max(0, Math.min(100, Math.round(100 * (1 - Math.pow(x, 1.5)))));
}

// ── Test Suites ──

describe('Ayush_Tracker — Core Formatting', () => {
  test('formatTime correctly formats seconds, minutes, and hours', () => {
    assert.equal(formatTime(0), '00:00:00');
    assert.equal(formatTime(5000), '00:00:05');
    assert.equal(formatTime(65000), '00:01:05');
    assert.equal(formatTime(3665000), '01:01:05');
  });

  test('formatDuration formats human-readable strings', () => {
    assert.equal(formatDuration(45000), '45s');
    assert.equal(formatDuration(150000), '2m');
    assert.equal(formatDuration(3600000 + 120000), '1h 2m');
  });
});

describe('Ayush_Tracker — Head Pose & Geometry', () => {
  test('calculateYaw returns ~0° when nose is centered between cheeks', () => {
    // Left cheek at x=0.3, nose at x=0.5, right cheek at x=0.7
    const yaw = calculateYaw(0.5, 0.3, 0.7);
    assert.equal(Math.round(yaw), 0);
  });

  test('calculateYaw returns positive angle when turned right', () => {
    // Nose shifted closer to right cheek
    const yaw = calculateYaw(0.6, 0.3, 0.7);
    assert.ok(yaw > 0);
  });

  test('calculateYaw returns negative angle when turned left', () => {
    // Nose shifted closer to left cheek
    const yaw = calculateYaw(0.4, 0.3, 0.7);
    assert.ok(yaw < 0);
  });

  test('isFacingScreen checks deviation within sensitivity threshold', () => {
    const neutral = { yaw: 0, pitch: 0 };
    const threshold = 18; // default sensitivity threshold

    assert.equal(isFacingScreen({ yaw: 5, pitch: 8 }, neutral, threshold), true);
    assert.equal(isFacingScreen({ yaw: 25, pitch: 5 }, neutral, threshold), false);
    assert.equal(isFacingScreen({ yaw: 0, pitch: -22 }, neutral, threshold), false);
  });
});

describe('Ayush_Tracker — Focus Measurement & Sudden Stopping', () => {
  test('calculateFocusScore returns 100% when perfectly centered', () => {
    const score = calculateFocusScore({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 }, 25);
    assert.equal(score, 100);
  });

  test('calculateFocusScore stays well above 80% for normal screen movements (preventing accidental pauses)', () => {
    // Normal head shifts and screen scanning (up to 4°-5°)
    const score = calculateFocusScore({ yaw: 3.5, pitch: 2 }, { yaw: 0, pitch: 0 }, 25);
    assert.ok(score >= 80, `Expected score >= 80% to prevent accidental pause, got ${score}%`);
  });

  test('calculateFocusScore drops below 80% default cutoff when looking away (> 8°)', () => {
    const score = calculateFocusScore({ yaw: 9, pitch: 4 }, { yaw: 0, pitch: 0 }, 25);
    assert.ok(score < 80, `Expected score < 80%, got ${score}%`);
  });

  test('reading mode ignores downward pitch in focus score', () => {
    const normalScore = calculateFocusScore({ yaw: 0, pitch: 15 }, { yaw: 0, pitch: 0 }, 25, false);
    const readingScore = calculateFocusScore({ yaw: 0, pitch: 15 }, { yaw: 0, pitch: 0 }, 25, true);
    assert.ok(readingScore > normalScore);
    assert.equal(readingScore, 100);
  });

  test('timer triggers sudden pause immediately if focus < cutoff threshold (80%)', () => {
    const cutoff = 80;
    const focusScore = calculateFocusScore({ yaw: 10, pitch: 0 }, { yaw: 0, pitch: 0 }, 25);
    const shouldStopImmediately = focusScore < cutoff;
    assert.equal(shouldStopImmediately, true);
  });
});

describe('Ayush_Tracker — Timer & Goal Math', () => {
  test('calculateGoalProgress calculates percentage correctly up to 100%', () => {
    assert.equal(calculateGoalProgress(1800000, 1), 50); // 30 mins of 1h
    assert.equal(calculateGoalProgress(3600000, 1), 100);
    assert.equal(calculateGoalProgress(7200000, 1), 100); // capped at 100%
  });

  test('calculateBackdatedStudyTime rolls back unverified delay', () => {
    const totalTime = 60000; // 60s
    const distractionDelay = 3000; // 3s before pause confirmed
    const adjusted = calculateBackdatedStudyTime(totalTime, distractionDelay);
    assert.equal(adjusted, 57000);
  });
});

describe('Ayush_Tracker — Daily Learned Time & Persistence', () => {
  function getLocalDateString(timestamp = Date.now()) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function simulateResumeDaily(existingRecord, newStudyElapsed) {
    const baseStudyMs = existingRecord ? existingRecord.studyTime : 0;
    const baseSessionMs = existingRecord ? existingRecord.sessionTime : 0;
    return {
      studyTime: baseStudyMs + newStudyElapsed,
      sessionTime: baseSessionMs + newStudyElapsed,
    };
  }

  function consolidateSessionsToDaily(sessions) {
    const daysMap = new Map();
    sessions.forEach(s => {
      const dateStr = s.date || getLocalDateString(s.startTime);
      const dayId = 'day_' + dateStr;
      if (!daysMap.has(dayId)) {
        daysMap.set(dayId, {
          id: dayId,
          date: dateStr,
          studyTime: 0,
          sessionTime: 0,
          distractions: { lookAway: 0, away: 0, lidClosed: 0 }
        });
      }
      const day = daysMap.get(dayId);
      day.studyTime += (s.studyTime || 0);
      day.sessionTime += (s.sessionTime || 0);
      day.distractions.lookAway += (s.distractions?.lookAway || 0);
      day.distractions.away += (s.distractions?.away || 0);
      day.distractions.lidClosed += (s.distractions?.lidClosed || 0);
    });
    return Array.from(daysMap.values());
  }

  function simulateMidnightRollover(startTime, endTime) {
    // Splits a session crossing midnight into yesterday and today buckets
    const dEnd = new Date(endTime);
    dEnd.setHours(0, 0, 0, 0);
    const midnightBoundary = dEnd.getTime();

    const yesterdayPart = Math.max(0, midnightBoundary - startTime);
    const todayPart = Math.max(0, endTime - midnightBoundary);
    return { yesterdayPart, todayPart };
  }

  test('getLocalDateString returns YYYY-MM-DD format for local date', () => {
    const testDate = new Date(2026, 9, 13, 14, 30); // Oct 13, 2026
    assert.equal(getLocalDateString(testDate.getTime()), '2026-10-13');
  });

  test('timer resumes from where left off when restarting or refreshing on the same day', () => {
    const todayRecord = { date: '2026-10-13', studyTime: 1800000, sessionTime: 2000000 }; // 30 mins previously learned
    const continued = simulateResumeDaily(todayRecord, 600000); // 10 mins more
    assert.equal(continued.studyTime, 2400000); // 40 mins cumulative learned
    assert.equal(continued.sessionTime, 2600000);
  });

  test('multiple sessions within a day consolidate into single daily learned total', () => {
    const fragmentedSessions = [
      { date: '2026-10-13', studyTime: 600000, sessionTime: 700000, distractions: { lookAway: 1, away: 0, lidClosed: 0 } },
      { date: '2026-10-13', studyTime: 900000, sessionTime: 1000000, distractions: { lookAway: 0, away: 1, lidClosed: 0 } },
      { date: '2026-10-13', studyTime: 300000, sessionTime: 300000, distractions: { lookAway: 0, away: 0, lidClosed: 1 } },
      { date: '2026-10-12', studyTime: 3600000, sessionTime: 4000000, distractions: { lookAway: 2, away: 1, lidClosed: 0 } },
    ];
    const dailyRecords = consolidateSessionsToDaily(fragmentedSessions);
    assert.equal(dailyRecords.length, 2);

    const todayRec = dailyRecords.find(d => d.date === '2026-10-13');
    assert.ok(todayRec);
    assert.equal(todayRec.studyTime, 1800000); // 10m + 15m + 5m = 30m total
    assert.equal(todayRec.sessionTime, 2000000);
    assert.equal(todayRec.distractions.lookAway, 1);
    assert.equal(todayRec.distractions.away, 1);
    assert.equal(todayRec.distractions.lidClosed, 1);
  });

  test('midnight rollover partitions study time and resets today timer to new day', () => {
    const d1 = new Date(2026, 9, 13, 23, 45).getTime(); // 11:45 PM Oct 13
    const d2 = new Date(2026, 9, 14, 0, 15).getTime();  // 12:15 AM Oct 14
    const rollover = simulateMidnightRollover(d1, d2);

    assert.equal(rollover.yesterdayPart, 15 * 60 * 1000); // 15 mins archived to yesterday
    assert.equal(rollover.todayPart, 15 * 60 * 1000);     // 15 mins start of new day
  });

  test('timer resets to 00:00:00 only on a new calendar date, not when refreshing same day', () => {
    const savedRecord = { date: '2026-10-13', studyTime: 1234000 };
    const sameDayCheck = getLocalDateString(new Date(2026, 9, 13, 16, 0).getTime());
    const nextDayCheck = getLocalDateString(new Date(2026, 9, 14, 9, 0).getTime());

    // Same day reload: retains 1234000
    const reloadSameDayTime = (savedRecord.date === sameDayCheck) ? savedRecord.studyTime : 0;
    assert.equal(reloadSameDayTime, 1234000);

    // Next day reload: resets to 0
    const reloadNextDayTime = (savedRecord.date === nextDayCheck) ? savedRecord.studyTime : 0;
    assert.equal(reloadNextDayTime, 0);
  });
});

