import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import MyTasks from './pages/MyTasks';
import AssignTask from './pages/AssignTask';
import Issues from './pages/Issues';
import AllIssues from './pages/AllIssues';
import ReportIssue from './pages/ReportIssue';
import Staff from './pages/Staff';
import Departments from './pages/Departments';
import Delegations from './pages/Delegations';
import DelegationTasks from './pages/DelegationTasks';
import MyDelegations from './pages/MyDelegations';
import Handover from './pages/Handover';
import MyHandover from './pages/MyHandover';
import Links from './pages/Links';
import Trash from './pages/Trash';
import Settings from './pages/Settings';
import Checklists from './pages/Checklists';
import Escalation from './pages/Escalation';
import LiveTracking from './pages/LiveTracking';
import ActivityLog from './pages/ActivityLog';
import MisReporting from './pages/MisReporting';
import Notices from './pages/Notices';
import Admins from './pages/Admins';

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem('workdesk-theme') === 'dark');

  useEffect(() => {
    const html = document.documentElement;
    if (dark) {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('workdesk-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
      localStorage.setItem('workdesk-theme', 'light');
    }
  }, [dark]);

  return (
    <button
      onClick={() => setDark(d => !d)}
      title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 999999,
        width: 46, height: 46, borderRadius: '50%',
        background: dark ? '#f5c842' : '#1a2535',
        color: dark ? '#1a2535' : '#f5c842',
        border: 'none', cursor: 'pointer', fontSize: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 18px rgba(0,0,0,0.22)',
        transition: 'background 0.25s, color 0.25s, transform 0.15s',
        fontFamily: 'sans-serif',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <ThemeToggle />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/link-box" element={<Links />} />

              {/* Admin */}
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/checklist" element={<Checklists />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/escalation" element={<Escalation />} />
              <Route path="/employees" element={<Staff />} />
              <Route path="/handover" element={<Handover />} />
              <Route path="/departments" element={<Departments />} />
              <Route path="/admins" element={<Admins />} />
              <Route path="/delegation" element={<Delegations />} />
              <Route path="/delegation-tasks" element={<DelegationTasks />} />
              <Route path="/tracking" element={<LiveTracking />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/mis" element={<MisReporting />} />
              <Route path="/trash" element={<Trash />} />

              <Route path="/notices" element={<Notices />} />

              {/* Staff */}
              <Route path="/my-tasks" element={<MyTasks />} />
              <Route path="/assign-task" element={<AssignTask />} />
              <Route path="/report-issue" element={<ReportIssue />} />
              <Route path="/all-issues" element={<AllIssues />} />
              <Route path="/my-handover" element={<MyHandover />} />
              <Route path="/my-delegation" element={<MyDelegations />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
