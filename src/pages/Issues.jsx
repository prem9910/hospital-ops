import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { uid, toDay, fDate, fDateTime, notifyAdmins, exportToExcel } from '../utils';
import { DeptTag, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/Alert';
import { DateRangeExportModal } from '../components/common/DateRangeExportModal';
import { Pagination, paginate } from '../components/common/Pagination';
import { FilterPopup, FilterField, FP_INPUT, ChipButton } from '../components/common/FilterPopup';

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };
function Field({ label, children }) {
  return <div style={{ marginBottom: 13 }}><label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>{children}</div>;
}

export default function Issues() {
  const { currentRole, currentUser, hasPerm } = useAuth();
  const { issues, depts, employees, notices, save, logAct, moveToTrash } = useApp();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [page, setPage] = useState(1);
  const [editIssue, setEditIssue] = useState(null);
  const [showResolve, setShowResolve] = useState(null);
  const [resRemark, setResRemark] = useState('');
  const [resBy, setResBy] = useState('');
  const [form, setForm] = useState({ title: '', dept: '', priority: 'medium', reporter: '', assigned: '', desc: '' });

  const canAdd = currentRole === 'mainadmin' || hasPerm('issues_add');
  const canResolve = currentRole === 'mainadmin' || hasPerm('issues_resolve');
  const canDel = currentRole === 'mainadmin' || hasPerm('tasks_delete');

  // Employees of selected department for "Assign To" dropdown
  const deptEmployees = form.dept
    ? employees.filter(e => e.dept === form.dept)
    : [];

  // Resolve button: only mainadmin or the specifically assigned employee
  function canResolveIssue(issue) {
    if (currentRole === 'mainadmin') return true;
    return (issue.assigned || '').toUpperCase() === currentUser.name.toUpperCase();
  }

  const filtered = [...issues].filter((i) => {
    if (search && !i.title.toUpperCase().includes(search.toUpperCase())) return false;
    if (filterDept && i.dept !== filterDept) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const paged = paginate(filtered, page);

  function openNew() { setForm({ title: '', dept: '', priority: 'medium', reporter: currentUser.name, assigned: '', desc: '' }); setEditIssue(null); setShowForm(true); }

  async function handleSave() {
    if (!form.title.trim()) { alert('Title required!'); return; }
    if (!form.dept) { alert('Department required!'); return; }
    const obj = { id: editIssue?.id || uid(), title: form.title.toUpperCase(), dept: form.dept, priority: form.priority, reporter: form.reporter.toUpperCase(), assigned: form.assigned.toUpperCase(), desc: form.desc, status: editIssue?.status || 'open', date: editIssue?.date || toDay(), resolveRemark: editIssue?.resolveRemark || '', resolveBy: editIssue?.resolveBy || '', resolvedAt: editIssue?.resolvedAt || '' };
    const newIssues = editIssue ? issues.map((i) => i.id === obj.id ? obj : i) : [...issues, obj];
    await save('workdesk-issues', newIssues);
    await logAct(editIssue ? 'ISSUE UPDATED' : 'ISSUE REPORTED', obj.title);
    setShowForm(false);
  }

  async function submitResolve() {
    if (!resRemark.trim()) { alert('Resolution remark required!'); return; }
    const updated = { ...showResolve, status: 'resolved', resolveRemark: resRemark.toUpperCase(), resolveBy: resBy.toUpperCase(), resolvedAt: new Date().toISOString() };
    await save('workdesk-issues', issues.map((i) => i.id === updated.id ? updated : i));
    await logAct('ISSUE RESOLVED', showResolve.title);
    // Notify main admin bell
    try {
      await notifyAdmins({
        notices, save,
        subject: `✅ Issue resolved: ${showResolve.title}`,
        message: `Issue: ${showResolve.title}\nDepartment: ${showResolve.dept}\nResolved By: ${resBy.toUpperCase()}\nRemark: ${resRemark.toUpperCase()}`,
        type: 'issue_resolved',
        meta: { issueId: showResolve.id, resolvedBy: resBy.toUpperCase(), title: showResolve.title },
      });
    } catch (e) { console.error('Admin notify failed:', e); }
    setShowResolve(null); setResRemark(''); setResBy('');
  }

  async function progressIssue(id) {
    const issue = issues.find((i) => i.id === id);
    if (!issue) return;
    const updated = { ...issue, status: 'in-progress', assigned: issue.assigned || currentUser.name };
    await save('workdesk-issues', issues.map((i) => i.id === id ? updated : i));
    await logAct('ISSUE IN-PROGRESS', issue.title);
    // Mirror the resolve flow: when a non-admin picks up an issue, surface
    // it on the admin's bell so they know it's actively being worked on.
    if (currentRole !== 'mainadmin') {
      try {
        await notifyAdmins({
          notices, save,
          subject: `▶️ Issue picked up: ${issue.title}`,
          message: `Issue: ${issue.title}\nDepartment: ${issue.dept || '—'}\nPicked Up By: ${currentUser.name}\nPriority: ${issue.priority.toUpperCase()}`,
          type: 'issue_in_progress',
          meta: { issueId: issue.id, pickedUpBy: currentUser.name, title: issue.title },
        });
      } catch (e) { console.error('Admin notify failed:', e); }
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header-title" style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d' }}>Issues / Problems</h2>
        <div className="page-header-actions">
          <button onClick={() => setShowExport(true)} style={{ padding: '7px 14px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⬇ Export</button>
          <button onClick={() => window.print()} style={{ padding: '7px 14px', borderRadius: 8, background: '#334155', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>🖨 Print</button>
          {canAdd && <button onClick={openNew} style={{ padding: '7px 14px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>⚠️ Report Issue</button>}
        </div>
      </div>

      {/* Filter popup — search + dept + status + priority. Status/priority
          use chip rows so they're tap-friendly and act as radio groups. */}
      <FilterPopup
        activeCount={(search ? 1 : 0) + (filterDept ? 1 : 0) + (filterStatus ? 1 : 0) + (filterPriority ? 1 : 0)}
        onClear={() => { setSearch(''); setFilterDept(''); setFilterStatus(''); setFilterPriority(''); }}
      >
        <FilterField label="Search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH ISSUE TITLE..." style={FP_INPUT} autoFocus />
        </FilterField>
        <FilterField label="Department">
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={FP_INPUT}>
            <option value="">ALL DEPTS</option>
            {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipButton active={!filterStatus} onClick={() => setFilterStatus('')}>ALL</ChipButton>
            <ChipButton active={filterStatus === 'open'} onClick={() => setFilterStatus('open')}>OPEN</ChipButton>
            <ChipButton active={filterStatus === 'in-progress'} onClick={() => setFilterStatus('in-progress')}>IN PROGRESS</ChipButton>
            <ChipButton active={filterStatus === 'resolved'} onClick={() => setFilterStatus('resolved')}>RESOLVED</ChipButton>
          </div>
        </FilterField>
        <FilterField label="Priority">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChipButton active={!filterPriority} onClick={() => setFilterPriority('')}>ALL</ChipButton>
            <ChipButton active={filterPriority === 'high'} onClick={() => setFilterPriority('high')}>HIGH</ChipButton>
            <ChipButton active={filterPriority === 'medium'} onClick={() => setFilterPriority('medium')}>MEDIUM</ChipButton>
            <ChipButton active={filterPriority === 'low'} onClick={() => setFilterPriority('low')}>LOW</ChipButton>
          </div>
        </FilterField>
      </FilterPopup>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d8e2ef', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Priority', 'Issue', 'Dept', 'Reporter', 'Date', 'Status', 'Resolution', 'Actions'].map((h) => (
                <th key={h} style={{ background: '#f3f7fc', padding: '9px 13px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: '#6b7a90', letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #d8e2ef' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {paged.items.length ? paged.items.map((i) => (
                <tr key={i.id} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fbff'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                  <td style={{ padding: '11px 13px' }}><PriorityBadge priority={i.priority} /></td>
                  <td style={{ padding: '11px 13px' }}><strong>{i.title}</strong>{i.desc && <div style={{ fontSize: 11, color: '#6b7a90' }}>{i.desc.slice(0, 60)}</div>}</td>
                  <td style={{ padding: '11px 13px' }}><DeptTag name={i.dept} /></td>
                  <td style={{ padding: '11px 13px', fontSize: 12 }}>{i.reporter || '—'}</td>
                  <td style={{ padding: '11px 13px', fontSize: 11, color: '#6b7a90' }}>{fDate(i.date)}</td>
                  <td style={{ padding: '11px 13px' }}><StatusBadge status={i.status} /></td>
                  <td style={{ padding: '11px 13px', fontSize: 11, maxWidth: 160 }}>{i.resolveRemark ? <span style={{ color: '#1a7a4a' }}>✅ {i.resolveRemark.slice(0, 50)}{i.resolveBy && <><br /><span style={{ color: '#6b7a90' }}>By: {i.resolveBy}</span></>}</span> : '—'}</td>
                  <td style={{ padding: '11px 13px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {canResolveIssue(i) && i.status !== 'resolved' && <button onClick={() => { setShowResolve(i); setResBy(currentUser.name); }} style={{ padding: '4px 10px', borderRadius: 7, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>✅ Resolve</button>}
                      {canResolveIssue(i) && i.status === 'open' && <button onClick={() => progressIssue(i.id)} style={{ padding: '4px 8px', borderRadius: 7, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>▶</button>}
                      {canDel && <button onClick={async () => { if (confirm('Move to Trash?')) await moveToTrash('issue', i.id); }} style={{ background: 'none', border: '1px solid #d8e2ef', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#c0392b' }}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={8}><EmptyState icon="✅" message="NO ISSUES!" /></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid #d8e2ef', padding: '0 8px' }}>
          <Pagination {...paged} onPage={(p) => setPage(p)} />
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Issue / Problem Report">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1/-1' }}><Field label="Issue Title *"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="DESCRIBE IN ONE LINE" style={IS} /></Field></div>
          <Field label="Department *">
            <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value, assigned: '' })} style={IS}>
              <option value="">Select...</option>
              {depts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={IS}>
              <option value="medium">🟡 MEDIUM</option>
              <option value="high">🔴 HIGH — URGENT!</option>
              <option value="low">🟢 LOW</option>
            </select>
          </Field>
          <Field label="Reported By">
            <input value={form.reporter} onChange={(e) => setForm({ ...form, reporter: e.target.value })} placeholder="NAME OR ROLE" style={IS} />
          </Field>
          <Field label="Assign To">
            {deptEmployees.length > 0 ? (
              <select value={form.assigned} onChange={(e) => setForm({ ...form, assigned: e.target.value })} style={IS}>
                <option value="">Select Employee...</option>
                {deptEmployees.map(e => (
                  <option key={e.id} value={e.name}>{e.name}{e.role ? ` — ${e.role}` : ''}</option>
                ))}
              </select>
            ) : (
              <input value={form.assigned} onChange={(e) => setForm({ ...form, assigned: e.target.value })} placeholder={form.dept ? 'No employees found' : 'Select a department first'} style={IS} />
            )}
          </Field>
          <div style={{ gridColumn: '1/-1' }}><Field label="Full Description"><textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="FULL DETAILS..." style={{ ...IS, minHeight: 80, resize: 'vertical' }} /></Field></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
          <button onClick={handleSave} style={{ padding: '9px 18px', borderRadius: 8, background: '#c0392b', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>⚠️ Submit</button>
          <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
        </div>
      </Modal>

      <Modal open={!!showResolve} onClose={() => setShowResolve(null)} title="✅ Resolve Issue" maxWidth="max-w-md">
        {showResolve && <>
          <Field label="Issue"><input disabled value={showResolve.title} style={{ ...IS, background: '#f5f8fc', color: '#6b7a90' }} /></Field>
          <Field label="Resolution Remark *"><textarea value={resRemark} onChange={(e) => setResRemark(e.target.value)} placeholder="WHAT WAS DONE TO RESOLVE..." style={{ ...IS, minHeight: 80, resize: 'vertical' }} /></Field>
          <Field label="Resolved By"><input value={resBy} onChange={(e) => setResBy(e.target.value)} placeholder="YOUR NAME / ROLE" style={IS} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #d8e2ef' }}>
            <button onClick={submitResolve} style={{ padding: '9px 18px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>✅ Mark Resolved</button>
            <button onClick={() => setShowResolve(null)} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cancel</button>
          </div>
        </>}
      </Modal>
      <DateRangeExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Issues Export"
        onExport={(from, to) => {
          const rows = filtered.filter(i => i.date >= from && i.date <= to);
          exportToExcel(rows.map(i => ({
            'Report Date': i.date || '—',
            'Title': i.title,
            'Department': i.dept,
            'Priority': i.priority,
            'Reporter': i.reporter || '—',
            'Assigned To': i.assigned || '—',
            'Status': i.status,
            'Description': i.desc || '—',
            'Resolved By': i.resolveBy || '—',
            'Resolution': i.resolveRemark || '—',
            'Resolved At': i.resolvedAt ? new Date(i.resolvedAt).toLocaleDateString('en-IN') : '—',
          })), `Issues_${from}_to_${to}`);
        }}
      />
    </div>
  );
}
