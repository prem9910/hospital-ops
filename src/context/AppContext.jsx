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
  'hops-depts': 'depts',
  'hops-employees': 'employees',
  'hops-admins': 'admins',
  'hops-tasks': 'tasks',
  'hops-issues': 'issues',
  'hops-handovers': 'handovers',
  'hops-delegations': 'delegations',
  'hops-actlog': 'actLog',
  'hops-trash': 'trash',
  'hops-notices': 'notices',
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
    ls.set(hopKey, newArr);
    console.log('[save]', hopKey, '→', newArr.length, 'rows; localStorage now:', ls.get(hopKey, []).length);
    // Stamp local-write time BEFORE awaiting the network call so realtime/refresh
    // paths can recognise rows we just wrote but Supabase hasn't echoed back yet.
    ls.set('hops-last-local-write', { key: hopKey, at: Date.now() });
    dispatch({ type: 'SET_KEY', key: stateKey, value: newArr });
    // Refresh current employee's perms live if their record was updated
    if (hopKey === 'hops-employees') refreshPermsFromEmployees(newArr);
    try { await upsertRecord(hopKey, newArr); } catch (e) { console.error('Save error:', e); } finally { setIsSaving(false); }
  }, [refreshPermsFromEmployees]);

  const saveSingle = useCallback(async (hopKey, item, items) => {
    const stateKey = KEY_MAP[hopKey];
    if (!stateKey) return;
    setIsSaving(true);
    ls.set(hopKey, items);
    console.log('[saveSingle]', hopKey, 'item.id=', item?.id, 'rows=', items.length);
    ls.set('hops-last-local-write', { key: hopKey, at: Date.now() });
    dispatch({ type: 'SET_KEY', key: stateKey, value: items });
    try { await upsertSingle(hopKey, item); } catch (e) { console.error('SaveSingle error:', e); } finally { setIsSaving(false); }
  }, []);

  // Initial load from Supabase + localStorage merge
  useEffect(() => {
    const keys = Object.keys(KEY_MAP);

    function loadFromLS() {
      const merged = {};
      keys.forEach((k) => { merged[KEY_MAP[k]] = ls.get(k, []); });
      merged.emailCfg = ls.get('hops-email', initialState.emailCfg);
      merged.trash = purgeOldTrash(merged.trash || [], ONE_YEAR_MS);
      const cycled = autoCycleTasks(merged.tasks || []);
      if (cycled.length) {
        merged.tasks = [...(merged.tasks || []), ...cycled];
        ls.set('hops-tasks', merged.tasks);
        upsertRecord('hops-tasks', cycled); // also persist to Supabase from fallback path
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

        // Timestamp of the last successful sync — anything older is treated
        // as a stale localStorage leftover (e.g. a row the user deleted
        // server-side via the Supabase dashboard), NOT a pending write.
        const lastSyncAt = ls.get('hops-last-sync', 0);

        keys.forEach((k, i) => {
          const sbData = results[i] || [];
          const lsData = fromLS[k] || [];
          const sbIds = new Set(sbData.map((x) => x.id));
          const lsOnly = lsData.filter((x) => x.id && !sbIds.has(x.id));
          // Treat any LS-only row written after the last sync as pending.
          // updatedAt/createdAt may be ISO strings OR epoch numbers — normalise.
          const pending = lsOnly.filter((x) => {
            const tsRaw = x.updatedAt || x.createdAt || 0;
            const ts = typeof tsRaw === 'number' ? tsRaw : new Date(tsRaw).getTime();
            return (Number.isFinite(ts) ? ts : 0) > lastSyncAt;
          });
          const stale = lsOnly.filter((x) => !pending.includes(x));
          merged[KEY_MAP[k]] = [...sbData, ...pending];
          ls.set(k, [...sbData, ...pending]);
          if (stale.length) {
            console.warn(`[init] Dropping ${stale.length} stale LS-only records for ${k} (likely deleted server-side)`);
          }
          if (pending.length) upsertRecord(k, pending);
        });
        ls.set('hops-last-sync', Date.now());

        merged.emailCfg = ls.get('hops-email', initialState.emailCfg);
        merged.trash = purgeOldTrash(merged.trash || [], ONE_YEAR_MS);

        // Remove duplicate pending cycle children before cycling
        const dupIds = getDuplicateCycleIds(merged.tasks || []);
        if (dupIds.length) {
          merged.tasks = merged.tasks.filter(t => !dupIds.includes(t.id));
          ls.set('hops-tasks', merged.tasks);
          dupIds.forEach(id => deleteRecord('hops-tasks', id));
        }

        const cycled = autoCycleTasks(merged.tasks || []);
        if (cycled.length) {
          merged.tasks = [...merged.tasks, ...cycled];
          ls.set('hops-tasks', merged.tasks);
          upsertRecord('hops-tasks', cycled);
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
      const lastWrite = ls.get('hops-last-local-write', null);
      const freshIds = new Set(fresh.map((x) => x.id));
      const localPending = (lastWrite && lastWrite.key === key)
        ? ls.get(key, []).filter((row) => {
            if (!row || !row.id) return false;
            if (freshIds.has(row.id)) return false;
            const ts = Number(row.updatedAt || row.createdAt || 0);
            return ts >= lastWrite.at - 1000; // 1s slack for clock skew
          })
        : [];
      const merged = localPending.length ? [...fresh, ...localPending] : fresh;

      if (key === 'hops-tasks') {
        // Always apply autoCycle on fresh Supabase data so cycled tasks survive realtime refreshes
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
      if (key === 'hops-employees') refreshPermsFromEmployees(merged);
      if (localPending.length) {
        // Re-push pending rows so Supabase eventually catches up
        upsertRecord(key, localPending);
      }
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
      const currentTasks = ls.get('hops-tasks', []);
      const cycled = autoCycleTasks(currentTasks);
      if (cycled.length) {
        const updated = [...currentTasks, ...cycled];
        ls.set('hops-tasks', updated);
        dispatch({ type: 'SET_KEY', key: 'tasks', value: updated });
        upsertRecord('hops-tasks', cycled);
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
      await save('hops-actlog', newLog);
    },
    [currentUser, currentRole, state.actLog, save]
  );

  // Move to trash
  const moveToTrash = useCallback(
    async (type, id) => {
      const typeMap = {
        task: { arr: state.tasks, key: 'hops-tasks', stateKey: 'tasks' },
        issue: { arr: state.issues, key: 'hops-issues', stateKey: 'issues' },
        handover: { arr: state.handovers, key: 'hops-handovers', stateKey: 'handovers' },
        employee: { arr: state.employees, key: 'hops-employees', stateKey: 'employees' },
        dept: { arr: state.depts, key: 'hops-depts', stateKey: 'depts' },
        admin: { arr: state.admins, key: 'hops-admins', stateKey: 'admins' },
        delegation: { arr: state.delegations, key: 'hops-delegations', stateKey: 'delegations' },
      };
      const cfg = typeMap[type];
      if (!cfg) return;
      const data = cfg.arr.find((x) => x.id === id);
      if (!data) return;
      const newArr = cfg.arr.filter((x) => x.id !== id);
      ls.set(cfg.key, newArr);
      dispatch({ type: 'SET_KEY', key: cfg.stateKey, value: newArr });
      const delResult = await deleteRecord(type, id);
      if (!delResult || !delResult.ok) {
        // DB delete failed (row gone, RLS, network). Roll back LS + state so UI matches DB.
        console.error('moveToTrash: deleteRecord failed', { type, id, delResult });
        ls.set(cfg.key, cfg.arr);
        dispatch({ type: 'SET_KEY', key: cfg.stateKey, value: cfg.arr });
        return { error: true, reason: delResult?.reason || 'unknown', message: delResult?.message || '' };
      }
      const trashItem = {
        id: uid(), type, data, deletedBy: currentUser?.name || 'ADMIN',
        deletedAt: new Date().toISOString(),
        autoDeleteAt: new Date(Date.now() + ONE_YEAR_MS).toISOString(),
      };
      const newTrash = [...state.trash, trashItem];
      await save('hops-trash', newTrash);
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
        task: { arr: state.tasks, key: 'hops-tasks', stateKey: 'tasks' },
        issue: { arr: state.issues, key: 'hops-issues', stateKey: 'issues' },
        handover: { arr: state.handovers, key: 'hops-handovers', stateKey: 'handovers' },
        employee: { arr: state.employees, key: 'hops-employees', stateKey: 'employees' },
        dept: { arr: state.depts, key: 'hops-depts', stateKey: 'depts' },
        admin: { arr: state.admins, key: 'hops-admins', stateKey: 'admins' },
        delegation: { arr: state.delegations, key: 'hops-delegations', stateKey: 'delegations' },
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
      await save('hops-trash', newTrash);
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
    ls.set('hops-tasks', updated);
    dispatch({ type: 'SET_KEY', key: 'tasks', value: updated });
    upsertRecord('hops-tasks', cycled);
  }, [state.tasks]);

  return (
    <AppContext.Provider value={{ ...state, isSaving, save, saveSingle, logAct, moveToTrash, restoreFromTrash, setKey, loadUserLinks, upsertUserLinks, deleteUserLink, ensureCycles }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
