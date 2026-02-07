#!/usr/bin/env node
/*
  Deepwork: local-only deep work session tracker.

  Storage: SQLite at ~/clawd/deepwork/deepwork.sqlite
  Schema: sessions(id INTEGER PK, start_ts INTEGER NOT NULL, end_ts INTEGER)

  Commands:
    deepwork.js start [--target-min 60]
    deepwork.js stop
    deepwork.js status
    deepwork.js report [--mode days|heatmap] [--days 7] [--roll 7] [--show-total] [--show-active] [--no-streak] [--streak-lookback 365] [--weeks 52] [--format text|telegram]
*/

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME = os.homedir();
const ROOT = path.join(HOME, 'clawd', 'deepwork');
const DB = path.join(ROOT, 'deepwork.sqlite');

function shSql(sql) {
  // Use sqlite3 CLI for zero deps.
  return execFileSync('/usr/bin/sqlite3', [DB, sql], { encoding: 'utf8' });
}

function ensureDb() {
  fs.mkdirSync(ROOT, { recursive: true });
  shSql(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_ts INTEGER NOT NULL,
      end_ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_ts);
    CREATE INDEX IF NOT EXISTS idx_sessions_end ON sessions(end_ts);
  `);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function getActiveSession() {
  const out = shSql(`SELECT id, start_ts FROM sessions WHERE end_ts IS NULL ORDER BY start_ts DESC LIMIT 1;`).trim();
  if (!out) return null;
  const [id, startTs] = out.split('|');
  return { id: Number(id), start_ts: Number(startTs) };
}

function fmtTs(sec) {
  const d = new Date(sec * 1000);
  return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function durMin(startSec, endSec) {
  return Math.max(0, Math.round((endSec - startSec) / 60));
}

function startMacTimer(targetMinutes) {
  // Best-effort: start a timer in macOS Clock for targetMinutes.
  // This relies on UI scripting; user may need to grant Accessibility permission.
  if (process.platform !== 'darwin') return { ok: false, reason: 'not-darwin' };
  const mins = Math.max(1, Math.round(targetMinutes));
  try {
    const script = `
      set targetMinutes to ${mins}
      tell application "Clock" to activate
      delay 0.4
      tell application "System Events"
        tell process "Clock"
          set frontmost to true
          delay 0.2

          -- Try to switch to Timer tab (varies by OS version).
          try
            click (first button whose name is "Timer")
          end try
          delay 0.2

          -- If there's a "Start" button, try setting duration via common UI fields.
          -- This is intentionally defensive; failures are non-fatal.
          try
            -- Some versions expose a text field like "Duration"; others have steppers.
            -- We try a few patterns.
            if (count of text fields) > 0 then
              -- Often the first text field is duration. Set in minutes.
              set value of text field 1 to (targetMinutes as string)
            end if
          end try
          delay 0.2

          try
            click (first button whose name is "Start")
          end try
        end tell
      end tell
    `;

    execFileSync('/usr/bin/osascript', ['-e', script], { stdio: 'ignore' });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

function start({ targetMinutes = 60 } = {}) {
  ensureDb();
  const active = getActiveSession();
  if (active) {
    const mins = durMin(active.start_ts, nowSec());
    console.log(`Already in a deep work session (#${active.id}) since ${fmtTs(active.start_ts)} (~${mins}m).`);
    process.exit(0);
  }
  const ts = nowSec();
  shSql(`INSERT INTO sessions (start_ts, end_ts) VALUES (${ts}, NULL);`);
  const id = shSql('SELECT last_insert_rowid();').trim();

  const t = startMacTimer(targetMinutes);
  const timerNote = t.ok ? ` Timer started (${Math.round(targetMinutes)}m).` : '';

  console.log(`Started deep work session (#${id}) at ${fmtTs(ts)}.${timerNote}`);
}

function stop() {
  ensureDb();
  const active = getActiveSession();
  if (!active) {
    console.log('No active deep work session to stop.');
    process.exit(0);
  }
  const end = nowSec();
  shSql(`UPDATE sessions SET end_ts=${end} WHERE id=${active.id};`);
  const mins = durMin(active.start_ts, end);
  console.log(`Stopped deep work session (#${active.id}). Duration: ${mins}m.`);
}

function status() {
  ensureDb();
  const active = getActiveSession();
  if (!active) {
    console.log('No active deep work session.');
    return;
  }
  const mins = durMin(active.start_ts, nowSec());
  console.log(`Active deep work session (#${active.id}) since ${fmtTs(active.start_ts)} (~${mins}m).`);
}

function dayKeyFromSec(sec) {
  const d = new Date(sec * 1000);
  // local day key
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addToMap(map, day, minutes) {
  map.set(day, (map.get(day) || 0) + minutes);
}

function incMap(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function computeDailyMinutes({ weeks }) {
  // Pull all sessions in a window (start within window OR overlap window).
  const endSec = nowSec();
  const startSec = endSec - weeks * 7 * 24 * 3600;

  const rows = shSql(
    `SELECT start_ts, COALESCE(end_ts, ${endSec}) as end_ts FROM sessions
     WHERE (start_ts >= ${startSec} OR COALESCE(end_ts, ${endSec}) >= ${startSec});`
  ).trim();

  const perDay = new Map();
  const perDaySessions = new Map();
  if (!rows) return { perDay, perDaySessions, startSec, endSec };

  for (const line of rows.split('\n')) {
    const [sStr, eStr] = line.split('|');
    let s = Number(sStr);
    let e = Number(eStr);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;

    // Clip to window
    s = Math.max(s, startSec);
    e = Math.min(e, endSec);

    const daysTouched = new Set();

    // Split across days (local midnight boundaries)
    while (s < e) {
      const sd = new Date(s * 1000);
      const nextMidnight = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + 1).getTime() / 1000;
      const chunkEnd = Math.min(e, nextMidnight);
      const mins = (chunkEnd - s) / 60;
      const day = dayKeyFromSec(s);
      addToMap(perDay, day, mins);
      daysTouched.add(day);
      s = chunkEnd;
    }

    // Count this session once per day it touched (normally 1).
    for (const day of daysTouched) incMap(perDaySessions, day, 1);
  }

  // Round to whole minutes for display.
  for (const [k, v] of perDay.entries()) perDay.set(k, Math.round(v));
  return { perDay, perDaySessions, startSec, endSec };
}

function renderHeatmap({ perDay, weeks }) {
  // GitHub-ish grid: weeks columns, 7 rows (Mon..Sun).
  // We end at today.
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  // Find last Monday to align columns cleanly (GitHub uses weeks starting Sunday; we’ll use Monday).
  const endDow = (end.getDay() + 6) % 7; // Monday=0..Sunday=6
  const lastMonday = new Date(end);
  lastMonday.setDate(end.getDate() - endDow);

  const totalDays = weeks * 7;
  const start = new Date(lastMonday);
  start.setDate(lastMonday.getDate() - (totalDays - 7));

  const thresholds = [0, 30, 60, 120];
  const blocks = [' ', '░', '▒', '▓', '█'];

  const rows = Array.from({ length: 7 }, () => []);

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const d = new Date(start);
    d.setDate(start.getDate() + dayOffset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${dd}`;

    const minutes = perDay.get(key) || 0;
    let level = 0;
    if (minutes > thresholds[3]) level = 4;
    else if (minutes > thresholds[2]) level = 3;
    else if (minutes > thresholds[1]) level = 2;
    else if (minutes > thresholds[0]) level = 1;

    const dow = (d.getDay() + 6) % 7; // Monday=0
    rows[dow].push(blocks[level]);
  }

  // Add month labels (rough): first row only, label when month changes on Mondays.
  const monthRow = [];
  let prevMonth = null;
  for (let w = 0; w < weeks; w++) {
    const d = new Date(start);
    d.setDate(start.getDate() + w * 7);
    const mon = d.toLocaleString(undefined, { month: 'short' });
    const mnum = d.getMonth();
    if (mnum !== prevMonth) {
      monthRow.push(mon.padEnd(2, ' '));
      prevMonth = mnum;
    } else {
      monthRow.push('  ');
    }
  }

  // Convert rows (7) into strings with spaces between weeks.
  const rowStrings = rows.map(r => {
    const chunks = [];
    for (let w = 0; w < weeks; w++) chunks.push(r.slice(w * 7, w * 7 + 7).join(''));
    return chunks.join(' ');
  });

  const legend = 'Legend: 0m=space, 1-30m=░, 31-60m=▒, 61-120m=▓, 121m+=█';
  return { monthRow: monthRow.join(' '), rowStrings, legend };
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
}

function dayKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

function computeStreakDays({ perDay, lookbackDays = 365 }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKeyFromDate(d);
    const m = perDay.get(key) || 0;
    if (m > 0) streak++;
    else break;
  }
  return streak;
}

function reportDays({
  days = 7,
  rollDays = 7,
  showTotal = false,
  showActiveDays = false,
  showStreak = true,
  streakLookbackDays = 365
}) {
  // Fetch enough history to cover: display window + rolling window + streak.
  const needDays = Math.max(days, rollDays, showStreak ? streakLookbackDays : 0);
  const weeks = Math.ceil(needDays / 7) + 1;
  const { perDay, perDaySessions } = computeDailyMinutes({ weeks });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(dayKeyFromDate(d));
  }

  const mins = keys.map(k => perDay.get(k) || 0);
  const sess = keys.map(k => perDaySessions.get(k) || 0);

  const overallAvg = avg(mins);
  const overallMed = median(mins);
  const sessAvg = avg(sess);
  const sessMed = median(sess);

  const totalMin = sum(mins);
  const activeDays = mins.filter(m => m > 0).length;
  const streakDays = showStreak ? computeStreakDays({ perDay, lookbackDays: streakLookbackDays }) : 0;

  const lines = [];
  lines.push(`Deep work — last ${days} days (minutes/day)`);

  let summary =
    `Avg: ${fmtMin(Math.round(overallAvg))}  Median: ${fmtMin(Math.round(overallMed))}  ` +
    `Sessions/day: avg ${sessAvg.toFixed(1)} med ${sessMed.toFixed(1)}  ` +
    `Trailing avg: ${rollDays}d`;
  if (showStreak) summary += `  Streak: ${streakDays}d`;
  lines.push(summary);

  const extras = [];
  if (showTotal) extras.push(`Total: ${fmtMin(totalMin)}`);
  if (showActiveDays) extras.push(`Active days: ${activeDays}/${days}`);
  if (extras.length) lines.push(extras.join('  '));

  lines.push('');
  lines.push('Date       Sess  Min  Time    TrailAvg');

  for (let i = 0; i < keys.length; i++) {
    const day = keys[i];
    const m = mins[i];
    const s = sess[i];

    const start = Math.max(0, i - rollDays + 1);
    const window = mins.slice(start, i + 1);
    const r = avg(window);

    const sessStr = String(s).padStart(4, ' ');
    const minStr = String(m).padStart(4, ' ');
    const timeStr = fmtMin(m).padStart(7, ' ');
    const rollStr = fmtMin(Math.round(r)).padStart(7, ' ');
    lines.push(`${day}  ${sessStr}  ${minStr}  ${timeStr}  ${rollStr}`);
  }

  return lines.join('\n');
}

function reportHeatmap({ weeks = 52 }) {
  const { perDay } = computeDailyMinutes({ weeks });
  const { monthRow, rowStrings, legend } = renderHeatmap({ perDay, weeks });

  const lines = [];
  lines.push(`Deep work (last ${weeks} weeks) — minutes/day`);
  lines.push(monthRow);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < 7; i++) lines.push(`${dayNames[i]} ${rowStrings[i]}`);
  lines.push(legend);
  return lines.join('\n');
}

function report({
  mode = 'days',
  days = 7,
  rollDays = 7,
  weeks = 52,
  format = 'text',
  showTotal = false,
  showActiveDays = false,
  showStreak = true,
  streakLookbackDays = 365
}) {
  ensureDb();

  const out = mode === 'heatmap'
    ? reportHeatmap({ weeks })
    : reportDays({ days, rollDays, showTotal, showActiveDays, showStreak, streakLookbackDays });

  if (format === 'telegram') {
    console.log('```\n' + out + '\n```');
  } else {
    console.log(out);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    console.log('Usage: deepwork.js <start|stop|status|report>');
    process.exit(0);
  }

  if (cmd === 'start') {
    const targetIdx = argv.indexOf('--target-min');
    const targetAltIdx = argv.indexOf('--target');
    const targetMinutes = targetIdx !== -1 ? Number(argv[targetIdx + 1])
      : (targetAltIdx !== -1 ? Number(argv[targetAltIdx + 1]) : 60);
    return start({ targetMinutes: Number.isFinite(targetMinutes) ? targetMinutes : 60 });
  }
  if (cmd === 'stop') return stop();
  if (cmd === 'status') return status();
  if (cmd === 'report') {
    const modeIdx = argv.indexOf('--mode');
    const daysIdx = argv.indexOf('--days');
    const rollIdx = argv.indexOf('--roll');
    const weeksIdx = argv.indexOf('--weeks');
    const formatIdx = argv.indexOf('--format');
    const streakLookbackIdx = argv.indexOf('--streak-lookback');

    const mode = modeIdx !== -1 ? String(argv[modeIdx + 1]) : 'days';
    const days = daysIdx !== -1 ? Number(argv[daysIdx + 1]) : 7;
    const rollDays = rollIdx !== -1 ? Number(argv[rollIdx + 1]) : 7;
    const weeks = weeksIdx !== -1 ? Number(argv[weeksIdx + 1]) : 52;
    const format = formatIdx !== -1 ? String(argv[formatIdx + 1]) : 'text';

    // Dashboard extras (keep defaults lean; streak is on by default).
    const showTotal = argv.includes('--show-total');
    const showActiveDays = argv.includes('--show-active');
    const showStreak = !argv.includes('--no-streak');
    const streakLookbackDays = streakLookbackIdx !== -1 ? Number(argv[streakLookbackIdx + 1]) : 365;

    return report({
      mode: mode === 'heatmap' ? 'heatmap' : 'days',
      days: Number.isFinite(days) ? days : 7,
      rollDays: Number.isFinite(rollDays) ? rollDays : 7,
      weeks: Number.isFinite(weeks) ? weeks : 52,
      format,
      showTotal,
      showActiveDays,
      showStreak,
      streakLookbackDays: Number.isFinite(streakLookbackDays) ? streakLookbackDays : 365
    });
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main();
