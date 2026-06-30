import { supabase } from '../lib/supabase';

// ─── Pack/Unpack ─────────────────────────────────────────────────────────────
const _nowIso = () => new Date().toISOString();
// Normalise a value to an ISO 8601 timestamp string for PostgreSQL TIMESTAMPTZ
// columns. PostgreSQL rejects raw epoch milliseconds (e.g. "1782640580262")
// with "date/time field value out of range" — TIMESTAMPTZ only accepts ISO
// 8601 format like "2026-06-28T12:34:56.789Z". Accepts:
//   - number (epoch ms)     → new Date(num).toISOString()
//   - number (epoch sec)    → new Date(num*1000).toISOString()
//   - ISO string            → returned as-is
//   - empty/undefined/null  → _nowIso() (fallback to current time)
const toIso = (v) => {
  if (v == null || v === '') return _nowIso();
  if (typeof v === 'number') {
    // Heuristic: epoch-ms is 13 digits, epoch-sec is 10 digits
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : _nowIso();
  }
  if (typeof v === 'string') {
    // Already ISO or already a parseable date string — trust it
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : _nowIso();
  }
  return _nowIso();
};
const TABLES = {
  'workdesk-depts': {
    table: 'workdesk_departments',
    pack: (o) => ({ id: o.id, name: o.name || '', head: o.hod || o.head || '', contact: o.phone || o.contact || '', email: o.email || '', floor: o.floor || '', updated_at: toIso(o.updatedAt) }),
    unpack: (r) => ({ id: r.id, name: r.name || '', hod: r.head || '', head: r.head || '', phone: r.contact || '', contact: r.contact || '', email: r.email || '', floor: r.floor || '', updatedAt: r.updated_at || '' }),
  },
  'workdesk-employees': {
    table: 'workdesk_employees',
    pack: (o) => ({ id: o.id, name: o.name || '', username: o.username || o.name || '', dept: o.dept || '', designation: o.role || o.designation || '', email: o.email || '', password: o.password || '', contact: o.contact || '', perms: o.perms || [], is_incharge: o.isIncharge || false, pending_dept: o.pendingDept || '', updated_at: toIso(o.updatedAt) }),
    unpack: (r) => ({ id: r.id, name: r.name || '', username: r.username || r.name || '', dept: r.dept || '', role: r.designation || '', designation: r.designation || '', email: r.email || '', password: r.password || '', contact: r.contact || '', perms: Array.isArray(r.perms) ? r.perms : [], isIncharge: r.is_incharge || false, pendingDept: r.pending_dept || '', updatedAt: r.updated_at || '' }),
  },
  'workdesk-admins': {
    table: 'workdesk_admins',
    pack: (o) => ({ id: o.id, name: o.name || '', username: o.username || '', email: o.email || '', password: o.password || '', role: o.role || '', dept: o.dept || '', perms: o.perms || [], created_by: o.createdBy || '', updated_at: toIso(o.updatedAt) }),
    unpack: (r) => ({ id: r.id, name: r.name || '', username: r.username || '', email: r.email || '', password: r.password || '', role: r.role || '', dept: r.dept || '', perms: Array.isArray(r.perms) ? r.perms : Object.keys(r.perms || {}), createdBy: r.created_by || '', updatedAt: r.updated_at || '' }),
  },
  'workdesk-tasks': {
    table: 'workdesk_tasks',
    pack: (o) => ({
      id: o.id, name: o.name || '', dept: o.dept || '', freq: o.freq || 'daily',
      assigned_to: o.assignedTo || [], assignee_emails: o.assigneeEmails || [],
      time: o.time || '', sched_date: o.schedDate || '', priority: o.priority || 'medium',
      notes: o.notes || '', last_done: o.lastDone || '', status: o.status || 'pending',
      done_by: o.doneBy || '', done_time: o.doneTime || '', done_remark: o.doneRemark || '',
      delay_reason: o.delayReason || '', is_delayed: o.isDelayed || false,
      created: o.created || '', created_by: o.createdBy || '',
      activity_log: o.activityLog || [], completion_history: o.completionHistory || [],
      parent_task_id: o.parentTaskId || '',
      extensions: o.extensions || [],
      updated_at: toIso(o.updatedAt),
    }),
    unpack: (r) => ({
      id: r.id, name: r.name || '', dept: r.dept || '', freq: r.freq || 'daily',
      assignedTo: r.assigned_to || [], assigneeEmails: r.assignee_emails || [],
      time: r.time || '', schedDate: r.sched_date || '', priority: r.priority || 'medium',
      notes: r.notes || '', lastDone: r.last_done || '', status: r.status || 'pending',
      doneBy: r.done_by || '', doneTime: r.done_time || '', doneRemark: r.done_remark || '',
      delayReason: r.delay_reason || '', isDelayed: r.is_delayed || false,
      created: r.created || '', createdBy: r.created_by || '',
      activityLog: r.activity_log || [], completionHistory: r.completion_history || [],
      parentTaskId: r.parent_task_id || '',
      extensions: Array.isArray(r.extensions) ? r.extensions : [],
      updatedAt: r.updated_at || '',
    }),
  },
  'workdesk-issues': {
    table: 'workdesk_issues',
    pack: (o) => ({ id: o.id, title: o.title || '', dept: o.dept || '', priority: o.priority || 'medium', reporter: o.reporter || '', assigned: o.assigned || '', description: o.desc || '', status: o.status || 'open', date: o.date || '', resolve_remark: o.resolveRemark || '', resolve_by: o.resolveBy || '', resolved_at: o.resolvedAt ? toIso(o.resolvedAt) : null, updated_at: toIso(o.updatedAt) }),
    unpack: (r) => ({ id: r.id, title: r.title || '', dept: r.dept || '', priority: r.priority || 'medium', reporter: r.reporter || '', assigned: r.assigned || '', desc: r.description || '', status: r.status || 'open', date: r.date || '', resolveRemark: r.resolve_remark || '', resolveBy: r.resolve_by || '', resolvedAt: r.resolved_at || '', updatedAt: r.updated_at || '' }),
  },
  'workdesk-handovers': {
    table: 'workdesk_handovers',
    pack: (o) => ({
      id: o.id,
      name: o.fromName || '',
      handover_to: o.toName || '',
      dept: o.dept || '',
      date: o.dateStart || o.date || '',         // repurposed: dateStart
      designation: o.dateEnd || '',              // repurposed: dateEnd (was shift)
      tasks: JSON.stringify(Array.isArray(o.taskIds) ? o.taskIds : []),  // taskIds as JSON string
      pending: o.notes || '',                    // reason / notes
      supervisor: '',
      status: o.status || 'active',
      created_by: o.createdAt || '',
      decision_remark: o.decisionRemark || '',
      decision_by: o.decisionBy || '',
      decision_at: o.decisionAt ? toIso(o.decisionAt) : null,
      updated_at: toIso(o.updatedAt),
    }),
    unpack: (r) => {
      let taskIds = [];
      try { const p = JSON.parse(r.tasks || '[]'); if (Array.isArray(p)) taskIds = p; } catch {}
      return {
        id: r.id,
        fromName: r.name || '',
        toName: r.handover_to || '',
        dept: r.dept || '',
        dateStart: r.date || '',
        dateEnd: r.designation || '',
        taskIds,
        notes: r.pending || '',
        status: r.status || 'active',
        createdAt: r.created_by || '',
        decisionRemark: r.decision_remark || '',
        decisionBy: r.decision_by || '',
        decisionAt: r.decision_at || '',
        updatedAt: r.updated_at || '',
        // backward compat for old records
        date: r.date || '',
        shift: '',
        pendingTasks: r.pending || '',
        equipmentStatus: '',
      };
    },
  },
  'workdesk-delegations': {
    table: 'workdesk_delegations',
    pack: (o) => ({ id: o.id, task_name: o.task || o.taskName || '', dept: o.dept || '', priority: o.priority || 'medium', doer_id: o.doerId || '', doer_name: o.doerName || '', delegated_by: o.createdBy || o.delegatedBy || '', exp_date: o.dueDate || o.expDate || '', exp_time: o.expTime || '', notes: o.remarks || o.notes || '', status: o.status || 'pending', created_date: o.createdAt || o.createdDate || '', actual_date: o.actualDate || '', actual_time: o.actualTime || '', done_remark: o.doneRemark || '', delay_reason: o.delayReason || '', is_delayed: o.isDelayed || false, extensions: o.extensionRequests || o.extensions || [], activity_log: o.activityLog || [], updated_at: toIso(o.updatedAt) }),
    unpack: (r) => ({ id: r.id, task: r.task_name || '', taskName: r.task_name || '', dept: r.dept || '', priority: r.priority || 'medium', doerId: r.doer_id || '', doerName: r.doer_name || '', createdBy: r.delegated_by || '', dueDate: r.exp_date || '', expTime: r.exp_time || '', remarks: r.notes || '', notes: r.notes || '', status: r.status || 'pending', createdAt: r.created_date || '', actualDate: r.actual_date || '', actualTime: r.actual_time || '', doneRemark: r.done_remark || '', delayReason: r.delay_reason || '', isDelayed: r.is_delayed || false, extensionRequests: r.extensions || [], activityLog: r.activity_log || [], updatedAt: r.updated_at || '' }),
  },
  'workdesk-actlog': {
    table: 'workdesk_activity_log',
    pack: (o) => ({ id: o.id, by_user: o.by || '', role: o.role || '', action: o.action || '', details: o.details || '', at_str: o.atStr || '' }),
    unpack: (r) => ({ id: r.id, by: r.by_user || '', role: r.role || '', action: r.action || '', details: r.details || '', at: r.created_at || '', atStr: r.at_str || '' }),
  },
  'workdesk-trash': {
    table: 'workdesk_trash',
    pack: (o) => ({ id: o.id, type: o.type || '', data: o.data || {}, deleted_by: o.deletedBy || '', deleted_at: o.deletedAt || new Date().toISOString(), auto_delete_at: o.autoDeleteAt || '' }),
    unpack: (r) => ({ id: r.id, type: r.type || '', data: r.data || {}, deletedBy: r.deleted_by || '', deletedAt: r.deleted_at || '', autoDeleteAt: r.auto_delete_at || '' }),
  },
  'workdesk-notices': {
    table: 'workdesk_notices',
    pack: (o) => ({ id: o.id, to_emp_id: o.toEmpId || '', to_name: o.toName || '', from_name: o.fromName || '', subject: o.subject || '', message: o.message || '', type: o.type || 'general', is_read: o.isRead || false, sent_at: o.sentAt || '', meta: o.meta ? JSON.stringify(o.meta) : '' }),
    unpack: (r) => ({ id: r.id, toEmpId: r.to_emp_id || '', toName: r.to_name || '', fromName: r.from_name || '', subject: r.subject || '', message: r.message || '', type: r.type || 'general', isRead: r.is_read || false, sentAt: r.sent_at || '', meta: r.meta ? (() => { try { return JSON.parse(r.meta); } catch { return null; } })() : null }),
  },
};

const LINKS_TABLE = 'workdesk_user_links';

export async function upsertRecord(key, val) {
  if (!TABLES[key] || !Array.isArray(val) || val.length === 0) return;
  const cfg = TABLES[key];
  const rows = val.map(cfg.pack);
  // DEBUG: trace upserts to catch silent failures
  const statusBreakdown = rows.reduce((acc, r) => { acc[r.status || 'pending'] = (acc[r.status || 'pending'] || 0) + 1; return acc; }, {});
  console.log(`[upsertRecord] ${key} → ${rows.length} rows (status: ${JSON.stringify(statusBreakdown)})`);
  const { error } = await supabase.from(cfg.table).upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error('❌ Upsert [' + key + ']:', error.message);
    if (/row-level security|permission denied|unauthorized/i.test(error.message || '')) {
      console.error('   → RLS policy missing for anon role. Run SQL_SCHEMA.sql in Supabase SQL editor.');
    }
    return { ok: false, error: error.message };
  }
  console.log(`[upsertRecord] ✅ ${key} upsert completed without error`);
  return { ok: true };
}

export async function upsertSingle(key, obj) {
  if (!TABLES[key]) return;
  const cfg = TABLES[key];
  const row = cfg.pack(obj);
  const { error } = await supabase.from(cfg.table).upsert(row, { onConflict: 'id' });
  if (error) {
    console.error('❌ Upsert single [' + key + ']:', error.message);
    if (/row-level security|permission denied|unauthorized/i.test(error.message || '')) {
      console.error('   → RLS policy missing for anon role. Run SQL_SCHEMA.sql in Supabase SQL editor.');
    }
  }
}

export async function loadAll(key) {
  const cfg = TABLES[key];
  if (!cfg) return [];
  let query = supabase.from(cfg.table).select('*');
  if (cfg.table === 'workdesk_activity_log') query = query.order('created_at', { ascending: false }).limit(500);
  const { data, error } = await query;
  if (error) { console.warn('⚠️ Load [' + key + ']:', error.message); return []; }
  return (data || []).map(cfg.unpack);
}

export async function deleteRecord(type, id) {
  const tmap = { task: 'workdesk_tasks', issue: 'workdesk_issues', employee: 'workdesk_employees', dept: 'workdesk_departments', admin: 'workdesk_admins', handover: 'workdesk_handovers', delegation: 'workdesk_delegations', trash: 'workdesk_trash', link: 'workdesk_user_links' };
  const tbl = tmap[type];
  if (!tbl) return { ok: false, reason: 'unknown_type' };
  console.log(`[deleteRecord] ${type} ${id}: starting delete from ${tbl}`);
  // Issue the delete WITHOUT .select() — chaining .delete().select() in
  // PostgREST relies on the RETURNING clause, and we've seen cases where
  // the client returns empty `data` even when the row was actually deleted
  // (network timing, replication lag, or RLS silently dropping the RETURNING
  // payload). Without `.select()` the call is fire-and-forget — the error
  // path is the only signal.
  const { error } = await supabase.from(tbl).delete().eq('id', id);
  if (error) {
    console.error(`[deleteRecord] ❌ ${type} ${id}: delete returned error:`, error.message);
    return { ok: false, reason: 'error', message: error.message };
  }
  console.log(`[deleteRecord] ${type} ${id}: delete call returned no error`);

  // Verify with a follow-up SELECT (1 row, id column only — cheap). PostgREST
  // on Supabase uses a primary + read-replica topology; a DELETE writes to
  // primary but a follow-up SELECT can still be served from a replica that
  // hasn't replicated yet. One retry after a short delay handles the common
  // case without blocking the UI noticeably.
  async function verify() {
    return supabase.from(tbl).select('id').eq('id', id).limit(1);
  }
  let { data: check, error: checkErr } = await verify();
  console.log(`[deleteRecord] ${type} ${id}: verify #1 → ${check?.length || 0} rows, checkErr=${checkErr?.message || 'none'}`);
  if (checkErr) {
    // Verification itself errored (likely network blip). We don't know
    // whether the delete actually persisted. Retry once more; if the
    // SELECT still fails, treat as a soft no_rows so the caller rolls
    // back rather than letting the user see a row that comes back.
    console.warn(`[deleteRecord] ${type} ${id}: verify #1 errored — retrying once more`);
    await new Promise((r) => setTimeout(r, 400));
    ({ data: check, error: checkErr } = await verify());
    if (checkErr) {
      console.error(`[deleteRecord] ${type} ${id}: verify #2 also errored — cannot confirm delete`);
      return { ok: false, reason: 'no_rows', table: tbl };
    }
  }
  if (check && check.length > 0) {
    // Row still present — possible replication lag. Wait briefly and retry
    // once. If it's still present after the retry, the delete genuinely
    // didn't persist (RLS drop, network blip, etc.) and we surface failure
    // so the caller can roll back rather than silently resurrecting the row.
    console.warn(`[deleteRecord] ${type} ${id}: row still present after first verify — retrying after 400ms`);
    await new Promise((r) => setTimeout(r, 400));
    ({ data: check, error: checkErr } = await verify());
    console.log(`[deleteRecord] ${type} ${id}: verify #2 → ${check?.length || 0} rows, checkErr=${checkErr?.message || 'none'}`);
    if (checkErr) {
      console.error(`[deleteRecord] ${type} ${id}: verify #2 errored — cannot confirm delete`);
      return { ok: false, reason: 'no_rows', table: tbl };
    }
    if (check && check.length > 0) {
      console.error(`[deleteRecord] ${type} ${id}: row still present after retry — delete FAILED (no_rows)`);
      return { ok: false, reason: 'no_rows', table: tbl };
    }
  }
  console.log(`[deleteRecord] ✅ ${type} ${id}: deleted and verified gone`);
  return { ok: true, verified: true };
}

export async function deleteAllFromTable(key) {
  const cfg = TABLES[key];
  if (!cfg) return;
  // Supabase requires a filter for delete; neq('id','') deletes all rows
  const { error } = await supabase.from(cfg.table).delete().neq('id', '');
  if (error) console.error('❌ DeleteAll [' + key + ']:', error.message);
}

export async function loadUserLinks(username) {
  const { data, error } = await supabase.from(LINKS_TABLE).select('*').eq('username', username);
  if (error) return [];
  return (data || []).map((r) => ({ id: r.id, name: r.name || '', url: r.url || '', emoji: r.emoji || '🔗', addedAt: r.added_at || '' }));
}

export async function upsertLinks(username, links) {
  if (!links.length) return;
  const rows = links.map((o) => ({ id: o.id, username, name: o.name || '', url: o.url || '', emoji: o.emoji || '🔗', added_at: o.addedAt || new Date().toISOString() }));
  await supabase.from(LINKS_TABLE).upsert(rows, { onConflict: 'id' });
}

export async function deleteLinkRecord(id) {
  await supabase.from(LINKS_TABLE).delete().eq('id', id);
}

export function setupRealtime(onUpdate) {
  // Map of PG table name → local state key. Includes `activity_log` and
  // `user_links` so live updates show up everywhere — without these two,
  // new admin notices and activity log entries only appeared after a
  // manual reload.
  const TABLE_TO_KEY = {
    workdesk_tasks: 'workdesk-tasks',
    workdesk_issues: 'workdesk-issues',
    workdesk_departments: 'workdesk-depts',
    workdesk_employees: 'workdesk-employees',
    workdesk_delegations: 'workdesk-delegations',
    workdesk_admins: 'workdesk-admins',
    workdesk_handovers: 'workdesk-handovers',
    workdesk_notices: 'workdesk-notices',
    workdesk_trash: 'workdesk-trash',
    workdesk_activity_log: 'workdesk-actlog',
  };
  const tables = Object.keys(TABLE_TO_KEY);
  const channels = tables.map((tbl) =>
    supabase.channel('rt-' + tbl)
      .on('postgres_changes', { event: '*', schema: 'public', table: tbl }, () => {
        onUpdate(TABLE_TO_KEY[tbl]);
      })
      .subscribe()
  );
  return () => channels.forEach((c) => supabase.removeChannel(c));
}
