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
    newTasks.push({
      id: uid(),
      name: t.name, dept: t.dept, freq: t.freq,
      assignedTo: [...(t.assignedTo || [])],
      assigneeEmails: [...(t.assigneeEmails || [])],
      time: t.time || '', schedDate: today, priority: t.priority,
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
export async function notifyAdmins({ notices, save, subject, message, type, meta }) {
  const alert = buildAdminAlert({ subject, message, type, meta });
  try {
    await save('hops-notices', [...(notices || []), alert]);
  } catch (e) {
    console.error('notifyAdmins failed:', e);
  }
  return alert;
}
