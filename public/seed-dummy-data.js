/* eslint-disable */
/**
 * Hospital Ops — Dummy Data Seeder
 *
 * Run from the browser console while the app is open at http://localhost:5173/
 * with an Admin/Main Admin session (so realtime reflects changes), or any
 * session (data lands in localStorage + Supabase immediately).
 *
 * Usage in DevTools console:
 *   1. Make sure you're logged in (any role works)
 *   2. Run:
 *        await runSeed({ wipe: true })
 *      Set wipe:false to merge with existing data instead of clearing.
 *   3. Refresh the page — all forms will show the dummy data.
 *
 * Writes to BOTH localStorage (camelCase, what the app reads offline)
 * and Supabase (snake_case via REST upsert).
 */
(function () {
  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Pull Supabase URL + anon key from the bundled app
  // import.meta is module-only; use Function() to safely probe without breaking non-module parsers
  let env = {};
  try { env = (new Function('return (typeof import.meta!=="undefined"?import.meta:undefined)'))() || {}; } catch { env = {}; }
  // Fallback: read from window if app exposed them
  const SUPABASE_URL =
    (window.__SUPABASE_URL__) ||
    (env.VITE_SUPABASE_URL) ||
    'https://lbasxnqrckgasgmidgtq.supabase.co';
  const SUPABASE_KEY =
    (window.__SUPABASE_ANON_KEY__) ||
    (env.VITE_SUPABASE_ANON_KEY) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXN4bnFyY2tnYXNnbWlkZ3RxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ4MjcwMCwiZXhwIjoyMDk4MDU4NzAwfQ.jszibFmY7phLS12oZzpTRsm1hZ03OfmsUFnXFtvGUsg';

  const HEADERS = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  const uid = () => 'id-' + Date.now() + Math.random().toString(36).slice(2, 6);
  const toDay = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const nowIso = () => new Date().toISOString();
  const fDateTime = () =>
    new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    });

  // ---------- Supabase upsert (snake_case rows) ----------
  // Try upsert; if a column is missing, strip it and retry once. Tolerates schema drift.
  async function upsertRows(table, rows) {
    if (!rows || !rows.length) return;
    let attempt = 0;
    let working = rows.map((r) => ({ ...r }));
    while (attempt < 6) {
      const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(working),
      });
      if (res.ok) return;
      const txt = await res.text();
      // Try to extract column name from PG error like "Could not find the 'foo' column"
      const m = txt.match(/'([a-z_][a-z0-9_]*)'\s+column/i);
      if (m && attempt < 5) {
        const col = m[1];
        console.warn('  ⚠️  ' + table + ' missing column "' + col + '" — stripping and retrying');
        working = working.map((r) => {
          const copy = { ...r };
          delete copy[col];
          return copy;
        });
        attempt++;
        continue;
      }
      throw new Error('Supabase upsert ' + table + ' failed: ' + res.status + ' ' + txt);
    }
    throw new Error('Supabase upsert ' + table + ' failed after schema-stripping retries');
  }
  async function deleteAll(table) {
    // Use a sentinel filter so we delete every row without needing a column that matches `neq=''`
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=neq.__none__', {
      method: 'DELETE',
      headers: HEADERS,
    });
    if (!res.ok && res.status !== 404) {
      console.warn('deleteAll', table, res.status);
    }
  }

  // ---------- localStorage write (camelCase) ----------
  const LS_KEYS = {
    depts: 'hops-depts',
    employees: 'hops-employees',
    admins: 'hops-admins',
    tasks: 'hops-tasks',
    issues: 'hops-issues',
    handovers: 'hops-handovers',
    delegations: 'hops-delegations',
    actLog: 'hops-actlog',
    trash: 'hops-trash',
    notices: 'hops-notices',
  };
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error('ls', key, e); }
  }
  function lsGet(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch { return fallback; }
  }

  // ---------- FIXTURE BUILDERS ----------
  // ---------- FIXTURE BUILDERS ----------
  // Dept-name constants (uppercased to match what forms save)
  const ICU = 'ICU', EMERGENCY = 'EMERGENCY', PHARMACY = 'PHARMACY', HOUSEKEEPING = 'HOUSEKEEPING';
  const ADMINISTRATION = 'ADMINISTRATION', LAB = 'LAB', RADIOLOGY = 'RADIOLOGY', NURSING = 'NURSING';

  // Build 8 departments with HOD/phone/email/floor
  function buildDepts() {
    const floors = ['GROUND FLOOR', '1ST FLOOR', '2ND FLOOR', '3RD FLOOR', 'BASEMENT', '4TH FLOOR', '5TH FLOOR', '1ST FLOOR'];
    return [
      { id: uid(), name: 'ICU',          hod: '', phone: 'EXT-101', email: 'icu@hosp.com',          floor: floors[1] },
      { id: uid(), name: 'EMERGENCY',    hod: '', phone: 'EXT-102', email: 'emergency@hosp.com',    floor: floors[0] },
      { id: uid(), name: 'PHARMACY',     hod: '', phone: 'EXT-103', email: 'pharmacy@hosp.com',     floor: floors[0] },
      { id: uid(), name: 'HOUSEKEEPING', hod: '', phone: 'EXT-104', email: 'housekeeping@hosp.com', floor: floors[4] },
      { id: uid(), name: 'ADMINISTRATION', hod: '', phone: 'EXT-105', email: 'admin@hosp.com',        floor: floors[5] },
      { id: uid(), name: 'LAB',          hod: '', phone: 'EXT-106', email: 'lab@hosp.com',          floor: floors[2] },
      { id: uid(), name: 'RADIOLOGY',    hod: '', phone: 'EXT-107', email: 'radiology@hosp.com',    floor: floors[3] },
      { id: uid(), name: 'NURSING',      hod: '', phone: 'EXT-108', email: 'nursing@hosp.com',      floor: floors[6] },
    ];
  }

  // Build 4 employees spread across 2 departments (1 incharge + 1 staff each)
  function buildEmployees(depts) {
    // [name, deptName, role]
    const baseNames = [
      ['MOHAN KUMAR',  'ICU',          'INCHARGE'],
      ['PRIYA SINGH',  'ICU',          'STAFF'],
      ['VIKRAM MEHTA', 'EMERGENCY',    'INCHARGE'],
      ['KAVITA SHARMA','PHARMACY',     'INCHARGE'],
    ];
    const employees = [];
    baseNames.forEach((row, idx) => {
      const dept = depts.find((d) => d.name === row[1]) || depts[0];
      const isIncharge = row[2] === 'INCHARGE';
      const e = {
        id: uid(),
        name: row[0],
        username: row[0],
        dept: dept.name,
        designation: row[2],
        email: row[0].toLowerCase().replace(/[^a-z]/g, '.') + '@hosp.com',
        password: 'Pass@123',
        contact: '98' + String(10000000 + idx).slice(-8),
        perms: [], // regular staff
        isIncharge,
        pendingDept: '',
      };
      employees.push(e);
    });
    // Give one staff a few admin-level permissions so the Admin role can be tested
    const adminPermsLite = ['tasks_view', 'issues_view', 'employees_view'];
    if (employees[1]) employees[1].perms = adminPermsLite; // PRIYA SINGH — ICU staff with lite admin perms
    return employees;
  }

  // After employees are made, fill the dept HOD = the incharge name
  function linkDeptHODs(depts, employees) {
    depts.forEach((d) => {
      const incharge = employees.find((e) => e.dept === d.name && e.isIncharge);
      if (incharge) {
        d.hod = incharge.name;
        if (!d.email) d.email = incharge.email;
        if (!d.phone || d.phone === '') d.phone = incharge.contact;
      }
    });
    return depts;
  }

  // Build 2 extra admins (besides VIBHAV which lives in code)
  function buildAdmins() {
    const allPerms = [
      'tasks_view','tasks_add','tasks_edit','tasks_delete','tasks_assign',
      'issues_view','issues_add','issues_resolve',
      'employees_view','employees_edit',
      'handover_view','handover_edit',
      'departments_view','departments_edit',
      'tracking_view','checklist_view','escalation_view','mis_view','trash_view',
      'delegation_view','delegation_add','all_task_details',
    ];
    return [
      { id: uid(), name: 'SUPERADMIN', username: 'SUPERADMIN', email: 'super@hosp.com', password: 'Admin@123', role: 'superadmin', dept: '', perms: allPerms, createdBy: 'VIBHAV' },
      { id: uid(), name: 'RAJESH KUMAR', username: 'ADMIN2', email: 'admin2@hosp.com', password: 'Admin@123', role: 'admin', dept: 'ADMINISTRATION', perms: ['tasks_view','tasks_add','issues_view','employees_view'], createdBy: 'VIBHAV' },
    ];
  }

  // Build ~50 tasks across frequencies and statuses
  function buildTasks(employees, depts) {
    const tasks = [];
    const sampleDaily = [
      ['WATER THE GARDEN PLANTS', '08:00', 'low', HOUSEKEEPING],
      ['CLEAN ICU BEDS', '07:30', 'high', ICU],
      ['CHECK EMERGENCY OXYGEN CYLINDERS', '09:00', 'high', EMERGENCY],
      ['RESTOCK PHARMACY SHELVES', '10:30', 'medium', PHARMACY],
      ['VERIFY BLOOD BANK FRIDGE TEMP', '08:45', 'high', LAB],
      ['SWEEP MAIN LOBBY', '07:00', 'low', HOUSEKEEPING],
      ['DISINFECT WARD HANDLES', '11:00', 'medium', HOUSEKEEPING],
      ['LOG MEDICATION EXPIRY DATES', '14:00', 'medium', PHARMACY],
      ['UPDATE PATIENT WHITEBOARD', '10:00', 'low', NURSING],
      ['CLEAN X-RAY MACHINE PANELS', '16:00', 'medium', RADIOLOGY],
      ['EMPTY BIOHAZARD BINS', '13:00', 'high', HOUSEKEEPING],
      ['FILE LAB REPORTS IN CABINET', '17:30', 'low', LAB],
      ['RESTOCK ICU GLOVES', '09:30', 'medium', ICU],
      ['CHECK EMERGENCY STRETCHERS', '08:15', 'high', EMERGENCY],
      ['CLEAN RADIOLOGY LEAD APRONS', '15:00', 'low', RADIOLOGY],
    ];
    const sampleMonthly = [
      ['FIRE DRILL — WARD 2', '11:00', 'high', ADMINISTRATION, 'monthly'],
      ['CALIBRATE LAB CENTRIFUGE', '14:00', 'medium', LAB, 'monthly'],
      ['INVENTORY CHECK — PHARMACY', '10:00', 'medium', PHARMACY, 'monthly'],
      ['STAFF HYGIENE AUDIT', '13:00', 'medium', HOUSEKEEPING, 'monthly'],
      ['REVIEW ICU VENTILATOR LOGS', '11:30', 'high', ICU, 'monthly'],
    ];
    const sampleQuarterly = [
      ['AMC VISIT — CT SCANNER', '10:00', 'high', RADIOLOGY, 'quarterly'],
      ['FIRE EXTINGUISHER REFILL', '09:00', 'high', ADMINISTRATION, 'quarterly'],
      ['CALIBRATE BP APPARATUS', '11:00', 'medium', NURSING, 'quarterly'],
    ];
    const sampleHalfYearly = [
      ['RENEW BIO-MED WASTE CONTRACT', '15:00', 'high', ADMINISTRATION, 'half-yearly'],
      ['STAFF TB SCREENING', '09:00', 'medium', NURSING, 'half-yearly'],
    ];
    const sampleYearly = [
      ['RENEW RADIOLOGY AERB LICENSE', '10:00', 'high', RADIOLOGY, 'yearly'],
      ['HOSPITAL NABH ACCREDITATION AUDIT', '09:30', 'high', ADMINISTRATION, 'yearly'],
    ];
    const sample15Day = [
      ['PEST CONTROL — KITCHEN', '08:00', 'medium', HOUSEKEEPING, '15-day'],
      ['DEEP CLEAN MRI ROOM', '16:00', 'medium', RADIOLOGY, '15-day'],
    ];
    const sampleDelegation = [
      ['FOLLOW UP WITH VENDOR — X-RAY FILMS', '15:30', 'medium', RADIOLOGY, 'delegation'],
      ['COORDINATE LAB EQUIPMENT REPAIR', '14:00', 'high', LAB, 'delegation'],
      ['PICK UP MEDICINE CONSIGNMENT', '11:00', 'medium', PHARMACY, 'delegation'],
      ['AUDIT CONTRACT STAFF ATTENDANCE', '13:00', 'medium', ADMINISTRATION, 'delegation'],
      ['COLLECT BLOOD BANK REPORTS', '16:30', 'high', LAB, 'delegation'],
    ];

    function pushTask(name, time, priority, deptName, freq, status) {
      // If the requested dept has no employees, redistribute to the first dept that has one
      let eligible = employees.filter((e) => e.dept === deptName);
      let effectiveDept = deptName;
      if (!eligible.length) {
        const fallbackDept = employees[0].dept;
        eligible = employees.filter((e) => e.dept === fallbackDept);
        effectiveDept = fallbackDept;
      }
      const assignee = eligible[Math.floor(Math.random() * eligible.length)] || employees[0];
      const schedDate = freq === 'delegation' ? addDays(Math.floor(Math.random() * 7) + 1) :
                        status === 'done' ? addDays(-Math.floor(Math.random() * 25) - 1) :
                        (Math.random() < 0.3 ? addDays(-Math.floor(Math.random() * 5) - 1) : toDay());
      const isDone = status === 'done';
      const isDelayed = isDone && Math.random() < 0.25;
      const t = {
        id: uid(),
        name: name.toUpperCase(),
        dept: effectiveDept,
        freq: freq || 'daily',
        assignedTo: [assignee.name],
        assigneeEmails: [assignee.email],
        time,
        schedDate,
        priority,
        notes: '',
        lastDone: isDone ? nowIso() : '',
        status: isDone ? 'done' : 'pending',
        doneBy: isDone ? assignee.name : '',
        doneTime: isDone ? nowIso() : '',
        doneRemark: isDone ? 'COMPLETED AS PER STANDARD PROTOCOL' : '',
        delayReason: isDelayed ? 'STAFF UNAVAILABLE — ASSIGNED COVER' : '',
        isDelayed: !!isDelayed,
        created: addDays(-30),
        createdBy: 'VIBHAV',
        activityLog: [
          { id: uid(), action: 'CREATED', by: 'VIBHAV', at: addDays(-30) + 'T09:00:00Z', details: 'Initial task creation' },
          ...(isDone ? [{ id: uid(), action: 'COMPLETED', by: assignee.name, at: nowIso(), details: isDelayed ? 'COMPLETED LATE — DELAY REASON LOGGED' : 'COMPLETED ON TIME' }] : []),
        ],
        completionHistory: isDone ? [{ id: uid(), by: assignee.name, at: nowIso(), remark: isDelayed ? 'DONE LATE' : 'ON TIME', delayed: isDelayed }] : [],
        parentTaskId: '',
        extensions: freq === 'delegation' && Math.random() < 0.3 ? [{ id: uid(), reqBy: assignee.name, reqAt: nowIso(), newDate: addDays(7), reason: 'AWAITING VENDOR CONFIRMATION', status: 'pending', respondedBy: '', respondedAt: '' }] : [],
      };
      tasks.push(t);
    }

    // 20 daily: ~13 done, ~7 pending
    sampleDaily.forEach((row, i) => pushTask(row[0], row[1], row[2], row[3], 'daily', i < 13 ? 'done' : 'pending'));
    // duplicate a few to reach ~25 daily
    ['REFILL HAND SANITIZER DISPENSERS', 'CHECK EMERGENCY LIGHT BATTERIES', 'CLEAN STAFF ROOM FRIDGE'].forEach((n, i) =>
      pushTask(n, ['10:00','12:00','14:30'][i], 'medium', [HOUSEKEEPING,ADMINISTRATION,NURSING][i], 'daily', i % 2 === 0 ? 'done' : 'pending')
    );
    // 5 monthly
    sampleMonthly.forEach((row) => pushTask(row[0], row[1], row[2], row[3], row[4], Math.random() < 0.5 ? 'done' : 'pending'));
    // 3 quarterly
    sampleQuarterly.forEach((row) => pushTask(row[0], row[1], row[2], row[3], row[4], 'pending'));
    // 2 half-yearly
    sampleHalfYearly.forEach((row) => pushTask(row[0], row[1], row[2], row[3], row[4], 'pending'));
    // 2 yearly
    sampleYearly.forEach((row) => pushTask(row[0], row[1], row[2], row[3], row[4], 'pending'));
    // 2 15-day
    sample15Day.forEach((row) => pushTask(row[0], row[1], row[2], row[3], row[4], 'pending'));
    // 5 delegation
    sampleDelegation.forEach((row) => pushTask(row[0], row[1], row[2], row[3], row[4], 'pending'));

    return tasks;
  }

  // ~15 issues
  function buildIssues(employees, depts) {
    const issues = [];
    const fixture = [
      ['AC NOT COOLING IN ICU-2',           ICU, 'high', 'OPEN',       'PRIYA SINGH',     'COMPRESSOR SUSPECTED FAULTY, VENDOR VISIT SCHEDULED'],
      ['BROKEN WHEELCHAIR — WARD 3',        NURSING, 'medium', 'OPEN',   'LATA WADHWA',     ''],
      ['PHARMACY PRINTER OUT OF TONER',      PHARMACY, 'low', 'RESOLVED','KAVITA SHARMA',   'NEW CARTRIDGE INSTALLED'],
      ['EMERGENCY EXIT LIGHT FLICKERING',   EMERGENCY, 'high', 'OPEN',  'VIKRAM MEHTA',    ''],
      ['LAB CENTRIFUGE MAKING NOISE',       LAB, 'high', 'IN PROGRESS','DR. ANIL MISHRA','VENDOR INSPECTION DONE — AWAITING SPARES'],
      ['MRI ROOM DOOR NOT CLOSING',         RADIOLOGY, 'high', 'RESOLVED','DR. SANJAY PATEL','ALIGNMENT ADJUSTED, TESTED OK'],
      ['BIOHAZARD BIN LID BROKEN',          HOUSEKEEPING, 'medium', 'OPEN','RAMESH GUPTA',  ''],
      ['PATIENT CALL BELL NOT WORKING — BED 7', NURSING, 'medium', 'RESOLVED','LATA WADHWA','WIRE RECONNECTED'],
      ['CT SCANNER INTERMITTENT ERROR',     RADIOLOGY, 'high', 'IN PROGRESS','DR. SANJAY PATEL','SOFTWARE UPDATE PENDING'],
      ['WATER LEAKAGE IN ADMIN WASHROOM',   ADMINISTRATION, 'medium', 'RESOLVED','NEHA AGARWAL','PLUMBER FIXED THE JOINT'],
      ['PHARMACY AC MAKING NOISE',          PHARMACY, 'low', 'OPEN',     'KAVITA SHARMA',   ''],
      ['OXYGEN FLOW METER STUCK',           ICU, 'high', 'OPEN',       'PRIYA SINGH',     ''],
      ['STAFF ROOM FAN NOT WORKING',        ADMINISTRATION, 'low', 'RESOLVED','NEHA AGARWAL','NEW FAN INSTALLED'],
      ['LAB REFRIGERATOR TEMPERATURE ALARM',LAB, 'high', 'RESOLVED',   'DR. ANIL MISHRA', 'DOOR SEAL REPLACED'],
      ['EMERGENCY STRETCHER WHEEL BROKEN',  EMERGENCY, 'medium', 'OPEN', 'VIKRAM MEHTA',    ''],
    ];
    fixture.forEach(([title, dept, priority, status, reporter, remark], i) => {
      const assignee = employees.find((e) => e.dept === dept) || employees[0];
      const date = addDays(-(Math.floor(Math.random() * 20) + 1));
      issues.push({
        id: uid(),
        title: title.toUpperCase(),
        dept,
        priority,
        reporter,
        assigned: assignee.name,
        description: remark || 'Reported by ' + reporter + ' — needs attention.',
        status: status.toLowerCase().replace(/ /g, '-'),
        date,
        resolveRemark: remark ? remark.toUpperCase() : '',
        resolveBy: status === 'RESOLVED' || status === 'IN PROGRESS' ? 'VIBHAV' : '',
        resolvedAt: status === 'RESOLVED' ? nowIso() : null,
      });
    });
    return issues;
  }

  // ~6 handovers — only between the 4 existing employees
  function buildHandovers(employees, tasks) {
    const handovers = [];
    // Pick only employees that exist in the trimmed employee list
    const empNames = employees.map((e) => e.name);
    const fixtures = [
      { from: 'MOHAN KUMAR',  to: 'PRIYA SINGH',  dept: ICU,          start: -2, end: 2,  status: 'accepted', note: 'ON LEAVE — PLEASE COVER WARD ROUNDS' },
      { from: 'KAVITA SHARMA',to: 'VIKRAM MEHTA', dept: PHARMACY,     start: -5, end: -1, status: 'completed',note: 'ANNUAL LEAVE — INVENTORY DELEGATED' },
      { from: 'PRIYA SINGH',  to: 'MOHAN KUMAR',  dept: ICU,          start: 1,  end: 5,  status: 'pending',  note: 'CONFERENCE ATTENDANCE — HANDING OVER NIGHT SHIFT' },
      { from: 'VIKRAM MEHTA', to: 'KAVITA SHARMA',dept: EMERGENCY,    start: 0,  end: 3,  status: 'accepted', note: 'SICK LEAVE — COVER EMERGENCY DUTIES' },
      { from: 'MOHAN KUMAR',  to: 'VIKRAM MEHTA', dept: ICU,          start: 7,  end: 14, status: 'pending',  note: 'TRAINING PROGRAM — DELEGATE APPROVALS' },
      { from: 'KAVITA SHARMA',to: 'PRIYA SINGH',  dept: PHARMACY,     start: -1, end: 4,  status: 'rejected', note: 'PERSONAL LEAVE — TOO SHORT NOTICE' },
    ];
    fixtures.forEach((f, i) => {
      // Filter to handovers where both from and to are real employees
      const fromEmp = employees.find((e) => e.name === f.from);
      const toEmp   = employees.find((e) => e.name === f.to);
      if (!fromEmp || !toEmp) return;
      const effectiveDept = fromEmp.dept; // use the actual employee's dept
      const someTasks = tasks.filter((t) => t.dept === effectiveDept && t.status === 'pending').slice(0, 2 + (i % 2));
      handovers.push({
        id: uid(),
        fromName: f.from,
        toName: f.to,
        dept: effectiveDept,
        dateStart: addDays(f.start),
        dateEnd: addDays(f.end),
        notes: f.note,
        taskIds: someTasks.map((t) => t.id),
        status: f.status,
        createdAt: addDays(f.start - 2) + 'T10:00:00Z',
        createdBy: f.from,
      });
    });
    return handovers;
  }

  // ~5 delegations — doers must be in the trimmed 4-employee list
  function buildDelegations(employees) {
    const today = toDay();
    const empByName = Object.fromEntries(employees.map((e) => [e.name, e]));
    const fixtures = [
      { task: 'AUDIT PHARMACY STOCK',            doer: 'KAVITA SHARMA', dept: 'PHARMACY',     due: addDays(7),  status: 'pending',           ext: [] },
      { task: 'FOLLOW UP ICU EQUIPMENT VENDOR',  doer: 'MOHAN KUMAR',   dept: 'ICU',          due: addDays(3),  status: 'extension-requested',ext: [{ requestedAt: nowIso(), reason: 'VENDOR DELAYED', newDate: addDays(10), status: 'pending' }] },
      { task: 'EMERGENCY DRILL COORDINATION',    doer: 'VIKRAM MEHTA',  dept: 'EMERGENCY',    due: addDays(14), status: 'pending',           ext: [] },
      { task: 'STAFF TRAINING COORDINATION',     doer: 'PRIYA SINGH',   dept: 'ICU',          due: addDays(5),  status: 'extended',          ext: [{ requestedAt: addDays(-2), reason: 'TRAINER UNAVAILABLE', newDate: addDays(5), status: 'approved' }] },
      { task: 'PHARMACY STOCK RECONCILIATION',   doer: 'KAVITA SHARMA', dept: 'PHARMACY',     due: addDays(-2), status: 'done',              ext: [] },
    ];
    return fixtures
      .filter((f) => empByName[f.doer]) // skip delegations for unknown doers
      .map((f) => ({
        id: uid(),
        task: f.task.toUpperCase(),
        taskName: f.task.toUpperCase(),
        doerName: f.doer,
        doerId: empByName[f.doer].id,
        dept: empByName[f.doer].dept, // use the actual employee's dept
        priority: 'medium',
        dueDate: f.due,
        expTime: '17:00',
        remarks: '',
        notes: '',
        status: f.status,
        createdBy: 'VIBHAV',
        createdAt: addDays(-7),
        createdDate: addDays(-7),
        actualDate: f.status === 'done' ? toDay() : '',
        actualTime: f.status === 'done' ? '16:30' : '',
        doneRemark: f.status === 'done' ? 'COORDINATED SUCCESSFULLY' : '',
        delayReason: '',
        isDelayed: false,
        extensionRequests: f.ext,
        activityLog: [
          { at: addDays(-7), by: 'VIBHAV', action: 'DELEGATED', details: 'Initial delegation' },
        ],
      }));
  }

  // ~12 notices (mix of types)
  function buildNotices(employees) {
    const notices = [];
    // Only target the 4 employees + MAINADMIN (admin_alert)
    const sample = [
      { type: 'general',                to: 'MOHAN KUMAR',     subject: 'ICU STAFF MEETING',         message: 'ICU team meeting at 10 AM tomorrow in conference room.' },
      { type: 'general',                to: 'PRIYA SINGH',     subject: 'NEW SHIFT ROSTER',          message: 'Please check the new shift roster on the notice board.' },
      { type: 'task_reminder',          to: 'KAVITA SHARMA',   subject: 'PENDING PHARMACY TASKS',    message: 'You have 3 pending tasks — please complete by EOD.' },
      { type: 'task_reminder',          to: 'VIKRAM MEHTA',    subject: 'EMERGENCY OXYGEN CHECK',    message: 'Daily oxygen check overdue — please complete.' },
      { type: 'dept_change_approval',   to: 'PRIYA SINGH',     subject: 'DEPARTMENT TRANSFER REQUEST',message: 'You have been requested to move to EMERGENCY. Accept or remind later.', meta: { newDept: 'EMERGENCY', accepted: false } },
      { type: 'dept_change_approval',   to: 'MOHAN KUMAR',     subject: 'DEPARTMENT TRANSFER APPROVED',message: 'Welcome to your new department.', meta: { newDept: 'ICU', accepted: true } },
      { type: 'admin_alert',            to: 'MAINADMIN',       subject: 'TASK BACKLOG ALERT',        message: 'ICU has 5 pending tasks older than 3 days.' },
      { type: 'admin_alert',            to: 'MAINADMIN',       subject: 'HIGH PRIORITY ISSUE OPEN',  message: 'Oxygen flow meter stuck in ICU — needs immediate attention.' },
      { type: 'general',                to: 'MOHAN KUMAR',     subject: 'ICU EQUIPMENT CHECK',       message: 'Schedule ICU equipment inspection this week.' },
      { type: 'general',                to: 'KAVITA SHARMA',   subject: 'PHARMACY AUDIT PREP',       message: 'Prepare documentation for upcoming NABH audit.' },
      { type: 'task_reminder',          to: 'VIKRAM MEHTA',    subject: 'EMERGENCY TRIAGE REVIEW',   message: 'Review emergency triage logs from last week.' },
      { type: 'general',                to: 'PRIYA SINGH',     subject: 'WEEKLY ADMIN REVIEW',       message: 'Admin review meeting scheduled for next Monday.' },
    ];
    sample.forEach((s, i) => {
      const toEmp = s.to === 'MAINADMIN'
        ? null
        : employees.find((e) => e.name === s.to);
      notices.push({
        id: uid(),
        toEmpId: s.to === 'MAINADMIN' ? 'MAINADMIN' : (toEmp ? toEmp.id : ''),
        toName: s.to,
        fromName: 'VIBHAV',
        subject: s.subject,
        message: s.message,
        type: s.type,
        isRead: Math.random() < 0.4,
        sentAt: addDays(-(Math.floor(Math.random() * 7))) + 'T' + String(8 + (i % 10)).padStart(2, '0') + ':30:00Z',
        meta: s.meta || null,
      });
    });
    return notices;
  }

  // Activity log ~25 entries
  function buildActivityLog() {
    const actions = [
      ['TASK CREATED',   'WATER THE GARDEN PLANTS assigned to MOHAN KUMAR'],
      ['TASK COMPLETED', 'CLEAN ICU BEDS marked done by PRIYA SINGH'],
      ['TASK COMPLETED', 'CHECK EMERGENCY OXYGEN CYLINDERS marked done by VIKRAM MEHTA'],
      ['DEPT ADDED',     'ICU department created'],
      ['DEPT ADDED',     'PHARMACY department created'],
      ['EMPLOYEE ADDED', 'MOHAN KUMAR added to ICU'],
      ['EMPLOYEE ADDED', 'KAVITA SHARMA added to PHARMACY'],
      ['ISSUE REPORTED', 'AC NOT COOLING IN ICU-2'],
      ['ISSUE RESOLVED', 'PHARMACY PRINTER OUT OF TONER — resolved by VIBHAV'],
      ['HANDOVER CREATED','MOHAN KUMAR → PRIYA SINGH (ICU)'],
      ['HANDOVER ACCEPTED','Handover accepted by PRIYA SINGH'],
      ['DELEGATION CREATED','AUDIT PHARMACY STOCK delegated to KAVITA SHARMA'],
      ['EXTENSION REQUESTED','ICU EQUIPMENT VENDOR FOLLOW-UP — new date requested'],
      ['NOTICE SENT',   'ICU STAFF MEETING sent to MOHAN KUMAR'],
      ['LOGIN',         'VIBHAV logged in as mainadmin'],
      ['LINK ADDED',    'HOSPITAL PORTAL bookmark added'],
      ['PASSWORD CHANGED','Password changed for ADMIN2'],
      ['BREVO CONFIG UPDATED','SMTP settings updated by VIBHAV'],
    ];
    return actions.map((a, i) => ({
      id: uid(),
      by: 'VIBHAV',
      role: 'mainadmin',
      action: a[0],
      details: a[1],
      at: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      atStr: new Date(Date.now() - i * 3600 * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }),
    }));
  }

  // Trash — 4 entries spread across months
  function buildTrash() {
    const items = [];
    const fixtures = [
      { type: 'dept',     name: 'OLD PHARMACY BRANCH', daysAgo: 60 },
      { type: 'employee', name: 'TEMP STAFF RAHUL',    daysAgo: 120 },
      { type: 'issue',    name: 'OLD FAN COMPLAINT',   daysAgo: 30 },
      { type: 'task',     name: 'OLD WATER INSPECTION',daysAgo: 200 },
    ];
    fixtures.forEach((f) => {
      const d = new Date(Date.now() - f.daysAgo * 86400000);
      const auto = new Date(d.getTime() + 365 * 86400000);
      items.push({
        id: uid(),
        type: f.type,
        data: { id: uid(), name: f.name },
        deletedBy: 'VIBHAV',
        deletedAt: d.toISOString(),
        autoDeleteAt: auto.toISOString(),
      });
    });
    return items;
  }

  // ---------- PACK (UI → snake_case for Supabase) ----------
  // These mirror the pack() functions in src/services/db.js exactly.
  function packDept(o) {
    return { id: o.id, name: o.name || '', head: o.hod || o.head || '', contact: o.phone || o.contact || '', email: o.email || '', floor: o.floor || '' };
  }
  function packEmployee(o) {
    return {
      id: o.id, name: o.name || '', username: o.username || o.name || '', dept: o.dept || '',
      designation: o.designation || o.role || '', email: o.email || '', password: o.password || '',
      contact: o.contact || '', perms: o.perms || [], is_incharge: !!o.isIncharge, pending_dept: o.pendingDept || '',
    };
  }
  function packAdmin(o) {
    return {
      id: o.id, name: o.name || '', username: o.username || '', email: o.email || '',
      password: o.password || '', role: o.role || '', dept: o.dept || '',
      perms: o.perms || [], created_by: o.createdBy || '',
    };
  }
  function packTask(o) {
    return {
      id: o.id, name: o.name || '', dept: o.dept || '', freq: o.freq || 'daily',
      assigned_to: o.assignedTo || [], assignee_emails: o.assigneeEmails || [],
      time: o.time || '', sched_date: o.schedDate || '', priority: o.priority || 'medium',
      notes: o.notes || '', last_done: o.lastDone || '', status: o.status || 'pending',
      done_by: o.doneBy || '', done_time: o.doneTime || '', done_remark: o.doneRemark || '',
      delay_reason: o.delayReason || '', is_delayed: !!o.isDelayed,
      created: o.created || '', created_by: o.createdBy || '',
      activity_log: o.activityLog || [], completion_history: o.completionHistory || [],
      parent_task_id: o.parentTaskId || '',
      extensions: o.extensions || [],
    };
  }
  function packIssue(o) {
    return {
      id: o.id, title: o.title || '', dept: o.dept || '', priority: o.priority || 'medium',
      reporter: o.reporter || '', assigned: o.assigned || '', description: o.desc || '',
      status: o.status || 'open', date: o.date || '',
      resolve_remark: o.resolveRemark || '', resolve_by: o.resolveBy || '', resolved_at: o.resolvedAt || null,
    };
  }
  function packHandover(o) {
    return {
      id: o.id,
      name: o.fromName || '',
      handover_to: o.toName || '',
      dept: o.dept || '',
      date: o.dateStart || '',
      designation: o.dateEnd || '',
      tasks: JSON.stringify(Array.isArray(o.taskIds) ? o.taskIds : []),
      pending: o.notes || '',
      supervisor: '',
      status: o.status || 'active',
      created_by: o.createdAt || '',
    };
  }
  function packDelegation(o) {
    return {
      id: o.id, task_name: o.task || o.taskName || '', dept: o.dept || '',
      priority: o.priority || 'medium', doer_id: o.doerId || '', doer_name: o.doerName || '',
      delegated_by: o.createdBy || '', exp_date: o.dueDate || '', exp_time: o.expTime || '',
      notes: o.remarks || o.notes || '', status: o.status || 'pending',
      created_date: o.createdAt || '', actual_date: o.actualDate || '', actual_time: o.actualTime || '',
      done_remark: o.doneRemark || '', delay_reason: o.delayReason || '', is_delayed: !!o.isDelayed,
      extensions: o.extensionRequests || o.extensions || [], activity_log: o.activityLog || [],
    };
  }
  function packActLog(o) {
    return { id: o.id, by_user: o.by || '', role: o.role || '', action: o.action || '', details: o.details || '', at_str: o.atStr || '' };
  }
  function packTrash(o) {
    return {
      id: o.id, type: o.type || '', data: o.data || {},
      deleted_by: o.deletedBy || '', deleted_at: o.deletedAt || new Date().toISOString(),
      auto_delete_at: o.autoDeleteAt || '',
    };
  }
  function packNotice(o) {
    return {
      id: o.id, to_emp_id: o.toEmpId || '', to_name: o.toName || '', from_name: o.fromName || '',
      subject: o.subject || '', message: o.message || '', type: o.type || 'general',
      is_read: !!o.isRead, sent_at: o.sentAt || '',
      meta: o.meta ? JSON.stringify(o.meta) : '',
    };
  }

  // ---------- MAIN ----------
  async function runSeed(opts) {
    opts = opts || {};
    const wipe = opts.wipe !== false; // default true

    console.group('🌱 Hospital Ops — Dummy Data Seeder');

    if (wipe) {
      console.log('🧹 Wiping existing data from Supabase...');
      const tables = ['departments','employees','admins','tasks','issues','handovers','delegations','activity_log','trash','notices','user_links'];
      for (const t of tables) {
        await deleteAll(t);
      }
    }

    console.log('🏗️  Building fixtures...');
    const depts = linkDeptHODs(buildDepts(), []);
    const employees = buildEmployees(depts);
    linkDeptHODs(depts, employees);
    const admins = buildAdmins();
    const tasks = buildTasks(employees, depts);
    const issues = buildIssues(employees, depts);
    const handovers = buildHandovers(employees, tasks);
    const delegations = buildDelegations(employees);
    const notices = buildNotices(employees);
    const actLog = buildActivityLog();
    const trash = buildTrash();

    // Sample user_links — attach to VIBHAV-equivalent username 'VIBHAV' (main admin uses localStorage link box) + a couple of staff
    const userLinks = [
      { id: uid(), username: 'VIBHAV',     name: 'HOSPITAL PORTAL',     url: 'https://hospital.example.com', emoji: '🏥' },
      { id: uid(), username: 'VIBHAV',     name: 'GMAIL',               url: 'https://mail.google.com',     emoji: '✉️' },
      { id: uid(), username: 'VIBHAV',     name: 'NABH GUIDELINES',     url: 'https://nabh.co',             emoji: '📋' },
      { id: uid(), username: 'VIBHAV',     name: 'PHARMACY STOCK',      url: 'https://pharmacy.local',      emoji: '💊' },
      { id: uid(), username: 'MOHAN KUMAR',name: 'STAFF PORTAL',        url: 'https://staff.example.com',   emoji: '🏥' },
      { id: uid(), username: 'MOHAN KUMAR',name: 'GMAIL',               url: 'https://mail.google.com',     emoji: '✉️' },
    ];

    console.log('💾 Writing to localStorage (camelCase)...');
    lsSet(LS_KEYS.depts,      depts);
    lsSet(LS_KEYS.employees,  employees);
    lsSet(LS_KEYS.admins,     admins);
    lsSet(LS_KEYS.tasks,      tasks);
    lsSet(LS_KEYS.issues,     issues);
    lsSet(LS_KEYS.handovers,  handovers);
    lsSet(LS_KEYS.delegations,delegations);
    lsSet(LS_KEYS.notices,    notices);
    lsSet(LS_KEYS.actLog,     actLog);
    lsSet(LS_KEYS.trash,      trash);

    console.log('☁️  Upserting to Supabase (snake_case)...');
    await upsertRows('departments',   depts.map(packDept));
    await upsertRows('employees',     employees.map(packEmployee));
    await upsertRows('admins',        admins.map(packAdmin));
    await upsertRows('tasks',         tasks.map(packTask));
    await upsertRows('issues',        issues.map(packIssue));
    await upsertRows('handovers',     handovers.map(packHandover));
    await upsertRows('delegations',   delegations.map(packDelegation));
    await upsertRows('activity_log',  actLog.map(packActLog));
    await upsertRows('trash',         trash.map(packTrash));
    await upsertRows('notices',       notices.map(packNotice));
    await upsertRows('user_links',    userLinks);

    console.log('✅ Seed complete!');
    console.log({
      departments: depts.length,
      employees:   employees.length,
      admins:      admins.length,
      tasks:       tasks.length,
      issues:      issues.length,
      handovers:   handovers.length,
      delegations: delegations.length,
      notices:     notices.length,
      activity:    actLog.length,
      trash:       trash.length,
      user_links:  userLinks.length,
    });
    console.log('👉 Refresh the page (F5) to see the data.');
    console.log('🔑 Sample logins:');
    console.log('   • Main Admin  : VIBHAV / Vibhav@0206');
    console.log('   • Super Admin : SUPERADMIN / Admin@123');
    console.log('   • Admin       : ADMIN2 / Admin@123');
    console.log('   • Staff (ICU) : MOHAN KUMAR / Pass@123');
    console.log('   • Staff (any) : any seeded employee / Pass@123');
    console.groupEnd();

    return { depts, employees, admins, tasks, issues, handovers, delegations, notices, actLog, trash, userLinks };
  }

  // Expose globally
  window.runSeed = runSeed;
  console.log('✅ runSeed() loaded. Run:  await runSeed({ wipe: true })');
})();
