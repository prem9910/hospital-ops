import { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react';
import { loadAll, upsertSingle, deleteRecord, setupRealtime, upsertRecord, loadUserLinks as dbLoadUserLinks, upsertLinks, deleteLinkRecord } from '../services/db';
import { ls, uid, toDay, fDateTime, autoCycleTasks, getDuplicateCycleIds, purgeOldTrash } from '../utils';
import { ONE_YEAR_MS } from '../constants';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);

const initialState = {
  depts: [],
  tasks: [],
  issues: [],
  handovers: [],
  employees: [],
  admins: [],
  delegations: [],
  actLog: [],
  trash: [],
  notices: [],
  emailCfg: { publicKey: '', serviceId: '', templateId: '', reminderId: '', assignEnabled: true, remindEnabled: true },
  loaded: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_KEY': return { ...state, [action.key]: action.value };
    case 'SET_ALL': return { ...state, ...action.payload, loaded: true };
    case 'SET_LOADED': return { ...state, loaded: true };
    default: return state;
  }
}

const KEY_MAP = {
  'workdesk-depts': 'depts',
  'workdesk-employees': 'employees',
  'workdesk-admins': 'admins',
  'workdesk-tasks': 'tasks',
  'workdesk-issues': 'issues',
  'workdesk-handovers': 'handovers',
  'workdesk-delegations': 'delegations',
  'workdesk-actlog': 'actLog',
  'workdesk-trash': 'trash',
  'workdesk-notices': 'notices',
};

// Reverse map: ls-key → deleteRecord's `type` arg. Used by the init merge
// when re-attempting deletes that didn't propagate to Supabase.
const TYPE_MAP = {
  'workdesk-tasks': 'task',
  'workdesk-issues': 'issue',
  'workdesk-employees': 'employee',
  'workdesk-depts': 'dept',
  'workdesk-admins': 'admin',
  'workdesk-handovers': 'handover',
  'workdesk-delegations': 'delegation',
};

export function AppProvider({ children }) {
  const { currentUser, currentRole, refreshPermsFromEmployees } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isSaving, setIsSaving] = useState(false);

  const setKey = useCallback((key, value) => {
    dispatch({ type: 'SET_KEY', key, value });
  }, []);

  // Persist to localStorage + Supabase
  const save = useCallback(async (hopKey, newArr) => {
    const stateKey = KEY_MAP[hopKey];
    if (!stateKey) return;
    setIsSaving(true);
    // Stamp every row with updatedAt so the realtime handler's localPending
    // filter can recognise rows we just wrote locally (Supabase hasn't echoed
    // back yet). Without this, freshly-created/updated rows get dropped on
    // the first realtime event because their updatedAt is undefined and the
    // filter falls back to 0, which fails the >= lastWrite.at - 5s check.
    const nowMs = Date.now();
    const stamped = newArr.map((r) => r ? { ...r, updatedAt: nowMs } : r);
    ls.set(hopKey, stamped);
    console.log('[save]', hopKey, '→', stamped.length, 'rows; localStorage now:', ls.get(hopKey, []).length);
    // Stamp local-write time BEFORE awaiting the network call so realtime/refresh
    // paths can recognise rows we just wrote but Supabase hasn't echoed back yet.
    ls.set('workdesk-last-local-write', { key: hopKey, at: nowMs });
    dispatch({ type: 'SET_KEY', key: stateKey, value: stamped });
    // Refresh current employee's perms live if their record was updated
    if (hopKey === 'workdesk-employees') refreshPermsFromEmployees(stamped);
    try { await upsertRecord(hopKey, stamped); } catch (e) { console.error('Save error:', e); } finally { setIsSaving(false); }
  }, [refreshPermsFromEmployees]);

  const saveSingle = useCallback(async (hopKey, item, items) => {
    const stateKey = KEY_MAP[hopKey];
    if (!stateKey) return;
    setIsSaving(true);
    const nowMs = Date.now();
    const stamped = items.map((r) => r ? { ...r, updatedAt: nowMs } : r);
    ls.set(hopKey, stamped);
    console.log('[saveSingle]', hopKey, 'item.id=', item?.id, 'rows=', stamped.length);
    ls.set('workdesk-last-local-write', { key: hopKey, at: nowMs });
    dispatch({ type: 'SET_KEY', key: stateKey, value: stamped });
    try { await upsertSingle(hopKey, item); } catch (e) { console.error('SaveSingle error:', e); } finally { setIsSaving(false); }
  }, []);

  // Initial load from Supabase + localStorage merge
  useEffect(() => {
    const keys = Object.keys(KEY_MAP);

    function loadFromLS() {
      const merged = {};
      keys.forEach((k) => { merged[KEY_MAP[k]] = ls.get(k, []); });
      merged.emailCfg = ls.get('workdesk-email', initialState.emailCfg);
      merged.trash = purgeOldTrash(merged.trash || [], ONE_YEAR_MS);
      const cycled = autoCycleTasks(merged.tasks || []);
      if (cycled.length) {
        merged.tasks = [...(merged.tasks || []), ...cycled];
        ls.set('workdesk-tasks', merged.tasks);
        upsertRecord('workdesk-tasks', cycled); // also persist to Supabase from fallback path
      }
      return merged;
    }

    // Safety: if Supabase hangs, warn (don't stamp stale LS into state — that can
    // resurrect rows the user just deleted server-side via the dashboard).
    const fallbackTimer = setTimeout(() => {
      console.warn('[init] Supabase slow — state still loading (not stamping stale localStorage)');
    }, 8000);

    async function init() {
      try {
        const fromLS = {};
        keys.forEach((k) => { fromLS[k] = ls.get(k, []); });

        const results = await Promise.all(keys.map((k) => loadAll(k)));
        const merged = {};

        // Recent local deletes — used by the init merge to drop SB-only rows
        // whose id matches a delete we recorded but that didn't propagate to
        // Supabase. Without this, a delete that the verify SELECT misread as
        // success would resurrect on the very next page refresh.
        const recentDeletesAll = ls.get('workdesk-recent-deletes', []);
        const recentDeleteCutoff = Date.now() - 5 * 60 * 1000;

        keys.forEach((k, i) => {
          const sbData = results[i] || [];
          const lsData = fromLS[k] || [];
          const sbIds = new Set(sbData.map((x) => x.id));
          const lsOnly = lsData.filter((x) => x.id && !sbIds.has(x.id));
          // Treat SB as the source of truth. LS-only rows are considered
          // stale (server-side deleted via the Supabase dashboard, removed
          // by another admin, or never synced within the 8-second
          // realtime-echo window). Drop them rather than re-upserting —
          // re-upserting was the original resurrection bug: save() stamps
          // updatedAt on every row in the array, so a stale row looks
          // indistinguishable from a freshly-saved one.
          const pending = [];
          const stale = lsOnly.slice();

          // ─── Drop SB-only rows the user recently tried to delete ──────────
          // If we have a workdesk-recent-deletes entry for an id that's still in
          // SB (but not in LS — the user's local delete already removed it),
          // the Supabase delete didn't persist. Strip it from SB and re-attempt
          // the delete. Without this, the init merge would happily re-add the
          // row to state from SB and the user's delete would silently
          // resurrect on every refresh.
          const sbOnlyDeleteIds = new Set(
            recentDeletesAll
              .filter((d) => d.key === k && d.at >= recentDeleteCutoff)
              .map((d) => d.id)
          );
          let sbDataFiltered = sbData;
          let reDeleteIds = [];
          if (sbOnlyDeleteIds.size > 0 && TYPE_MAP[k]) {
            const kept = [];
            for (const r of sbData) {
              if (r && r.id && sbOnlyDeleteIds.has(r.id)) {
                reDeleteIds.push(r.id);
              } else {
                kept.push(r);
              }
            }
            sbDataFiltered = kept;
          }

          // ─── Resolve SB/LS conflicts by updatedAt ──────────────────────────
          // When the same row id exists in BOTH SB and LS, prefer whichever
          // has the newer updatedAt. Without this, if Supabase silently lost
          // a write (returned success but DB unchanged — rare but observed),
          // the init merge would discard the newer LS version in favour of
          // the older SB row, causing the task to revert to its previous
          // status on every refresh (e.g. employee marks done → SB keeps it
          // pending → next refresh brings back the pending state).
          const tsOf = (r) => {
            const raw = r.updatedAt || r.updated_at || r.createdAt || r.created_at || 0;
            return typeof raw === 'number' ? raw : new Date(raw).getTime() || 0;
          };
          const lsById = {};
          lsData.forEach((r) => { if (r && r.id) lsById[r.id] = r; });
          const lsNewerRows = [];  // LS rows newer than their SB counterpart — re-upsert
          const resolvedSbData = sbDataFiltered.map((sbRow) => {
            const lsRow = lsById[sbRow.id];
            if (!lsRow) return sbRow;
            const lsTs = tsOf(lsRow);
            const sbTs = tsOf(sbRow);
            if (Number.isFinite(lsTs) && Number.isFinite(sbTs) && lsTs > sbTs) {
              // LS is newer — this happens when the local write was stamped
              // with Date.now() (epoch ms) but Supabase hasn't reflected the
              // change yet. Use the LS row but flag for re-upsert.
              lsNewerRows.push(lsRow);
              return lsRow;
            }
            return sbRow;
          });

          merged[KEY_MAP[k]] = [...resolvedSbData, ...pending];
          ls.set(k, [...resolvedSbData, ...pending]);
          // DEBUG: trace init merge for tasks to catch reverts
          if (k === 'workdesk-tasks') {
            const sbBreakdown = sbDataFiltered.reduce((acc, r) => { acc[r.status || 'pending'] = (acc[r.status || 'pending'] || 0) + 1; return acc; }, {});
            const lsBreakdown = lsData.reduce((acc, r) => { acc[r.status || 'pending'] = (acc[r.status || 'pending'] || 0) + 1; return acc; }, {});
            console.log(`[init] workdesk-tasks: sbData (${sbDataFiltered.length})=${JSON.stringify(sbBreakdown)}, lsData (${lsData.length})=${JSON.stringify(lsBreakdown)}, pending=${pending.length}, stale=${stale.length}, lsNewer=${lsNewerRows.length}, reDelete=${reDeleteIds.length}`);
            if (lsNewerRows.length) {
              console.log('[init] ⚠️ LS rows newer than SB — re-upserting:', lsNewerRows.map(r => ({ id: r.id, name: r.name, status: r.status, lsTs: tsOf(r), sbTs: tsOf(sbData.find(s => s.id === r.id) || {}) })));
            }
            if (reDeleteIds.length) {
              console.log('[init] ⚠️ SB rows present for ids we recently tried to delete — re-attempting deleteRecord:', reDeleteIds);
            }
          }
          if (stale.length) {
            console.warn(`[init] Dropping ${stale.length} LS-only records for ${k} (likely deleted server-side, or never synced)`);
          }
          if (lsNewerRows.length) upsertRecord(k, lsNewerRows);
          // Re-attempt the deletes we know didn't propagate. Fire and forget —
          // if it fails again, the next realtime event will surface it and
          // the user can try the delete again from the UI.
          if (reDeleteIds.length && TYPE_MAP[k]) {
            reDeleteIds.forEach((id) => { deleteRecord(TYPE_MAP[k], id); });
          }
        });
        ls.set('workdesk-last-sync', Date.now());

        merged.emailCfg = ls.get('workdesk-email', initialState.emailCfg);
        merged.trash = purgeOldTrash(merged.trash || [], ONE_YEAR_MS);

        // Remove duplicate pending cycle children before cycling
        const dupIds = getDuplicateCycleIds(merged.tasks || []);
        if (dupIds.length) {
          merged.tasks = merged.tasks.filter(t => !dupIds.includes(t.id));
          ls.set('workdesk-tasks', merged.tasks);
          dupIds.forEach(id => deleteRecord('workdesk-tasks', id));
        }

        const cycled = autoCycleTasks(merged.tasks || []);
        if (cycled.length) {
          merged.tasks = [...merged.tasks, ...cycled];
          ls.set('workdesk-tasks', merged.tasks);
          upsertRecord('workdesk-tasks', cycled);
        }

        clearTimeout(fallbackTimer);
        dispatch({ type: 'SET_ALL', payload: merged });
        // Refresh perms for admin employees using fresh Supabase data
        if (merged.employees?.length) refreshPermsFromEmployees(merged.employees);
      } catch (e) {
        console.error('❌ Init failed, falling back to localStorage:', e);
        clearTimeout(fallbackTimer);
        dispatch({ type: 'SET_ALL', payload: loadFromLS() });
      }
    }
    init();

    return () => clearTimeout(fallbackTimer);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const cleanup = setupRealtime(async (key) => {
      const fresh = await loadAll(key);
      const stateKey = KEY_MAP[key];
      if (!stateKey) return;

      // Preserve any locally-written rows that Supabase hasn't echoed back yet.
      // This guards against the realtime event firing before the new row is
      // visible to subsequent reads — without this, an in-flight task would be
      // wiped out the moment realtime fired.
      const lastWrite = ls.get('workdesk-last-local-write', null);
      // When we have a recent local write to THIS key, prefer LS over fresh
      // entirely. Supabase can take 100ms+ to echo an upsert back through
      // realtime — if a realtime event fires in that window, `fresh` would
      // contain STALE rows (the pre-update version), and dispatching it
      // would clobber our correct local state with old data.
      //
      // We use a generous 8s window because Supabase realtime can lag,
      // especially over slow networks, and during that window we know LS
      // is the source of truth (the user just wrote it).
      const recentWriteCutoff = Date.now() - 8000;
      const recentLocalWrite = lastWrite && lastWrite.key === key && lastWrite.at >= recentWriteCutoff;
      // DEBUG: trace realtime events on tasks to catch reverts
      if (key === 'workdesk-tasks') {
        const freshBreakdown = fresh.reduce((acc, r) => { acc[r.status || 'pending'] = (acc[r.status || 'pending'] || 0) + 1; return acc; }, {});
        console.log(`[realtime] workdesk-tasks event: recentLocalWrite=${recentLocalWrite}, fresh breakdown:`, freshBreakdown);
      }
      let merged;
      if (recentLocalWrite) {
        // Trust LS entirely — Supabase's fresh snapshot may still have
        // pre-update rows. Dispatch LS as-is (already up to date).
        merged = ls.get(key, []);
      } else {
        const freshIds = new Set(fresh.map((x) => x.id));
        // ─── Defense-in-depth: per-row newer-LS-wins ────────────────────────
        // When the same row id exists in BOTH fresh and LS, prefer the row
        // with the newer updatedAt. Without this, if Supabase silently lost
        // a write (returned success but DB unchanged), a subsequent realtime
        // event would fetch stale SB data and clobber our correct LS state.
        const tsOf = (r) => {
          const raw = r.updatedAt || r.updated_at || r.createdAt || r.created_at || 0;
          return typeof raw === 'number' ? raw : new Date(raw).getTime() || 0;
        };
        const lsById = {};
        ls.get(key, []).forEach((r) => { if (r && r.id) lsById[r.id] = r; });
        const overrideLsIds = new Set();
        const resolvedFresh = fresh.map((fRow) => {
          const lsRow = lsById[fRow.id];
          if (!lsRow) return fRow;
          const lsTs = tsOf(lsRow);
          const fTs = tsOf(fRow);
          if (Number.isFinite(lsTs) && Number.isFinite(fTs) && lsTs > fTs) {
            overrideLsIds.add(fRow.id);
            return lsRow;
          }
          return fRow;
        });
        merged = resolvedFresh;
        if (key === 'workdesk-tasks' && overrideLsIds.size) {
          console.log(`[realtime] ⚠️ ${overrideLsIds.size} task(s) overridden from LS (LS newer than SB):`, [...overrideLsIds]);
        }
      }
      // Strip recently-deleted IDs from the fresh payload when LS isn't already
      // canonical. Without this, an in-flight realtime event firing AFTER LS
      // was updated but BEFORE the Supabase delete completes would dispatch
      // stale state containing the just-deleted row (resurrecting it in the UI).
      //
      // BUG FIX: previously this was gated on `merged !== fresh` which was
      // always FALSE when localPending was empty (merged IS fresh by reference).
      // That meant the strip never ran on the most common path — no local
      // pending writes, just a delete. The deleted row stayed in `fresh` from
      // Supabase and got dispatched, resurrecting it in the UI.
      //
      // NOTE: with the newer-LS-wins fix above, `merged` is built from
      // `resolvedFresh` (a fresh.map(...) output) or a spread of it, so
      // `merged !== fresh` is always true now. We still splice from both
      // to be defensive — `fresh` may be referenced by `loadAll` callers.
      const recentDeletes = ls.get('workdesk-recent-deletes', []);
      const deleteCutoff = Date.now() - 5 * 60 * 1000;
      if (!recentLocalWrite && recentDeletes.length) {
        // Build a fast lookup for this key's pending deletes within the window.
        const deletedIds = new Set(
          recentDeletes
            .filter((d) => d.key === key && d.at >= deleteCutoff)
            .map((d) => d.id)
        );
        if (deletedIds.size > 0) {
          for (let i = fresh.length - 1; i >= 0; i--) {
            if (deletedIds.has(fresh[i].id)) fresh.splice(i, 1);
          }
          for (let i = merged.length - 1; i >= 0; i--) {
            if (deletedIds.has(merged[i].id)) merged.splice(i, 1);
          }
        }
      }

      if (key === 'workdesk-tasks' && !recentLocalWrite && !recentDeletes.length) {
        // Always apply autoCycle on fresh Supabase data so cycled tasks survive realtime refreshes.
        // Skip during a recent local write OR recent delete — both situations
        // mean the user just mutated the data, and autoCycle could create
        // spurious "new task assigned" cycles that the user perceives as
        // notifications triggered by their delete action.
        const cycled = autoCycleTasks(merged);
        if (cycled.length) {
          const withCycles = [...merged, ...cycled];
          ls.set(key, withCycles);
          dispatch({ type: 'SET_KEY', key: stateKey, value: withCycles });
          upsertRecord(key, cycled); // persist cycles to Supabase (triggers realtime again, but autoCycle is idempotent)
          return;
        }
      }

      ls.set(key, merged);
      dispatch({ type: 'SET_KEY', key: stateKey, value: merged });
      if (key === 'workdesk-employees') refreshPermsFromEmployees(merged);
    });
    return cleanup;
  }, [refreshPermsFromEmployees]);

  // Auto-cycle: detect date change mid-session (e.g. browser kept open overnight)
  useEffect(() => {
    let lastDate = toDay();
    const timer = setInterval(() => {
      const today = toDay();
      if (today === lastDate) return;
      lastDate = today;
      // Date changed — read fresh tasks from localStorage (closure-safe)
      const currentTasks = ls.get('workdesk-tasks', []);
      const cycled = autoCycleTasks(currentTasks);
      if (cycled.length) {
        const updated = [...currentTasks, ...cycled];
        ls.set('workdesk-tasks', updated);
        dispatch({ type: 'SET_KEY', key: 'tasks', value: updated });
        upsertRecord('workdesk-tasks', cycled);
      }
    }, 60 * 1000); // check every minute
    return () => clearInterval(timer);
  }, []);

  // Log activity
  const logAct = useCallback(
    async (action, details) => {
      const entry = {
        id: uid(), by: currentUser?.name || 'SYSTEM', role: currentRole || '',
        action, details: details || '', at: new Date().toISOString(), atStr: fDateTime(),
      };
      const newLog = [entry, ...(state.actLog || [])].slice(0, 500);
      await save('workdesk-actlog', newLog);
    },
    [currentUser, currentRole, state.actLog, save]
  );

  // Move to trash
  const moveToTrash = useCallback(
    async (type, id) => {
      const typeMap = {
        task: { arr: state.tasks, key: 'workdesk-tasks', stateKey: 'tasks' },
        issue: { arr: state.issues, key: 'workdesk-issues', stateKey: 'issues' },
        handover: { arr: state.handovers, key: 'workdesk-handovers', stateKey: 'handovers' },
        employee: { arr: state.employees, key: 'workdesk-employees', stateKey: 'employees' },
        dept: { arr: state.depts, key: 'workdesk-depts', stateKey: 'depts' },
        admin: { arr: state.admins, key: 'workdesk-admins', stateKey: 'admins' },
        delegation: { arr: state.delegations, key: 'workdesk-delegations', stateKey: 'delegations' },
      };
      const cfg = typeMap[type];
      if (!cfg) return;
      const data = cfg.arr.find((x) => x.id === id);
      if (!data) {
        console.warn(`[moveToTrash] ${type} ${id}: not found in state.${cfg.stateKey} (length=${cfg.arr?.length || 0})`);
        return;
      }
      const newArr = cfg.arr.filter((x) => x.id !== id);
      console.log(`[moveToTrash] ${type} ${id} "${data.name || data.title}": state had ${cfg.arr.length} rows, newArr has ${newArr.length}`);
      ls.set(cfg.key, newArr);
      // Track this ID as recently-deleted so the realtime handler can strip
      // it out of any in-flight `fresh` payload — otherwise an event that
      // fires AFTER LS was updated but BEFORE the Supabase delete completes
      // would call loadAll → return fresh data still containing the deleted
      // row → dispatch stale state and resurrect it.
      const recentDeletes = ls.get('workdesk-recent-deletes', []);
      recentDeletes.push({ key: cfg.key, id, at: Date.now() });
      // Keep only the last 5 minutes of deletes
      const cutoff = Date.now() - 5 * 60 * 1000;
      ls.set('workdesk-recent-deletes', recentDeletes.filter(d => d.at >= cutoff));
      ls.set('workdesk-last-local-write', { key: cfg.key, at: Date.now() });
      dispatch({ type: 'SET_KEY', key: cfg.stateKey, value: newArr });
      const delResult = await deleteRecord(type, id);
      // Under deleteRecord's current semantics, `no_rows` means "verify
      // SELECT still found the row after the delete + retry — the Supabase
      // delete did NOT persist". This is a REAL failure (likely persistent
      // read-replica lag, RLS drop, or repeated network blip). Rolling back
      // LS + state here means the user keeps seeing the row in the UI
      // rather than seeing it briefly disappear and then reappear via the
      // next realtime event when the stale Supabase state is fetched again.
      if (delResult && delResult.ok === false && delResult.reason === 'no_rows') {
        console.error(`moveToTrash: ${type} ${id} delete did not persist (no_rows after retry) — rolling back`, { table: delResult.table });
        ls.set(cfg.key, cfg.arr);
        dispatch({ type: 'SET_KEY', key: cfg.stateKey, value: cfg.arr });
        // Clear the local-write markers so the realtime handler stops
        // trusting the now-rolled-back LS for the next 8 seconds. Without
        // this, a realtime event within the window would dispatch LS
        // (no X) and the user would see X flicker in and out.
        ls.set('workdesk-last-local-write', null);
        const rd = ls.get('workdesk-recent-deletes', []).filter((d) => !(d.key === cfg.key && d.id === id));
        ls.set('workdesk-recent-deletes', rd);
        return { error: true, reason: 'no_rows', message: 'Supabase delete did not persist after retry — row may have been filtered by RLS or hit a persistent read-replica lag spike.' };
      }
      if (!delResult || !delResult.ok) {
        // Real failure (RLS, network, etc.) — roll back LS + state so UI matches DB.
        console.error('moveToTrash: deleteRecord failed', { type, id, delResult });
        ls.set(cfg.key, cfg.arr);
        dispatch({ type: 'SET_KEY', key: cfg.stateKey, value: cfg.arr });
        ls.set('workdesk-last-local-write', null);
        const rd = ls.get('workdesk-recent-deletes', []).filter((d) => !(d.key === cfg.key && d.id === id));
        ls.set('workdesk-recent-deletes', rd);
        return { error: true, reason: delResult?.reason || 'unknown', message: delResult?.message || '' };
      }
      const trashItem = {
        id: uid(), type, data, deletedBy: currentUser?.name || 'ADMIN',
        deletedAt: new Date().toISOString(),
        autoDeleteAt: new Date(Date.now() + ONE_YEAR_MS).toISOString(),
      };
      const newTrash = [...state.trash, trashItem];
      await save('workdesk-trash', newTrash);
      await logAct('DELETE ' + type.toUpperCase(), data.name || data.title || data.taskName || id);
      return data;
    },
    [state, currentUser, save, logAct]
  );

  // Restore from trash
  const restoreFromTrash = useCallback(
    async (trashItemId) => {
      const item = state.trash.find((t) => t.id === trashItemId);
      if (!item) return false;
      const typeMap = {
        task: { arr: state.tasks, key: 'workdesk-tasks', stateKey: 'tasks' },
        issue: { arr: state.issues, key: 'workdesk-issues', stateKey: 'issues' },
        handover: { arr: state.handovers, key: 'workdesk-handovers', stateKey: 'handovers' },
        employee: { arr: state.employees, key: 'workdesk-employees', stateKey: 'employees' },
        dept: { arr: state.depts, key: 'workdesk-depts', stateKey: 'depts' },
        admin: { arr: state.admins, key: 'workdesk-admins', stateKey: 'admins' },
        delegation: { arr: state.delegations, key: 'workdesk-delegations', stateKey: 'delegations' },
      };
      const cfg = typeMap[item.type];
      if (!cfg) return false;
      const existing = cfg.arr.find((x) => x.id === item.data.id);
      if (existing) return false;
      const newArr = [...cfg.arr, item.data];
      ls.set(cfg.key, newArr);
      dispatch({ type: 'SET_KEY', key: cfg.stateKey, value: newArr });
      await upsertSingle(cfg.key, item.data);
      const newTrash = state.trash.filter((t) => t.id !== trashItemId);
      await save('workdesk-trash', newTrash);
      await deleteRecord('trash', trashItemId);
      await logAct('RESTORED ' + item.type.toUpperCase(), item.data.name || item.data.title || item.data.taskName || '');
      return true;
    },
    [state, save, logAct]
  );

  const loadUserLinks = useCallback((username) => dbLoadUserLinks(username), []);
  const upsertUserLinks = useCallback((username, links) => upsertLinks(username, links), []);
  const deleteUserLink = useCallback((id) => deleteLinkRecord(id), []);

  // Run auto-cycle on current state (called by pages like MyTasks on mount)
  const ensureCycles = useCallback(() => {
    const cycled = autoCycleTasks(state.tasks);
    if (!cycled.length) return;
    const updated = [...state.tasks, ...cycled];
    ls.set('workdesk-tasks', updated);
    dispatch({ type: 'SET_KEY', key: 'tasks', value: updated });
    upsertRecord('workdesk-tasks', cycled);
  }, [state.tasks]);

  return (
    <AppContext.Provider value={{ ...state, isSaving, save, saveSingle, logAct, moveToTrash, restoreFromTrash, setKey, loadUserLinks, upsertUserLinks, deleteUserLink, ensureCycles, deleteRecord }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
