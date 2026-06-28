import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

export const uid = () => 'id-' + Date.now() + Math.random().toString(36).slice(2, 6);
export const toDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

export const fDateTime = () =>
  new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });

export const fTime = () =>
  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export const parseTimeToMinutes = (ts) => {
  if (!ts) return null;
  const m = ts.trim().toUpperCase().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3];
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

// ─── Date-range helpers (YYYY-MM-DD strings — match schedDate/lastDone/created) ──
// These exist so dashboard drill-downs can use the same string-compare idiom
// as Tasks.jsx:665, Issues.jsx:215, MisReporting.jsx:259/269/277. All helpers
// return day strings (no Date objects), so lexicographic >= / <= works.

// 'YYYY-MM-DD' + n days → 'YYYY-MM-DD'. Negative n = past.
export const addDays = (dateStr, n) => {
  const base = dateStr || toDay();
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
};

// First day of the month containing dateStr (defaults to today).
export const monthStart = (dateStr) => {
  const base = dateStr || toDay();
  const [y, m] = base.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
};

// Last day of the month containing dateStr. Uses Date(y, m, 0) trick — day 0
// of month m+1 is the last day of month m.
export const monthEnd = (dateStr) => {
  const base = dateStr || toDay();
  const [y, m] = base.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

// First/last day of the current calendar month.
export const currentMonthRange = () => {
  const t = toDay();
  return { from: monthStart(t), to: monthEnd(t) };
};

// Inclusive 30-day window ending today.
export const last30DaysRange = () => ({ from: addDays(toDay(), -29), to: toDay() });

// True iff dateStr (YYYY-MM-DD) is within [from, to] inclusive. Falsy dateStr
// returns false so rows with no date are excluded from range queries.
export const inDateRange = (dateStr, from, to) =>
  !!dateStr && !!from && !!to && dateStr >= from && dateStr <= to;

// Case-insensitive assignedTo check. Admin can enter names with any case
// (the form auto-uppercases the task name, but the picker uses the raw
// employee name) and login normalizes the staff name — so we always compare
// uppercase to avoid "PREM PRAKASH" vs "Prem Prakash" mismatches.
export const isAssignedTo = (task, userName) => {
  if (!task || !userName) return false;
  const target = userName.toUpperCase();
  return Array.isArray(task.assignedTo) && task.assignedTo.some((n) => (n || '').toUpperCase() === target);
};

export const isTaskDueToday = (task) => {
  const today = new Date();
  const dd = today.getDate(), mm = today.getMonth(), yy = today.getFullYear();
  const freq = task.freq || 'daily';
  const orig = task.schedDate ? new Date(task.schedDate + 'T00:00:00') : null;
  const origDay = orig ? orig.getDate() : null;
  const origMonth = orig ? orig.getMonth() : null;
  if (freq === 'daily') return true;
  if (freq === 'delegation') return true;
  if (freq === '15-day') {
    if (!orig || today < orig) return false;
    return Math.floor((today - orig) / (1000 * 60 * 60 * 24)) % 15 === 0;
  }
  if (freq === 'monthly') {
    if (!orig || today < orig) return false;
    return dd === Math.min(origDay, new Date(yy, mm + 1, 0).getDate());
  }
  if (freq === 'quarterly') {
    if (!orig || today < orig) return false;
    const mDiff = (yy - orig.getFullYear()) * 12 + (mm - origMonth);
    if (mDiff % 3 !== 0) return false;
    return dd === Math.min(origDay, new Date(yy, mm + 1, 0).getDate());
  }
  if (freq === 'half-yearly') {
    if (!orig || today < orig) return false;
    const mDiff = (yy - orig.getFullYear()) * 12 + (mm - origMonth);
    if (mDiff % 6 !== 0) return false;
    return dd === Math.min(origDay, new Date(yy, mm + 1, 0).getDate());
  }
  if (freq === 'yearly') {
    if (!orig || today < orig) return false;
    return mm === origMonth && dd === Math.min(origDay, new Date(yy, origMonth + 1, 0).getDate());
  }
  return false;
};

export const wasCompletedLate = (task) => {
  // Date is the primary signal. `lastDone` may have been stored as a full
  // ISO timestamp (older code paths and the seeder wrote `nowIso()` there)
  // while `schedDate` is always a day string — slice both to 10 chars
  // before comparing so we compare day vs day.
  const lastDay = task.lastDone ? String(task.lastDone).slice(0, 10) : '';
  const schedDay = task.schedDate ? String(task.schedDate).slice(0, 10) : '';
  if (lastDay && schedDay) {
    if (lastDay > schedDay) return true;   // completed after the deadline date
    if (lastDay < schedDay) return false;  // completed before the deadline — early/on-time
    // Same day → fall through to the flag (which now combines date + time
    // when set by the DoneModal).
  }
  // No date info, OR same-day completion — trust the `isDelayed` flag if
  // present. If the flag is missing too, default to false (assume on-time
  // for legacy rows that predate the date-aware writer).
  return !!task.isDelayed;
};

// Single source of truth for what counts as an "escalated" issue. Used by
// the Dashboard escalated card, the Escalation Tracker page, the sidebar
// badge, and the drill-down modal — all of which previously disagreed.
// Definition: priority = high AND status = open (i.e. not yet picked up
// by anyone, not even in-progress).
export const isEscalatedIssue = (issue) => issue && issue.priority === 'high' && issue.status === 'open';

export const getNextDueMs = (task) => {
  const now = new Date();
  const scheduledMin = parseTimeToMinutes(task.time);
  if (task.freq === 'daily') {
    if (scheduledMin === null) return null;
    const todayDue = new Date();
    todayDue.setHours(Math.floor(scheduledMin / 60), scheduledMin % 60, 0, 0);
    if (todayDue.getTime() > now.getTime()) return todayDue.getTime();
    todayDue.setDate(todayDue.getDate() + 1);
    return todayDue.getTime();
  }
  const freqMap = { '15-day': 15, monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 };
  const created = task.created ? new Date(task.created) : now;
  let due = new Date(created);
  while (due.getTime() <= now.getTime()) {
    if (task.freq === '15-day') due.setDate(due.getDate() + 15);
    else if (task.freq === 'monthly') due.setMonth(due.getMonth() + 1);
    else if (task.freq === 'quarterly') due.setMonth(due.getMonth() + 3);
    else if (task.freq === 'half-yearly') due.setMonth(due.getMonth() + 6);
    else if (task.freq === 'yearly') due.setFullYear(due.getFullYear() + 1);
    else break;
  }
  if (scheduledMin !== null) due.setHours(Math.floor(scheduledMin / 60), scheduledMin % 60, 0, 0);
  return due.getTime();
};

// Returns IDs of duplicate pending children to remove (keeps most recent per parent)
export const getDuplicateCycleIds = (tasks) => {
  const parentGroups = {};
  tasks.forEach(t => {
    if (t.parentTaskId && t.status === 'pending') {
      if (!parentGroups[t.parentTaskId]) parentGroups[t.parentTaskId] = [];
      parentGroups[t.parentTaskId].push(t);
    }
  });
  const toRemove = [];
  Object.values(parentGroups).forEach(group => {
    if (group.length <= 1) return;
    group.sort((a, b) => (b.schedDate || '').localeCompare(a.schedDate || ''));
    toRemove.push(...group.slice(1).map(t => t.id));
  });
  return toRemove;
};

// Compute the next scheduled occurrence of a recurring task. The returned
// date string is the day the *next* slot should sit on, derived from the
// task's freq + schedDate (the original anchor). When `fromDate` is provided,
// we anchor the cycle from that date (so completion today → next due is
// tomorrow for daily, 15 days later for 15-day, etc.).
//
// For `freq='daily'` we want the next occurrence strictly AFTER `fromDate`
// (returning fromDate itself would land the new slot on the same day it was
// just completed, which is the bug this helper exists to fix).
export const getNextScheduledDate = (freq, schedDate, fromDate) => {
  const anchor = schedDate || fromDate || toDay();
  const from = fromDate || toDay();
  const freqKey = freq || 'daily';

  const parseDay = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (dt) => dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');

  const base = parseDay(anchor);
  const frm = parseDay(from);
  if (!base) return from;
  if (!frm) return fmt(base);

  // daily → next occurrence strictly after `fromDate`
  if (freqKey === 'daily') {
    if (frm >= base) {
      // fromDate is on or after the anchor → next daily slot is tomorrow.
      const d = new Date(frm.getTime());
      d.setDate(d.getDate() + 1);
      return fmt(d);
    }
    // fromDate is before the anchor — the anchor itself is the next due
    // (shouldn't normally happen, but be safe).
    return fmt(base);
  }

  // delegation: due-date is its `dueDate` field — the caller passes schedDate
  // as the due. We treat it like a one-off, so next is the anchor day if it's
  // after `from`, else the day after.
  if (freqKey === 'delegation') {
    return fmt(base);
  }

  // Anchor-relative cycles (15-day, monthly, quarterly, half-yearly, yearly).
  // Walk forward from `base` by the freq period until we land strictly after
  // `from`. This guarantees the slot sits on its proper periodic date, not
  // on the day it was completed.
  const stepMonths = (freqKey === '15-day') ? 0
                   : (freqKey === 'monthly')    ? 1
                   : (freqKey === 'quarterly')  ? 3
                   : (freqKey === 'half-yearly')? 6
                   : (freqKey === 'yearly')     ? 12
                   : 1;
  const is15Day = freqKey === '15-day';

  let next = new Date(base.getTime());
  // If fromDate is on or before the anchor, the first slot is the anchor.
  // If fromDate is AFTER the anchor, walk forward.
  while (fmt(next) <= fmt(frm)) {
    if (is15Day) next.setDate(next.getDate() + 15);
    else next.setMonth(next.getMonth() + stepMonths);
  }
  return fmt(next);
};

export const autoCycleTasks = (tasks) => {
  const today = toDay();
  const newTasks = [];
  tasks.forEach((t) => {
    if (t.freq === 'delegation') return;   // delegation tasks never auto-cycle
    if (t.parentTaskId) return;            // only original/template tasks spawn children
    if (t.status !== 'done') return;       // only cycle completed tasks
    if (t.lastDone === today) return;      // already cycled today
    if (!isTaskDueToday(t)) return;        // not due today/this period
    // Don't create a new instance if one is already pending (even from a past period)
    const exists = tasks.some(
      (x) => x.parentTaskId === t.id && x.status === 'pending'
    );
    if (exists) return;
    // Compute the proper next-scheduled date for the child instead of pinning
    // it to `today`. Today is the COMPLETION date — the next slot must sit on
    // its actual recurring date (tomorrow for daily, +15d for 15-day, next
    // month-day for monthly, etc.).
    const childSched = getNextScheduledDate(t.freq, t.schedDate, today);
    newTasks.push({
      id: uid(),
      name: t.name, dept: t.dept, freq: t.freq,
      assignedTo: [...(t.assignedTo || [])],
      assigneeEmails: [...(t.assigneeEmails || [])],
      time: t.time || '', schedDate: childSched, priority: t.priority,
      notes: t.notes || '', status: 'pending',
      doneBy: '', doneTime: '', doneRemark: '', delayReason: '',
      isDelayed: false, lastDone: '', completionHistory: [],
      extensions: [],
      created: today, createdBy: t.createdBy || 'SYSTEM',
      activityLog: [{ by: 'SYSTEM', action: 'AUTO CYCLE', details: 'Freq: ' + t.freq, at: fDateTime() }],
      parentTaskId: t.id,
    });
  });
  return newTasks;
};

export const exportToExcel = (data, filename = 'export') => {
  if (!data || !data.length) return;
  // Convert every cell to a string (or '' for empty) so XLSX doesn't lose
  // them as undefined / null / functions. Some xlsx writers drop those
  // values which makes the resulting sheet look empty when read back.
  const safe = data.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => {
      const v = row[k];
      if (v === undefined || v === null) out[k] = '';
      else if (typeof v === 'function' || typeof v === 'symbol') out[k] = '';
      else out[k] = v;
    });
    return out;
  });
  // Use sheet_add_json with explicit options to ensure header + rows are
  // written. Some xlsx writers skip the header if a column has the same
  // name as a SheetJS internal key, so we always pass `header: []`
  // (auto-derived from first object) and origin 'A1'.
  const ws = {};
  XLSX.utils.sheet_add_json(ws, safe, { origin: 'A1', skipHeader: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  // Use a manual Blob+anchor download instead of XLSX.writeFile — some
  // browsers silently drop the click that writeFile triggers (the anchor
  // it creates has no `display` style and gets hidden behind other DOM),
  // and there's no error to surface. Going through XLSX.write to get an
  // ArrayBuffer and then triggering the download ourselves guarantees the
  // file is delivered.
  try {
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    // Use the proper xlsx MIME type so Excel recognizes the file format.
    const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.xlsx`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    // Last-resort fallback to library's built-in
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }
};

// CSV export — simpler format that always opens cleanly in Excel and
// Google Sheets. Useful as a fallback when xlsx produces a file Excel
// won't render correctly (some xlsx writer versions emit files that
// Excel opens as a blank workbook).
export const exportToCSV = (data, filename = 'export') => {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const escape = (v) => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    // Quote if contains comma, quote, newline, or starts/ends with whitespace
    if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  data.forEach((row) => {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  });
  const csv = lines.join('\r\n');
  // BOM so Excel reads UTF-8 correctly when file has non-ASCII chars
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const ls = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── JSON Export / Import ───────────────────────────────────────────────────
// Used by Settings → Export & Import card. We treat the export as a single
// document so the user can move data between devices or restore a snapshot.

// Date field per entity — used when filtering by year. Falls back to `at` /
// `createdAt` if the primary field is missing so a row is still kept.
const EXPORT_DATE_FIELD = {
  tasks:       'schedDate',   // fall back: created
  issues:      'date',
  handovers:   'date',
  delegations: 'dueDate',     // fall back: createdAt
  notices:     'sentAt',
  actLog:      'at',
};

function rowDateStr(row, type) {
  if (!row) return '';
  const primary = EXPORT_DATE_FIELD[type];
  if (row[primary]) return row[primary];
  // fallback — created/createdAt/at
  return row.created || row.createdAt || row.at || '';
}

// Apply [from, to] (YYYY-MM-DD inclusive) to a row's primary date. If a row
// has no parsable date, include it (don't drop records the user can't date).
function inYearRange(row, from, to, type) {
  if (!from && !to) return true;
  const d = rowDateStr(row, type);
  if (!d) return true;
  // Normalise to YYYY-MM-DD prefix. Many `at`/`sentAt` values are full ISO
  // strings, so slice the leading 10 chars before the lexicographic compare.
  const day = String(d).slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// Build a year-range string. mode: 'current' → 2026-01-01..today,
// 'all' → '', 'custom' → [customFrom, customTo].
export function buildYearRange(mode, customFrom, customTo) {
  if (mode === 'all') return { from: '', to: '' };
  if (mode === 'custom') return { from: customFrom || '', to: customTo || '' };
  // 'current' (default)
  const t = toDay();
  const yy = t.slice(0, 4);
  return { from: `${yy}-01-01`, to: t };
}

// Collect every record the user is allowed to export. Admin sees everything;
// staff sees only records assigned to / created by / about them.
export function collectExportData({
  currentRole,
  currentUser,
  tasks, issues, handovers, delegations, notices, actLog,
  yearRange,
}) {
  const isMainAdmin = currentRole === 'mainadmin';
  const me = (currentUser?.name || '').toUpperCase();

  // Helper: keep a row iff the user is allowed to see it.
  const filterByUser = (row, kind) => {
    if (isMainAdmin) return true;
    if (kind === 'tasks') {
      const assigned = Array.isArray(row.assignedTo) && row.assignedTo.some((n) => (n || '').toUpperCase() === me);
      const creator = (row.createdBy || '').toUpperCase() === me;
      return assigned || creator;
    }
    if (kind === 'issues') {
      const reporter = (row.reporter || '').toUpperCase() === me;
      const assignee = (row.assigned || '').toUpperCase() === me;
      return reporter || assignee;
    }
    if (kind === 'handovers') {
      const from = (row.fromName || '').toUpperCase() === me;
      const to = (row.toName || '').toUpperCase() === me;
      return from || to;
    }
    if (kind === 'delegations') {
      const doer = (row.doerName || '').toUpperCase() === me;
      return doer;
    }
    if (kind === 'notices') {
      return (row.toName || '').toUpperCase() === me;
    }
    if (kind === 'actLog') {
      return (row.by || '').toUpperCase() === me;
    }
    return true;
  };

  const inRange = (row, kind) => inYearRange(row, yearRange?.from, yearRange?.to, kind);
  const filterBoth = (arr, kind) => (arr || []).filter((r) => filterByUser(r, kind) && inRange(r, kind));

  return {
    tasks:       filterBoth(tasks,       'tasks'),
    issues:      filterBoth(issues,      'issues'),
    handovers:   filterBoth(handovers,   'handovers'),
    delegations: filterBoth(delegations, 'delegations'),
    notices:     filterBoth(notices,     'notices'),
    actLog:      filterBoth(actLog,      'actLog'),
  };
}

// Build the final JSON object with metadata + the scoped collections.
export function buildExportPayload({ currentRole, currentUser, collections, yearRange }) {
  const generated = new Date().toISOString();
  return {
    schema: 'hospital-ops-export',
    version: 1,
    generatedAt: generated,
    generatedBy: currentUser?.name || 'UNKNOWN',
    role: currentRole || 'unknown',
    yearRange: { from: yearRange?.from || '', to: yearRange?.to || '' },
    counts: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, (v || []).length])),
    data: collections,
  };
}

// Trigger a JSON download via Blob + anchor (same pattern as exportToExcel).
export function downloadJsonFile(payload, filename = 'export') {
  const safe = (filename || 'export').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Read a File object (from <input type="file">) and parse it as JSON.
// Returns { ok: true, payload } or { ok: false, error } so the caller can
// surface a friendly message without try/catch on every page.
export function readJsonFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: false, error: 'No file selected.' });
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || ''));
        resolve({ ok: true, payload });
      } catch (e) {
        resolve({ ok: false, error: 'File is not valid JSON.' });
      }
    };
    reader.onerror = () => resolve({ ok: false, error: 'Could not read the file.' });
    reader.readAsText(file);
  });
}

// Validate a parsed payload has the shape we expect. Returns an array of
// missing/invalid keys so the UI can show a single friendly error.
export function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object') return ['Not a JSON object.'];
  if (payload.schema !== 'hospital-ops-export') return ['File is not a hospital-ops export.'];
  if (!payload.data || typeof payload.data !== 'object') return ['Missing `data` section.'];
  const valid = ['tasks', 'issues', 'handovers', 'delegations', 'notices', 'actLog'];
  const missing = valid.filter((k) => !Array.isArray(payload.data[k]));
  return missing.length ? [`Missing arrays for: ${missing.join(', ')}`] : [];
}

// Per-entity duplicate detection. A duplicate is a row whose `id` already
// exists in the destination. We DON'T compare content — IDs are the source of
// truth. The UI then lets the user pick per-type: replace / skip / import-as-new.
export function detectDuplicates(payload, current) {
  const out = {};
  const types = ['tasks', 'issues', 'handovers', 'delegations', 'notices', 'actLog'];
  types.forEach((type) => {
    const incoming = (payload?.data?.[type] || []);
    const existingIds = new Set((current[type] || []).map((r) => r.id).filter(Boolean));
    const dupes = incoming.filter((r) => r.id && existingIds.has(r.id));
    out[type] = {
      incoming,
      duplicates: dupes,
      fresh: incoming.filter((r) => !r.id || !existingIds.has(r.id)),
    };
  });
  return out;
}

// Merge helper: produce next-state arrays for each entity given the user's
// per-type choice ('replace' | 'skip' | 'keep-both').
//   replace → drop dupes, write fresh rows
//   skip    → drop dupes, write fresh rows (same as replace for now; reserved)
//   keep-both → drop dupes, write fresh rows + dupes with regenerated IDs
//
// For 'replace'/'skip' we DO NOT touch the duplicate (existing row stays).
// Only fresh rows are added. Implemented idempotently so a user can re-run.
export function mergeImport({ detected, choices }) {
  const out = {};
  const types = ['tasks', 'issues', 'handovers', 'delegations', 'notices', 'actLog'];
  types.forEach((type) => {
    const choice = choices[type] || 'skip';
    const { incoming, duplicates, fresh } = detected[type] || {};
    let mergedFresh = fresh || [];
    if (choice === 'keep-both') {
      // Regenerate ids for the duplicate set so they coexist with the existing
      // rows. uid() lives in utils — we approximate by appending -<ts>-<rand>
      // to keep this helper dependency-free. The actual uid() helper is fine
      // to import here; the suffix only needs to be unique.
      const stamped = (duplicates || []).map((row) => ({
        ...row,
        id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${row.id}`,
      }));
      mergedFresh = [...mergedFresh, ...stamped];
    }
    // For 'replace' / 'skip' we keep the existing duplicate untouched and only
    // add the fresh rows.
    out[type] = mergedFresh;
  });
  return out;
}

export const purgeOldTrash = (trashItems, ONE_YEAR_MS) => {
  const now = Date.now();
  return trashItems.filter((t) => now - new Date(t.deletedAt).getTime() < ONE_YEAR_MS);
};

// Build a notice addressed to the main admin (bell icon + activity feed).
// `type` is one of: 'admin_alert' (default), 'task_completed', 'dept_change_accepted',
//                  'extension_requested', 'handover_request', 'handover_response',
//                  'delegation_completed', 'issue_reported', 'issue_resolved', etc.
export const buildAdminAlert = ({ subject, message, type = 'admin_alert', meta = null }) => ({
  id: uid(),
  toEmpId: 'MAINADMIN',
  toName: 'MAIN ADMIN',
  fromName: 'SYSTEM',
  subject,
  message,
  type,
  isRead: false,
  sentAt: new Date().toISOString(),
  meta,
});

// Async helper: append an admin alert to existing notices and persist.
// We dedup by alert.id within the existing notices list — if a previous call
// already appended the same id (e.g. realtime echo or double-clicked handler),
// we drop the duplicate so the bell never shows the same row twice.
export async function notifyAdmins({ notices, save, subject, message, type, meta }) {
  const alert = buildAdminAlert({ subject, message, type, meta });
  try {
    const existing = notices || [];
    const seen = new Set(existing.map(n => n.id).filter(Boolean));
    const list = seen.has(alert.id) ? existing : [...existing, alert];
    await save('hops-notices', list);
  } catch (e) {
    console.error('notifyAdmins failed:', e);
  }
  return alert;
}
