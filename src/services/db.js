import { supabase } from '../lib/supabase';

// ─── Pack/Unpack ─────────────────────────────────────────────────────────────
const TABLES = {
  'hops-depts': {
    table: 'departments',
    pack: (o) => ({ id: o.id, name: o.name || '', head: o.hod || o.head || '', contact: o.phone || o.contact || '', email: o.email || '', floor: o.floor || '' }),
    unpack: (r) => ({ id: r.id, name: r.name || '', hod: r.head || '', head: r.head || '', phone: r.contact || '', contact: r.contact || '', email: r.email || '', floor: r.floor || '' }),
  },
  'hops-employees': {
    table: 'employees',
    pack: (o) => ({ id: o.id, name: o.name || '', username: o.username || o.name || '', dept: o.dept || '', designation: o.role || o.designation || '', email: o.email || '', password: o.password || '', contact: o.contact || '', perms: o.perms || [], is_incharge: o.isIncharge || false }),
    unpack: (r) => ({ id: r.id, name: r.name || '', username: r.username || r.name || '', dept: r.dept || '', role: r.designation || '', designation: r.designation || '', email: r.email || '', password: r.password || '', contact: r.contact || '', perms: Array.isArray(r.perms) ? r.perms : [], isIncharge: r.is_incharge || false }),
  },
  'hops-admins': {
    table: 'admins',
    pack: (o) => ({ id: o.id, name: o.name || '', username: o.username || '', email: o.email || '', password: o.password || '', role: o.role || '', dept: o.dept || '', perms: o.perms || [], created_by: o.createdBy || '' }),
    unpack: (r) => ({ id: r.id, name: r.name || '', username: r.username || '', email: r.email || '', password: r.password || '', role: r.role || '', dept: r.dept || '', perms: Array.isArray(r.perms) ? r.perms : Object.keys(r.perms || {}), createdBy: r.created_by || '' }),
  },
  'hops-tasks': {
    table: 'tasks',
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
    }),
  },
  'hops-issues': {
    table: 'issues',
    pack: (o) => ({ id: o.id, title: o.title || '', dept: o.dept || '', priority: o.priority || 'medium', reporter: o.reporter || '', assigned: o.assigned || '', description: o.desc || '', status: o.status || 'open', date: o.date || '', resolve_remark: o.resolveRemark || '', resolve_by: o.resolveBy || '', resolved_at: o.resolvedAt || null }),
    unpack: (r) => ({ id: r.id, title: r.title || '', dept: r.dept || '', priority: r.priority || 'medium', reporter: r.reporter || '', assigned: r.assigned || '', desc: r.description || '', status: r.status || 'open', date: r.date || '', resolveRemark: r.resolve_remark || '', resolveBy: r.resolve_by || '', resolvedAt: r.resolved_at || '' }),
  },
  'hops-handovers': {
    table: 'handovers',
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
        // backward compat for old records
        date: r.date || '',
        shift: '',
        pendingTasks: r.pending || '',
        equipmentStatus: '',
      };
    },
  },
  'hops-delegations': {
    table: 'delegations',
    pack: (o) => ({ id: o.id, task_name: o.task || o.taskName || '', dept: o.dept || '', priority: o.priority || 'medium', doer_id: o.doerId || '', doer_name: o.doerName || '', delegated_by: o.createdBy || o.delegatedBy || '', exp_date: o.dueDate || o.expDate || '', exp_time: o.expTime || '', notes: o.remarks || o.notes || '', status: o.status || 'pending', created_date: o.createdAt || o.createdDate || '', actual_date: o.actualDate || '', actual_time: o.actualTime || '', done_remark: o.doneRemark || '', delay_reason: o.delayReason || '', is_delayed: o.isDelayed || false, extensions: o.extensionRequests || o.extensions || [], activity_log: o.activityLog || [] }),
    unpack: (r) => ({ id: r.id, task: r.task_name || '', taskName: r.task_name || '', dept: r.dept || '', priority: r.priority || 'medium', doerId: r.doer_id || '', doerName: r.doer_name || '', createdBy: r.delegated_by || '', dueDate: r.exp_date || '', expTime: r.exp_time || '', remarks: r.notes || '', notes: r.notes || '', status: r.status || 'pending', createdAt: r.created_date || '', actualDate: r.actual_date || '', actualTime: r.actual_time || '', doneRemark: r.done_remark || '', delayReason: r.delay_reason || '', isDelayed: r.is_delayed || false, extensionRequests: r.extensions || [], activityLog: r.activity_log || [] }),
  },
  'hops-actlog': {
    table: 'activity_log',
    pack: (o) => ({ id: o.id, by_user: o.by || '', role: o.role || '', action: o.action || '', details: o.details || '', at_str: o.atStr || '' }),
    unpack: (r) => ({ id: r.id, by: r.by_user || '', role: r.role || '', action: r.action || '', details: r.details || '', at: r.created_at || '', atStr: r.at_str || '' }),
  },
  'hops-trash': {
    table: 'trash',
    pack: (o) => ({ id: o.id, type: o.type || '', data: o.data || {}, deleted_by: o.deletedBy || '', deleted_at: o.deletedAt || new Date().toISOString(), auto_delete_at: o.autoDeleteAt || '' }),
    unpack: (r) => ({ id: r.id, type: r.type || '', data: r.data || {}, deletedBy: r.deleted_by || '', deletedAt: r.deleted_at || '', autoDeleteAt: r.auto_delete_at || '' }),
  },
  'hops-notices': {
    table: 'notices',
    pack: (o) => ({ id: o.id, to_emp_id: o.toEmpId || '', to_name: o.toName || '', from_name: o.fromName || '', subject: o.subject || '', message: o.message || '', type: o.type || 'general', is_read: o.isRead || false, sent_at: o.sentAt || '' }),
    unpack: (r) => ({ id: r.id, toEmpId: r.to_emp_id || '', toName: r.to_name || '', fromName: r.from_name || '', subject: r.subject || '', message: r.message || '', type: r.type || 'general', isRead: r.is_read || false, sentAt: r.sent_at || '' }),
  },
};

const LINKS_TABLE = 'user_links';

export async function upsertRecord(key, val) {
  if (!TABLES[key] || !Array.isArray(val) || val.length === 0) return;
  const cfg = TABLES[key];
  const rows = val.map(cfg.pack);
  const { error } = await supabase.from(cfg.table).upsert(rows, { onConflict: 'id' });
  if (error) console.error('❌ Upsert [' + key + ']:', error.message);
}

export async function upsertSingle(key, obj) {
  if (!TABLES[key]) return;
  const cfg = TABLES[key];
  const row = cfg.pack(obj);
  const { error } = await supabase.from(cfg.table).upsert(row, { onConflict: 'id' });
  if (error) console.error('❌ Upsert single [' + key + ']:', error.message);
}

export async function loadAll(key) {
  const cfg = TABLES[key];
  if (!cfg) return [];
  let query = supabase.from(cfg.table).select('*');
  if (cfg.table === 'activity_log') query = query.order('created_at', { ascending: false }).limit(500);
  const { data, error } = await query;
  if (error) { console.warn('⚠️ Load [' + key + ']:', error.message); return []; }
  return (data || []).map(cfg.unpack);
}

export async function deleteRecord(type, id) {
  const tmap = { task: 'tasks', issue: 'issues', employee: 'employees', dept: 'departments', admin: 'admins', handover: 'handovers', delegation: 'delegations', trash: 'trash', link: 'user_links' };
  const tbl = tmap[type];
  if (!tbl) return { ok: false, reason: 'unknown_type' };
  const { data, error } = await supabase.from(tbl).delete().eq('id', id).select('id');
  if (error) return { ok: false, reason: 'error', message: error.message };
  if (!data || !data.length) return { ok: false, reason: 'no_rows', table: tbl };
  return { ok: true };
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
  const tables = ['tasks', 'issues', 'departments', 'employees', 'delegations', 'admins', 'handovers', 'notices'];
  const channels = tables.map((tbl) =>
    supabase.channel('rt-' + tbl)
      .on('postgres_changes', { event: '*', schema: 'public', table: tbl }, () => {
        const key = Object.keys(TABLES).find((k) => TABLES[k].table === tbl);
        if (key) onUpdate(key);
      })
      .subscribe()
  );
  return () => channels.forEach((c) => supabase.removeChannel(c));
}
