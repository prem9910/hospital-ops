# 🗂️ Work Desk

A full-featured **Operations Management Platform** built with React 19 + Vite. Designed to streamline daily team workflows — task management, staff handovers, issue tracking, MIS reporting, and more.

---

## ✨ Features

| Module | Description |
|---|---|
| **Dashboard** | Live summary of pending tasks, issues, handovers, and daily progress |
| **My Tasks** | Each staff member sees their assigned tasks with tabs for Task / Delegation / Handover / Done |
| **Manage Tasks** | Admin view of all tasks with assign date+time, filters, pagination, and Excel export |
| **Daily Task Cycle** | Tasks auto-cycle every day at midnight (IST-aware) based on frequency (daily / weekly / monthly) |
| **Handover** | Create & manage shift handovers with task transfer, accept/reject flow, and email notifications |
| **Issues** | Staff can report issues; admins can track, escalate, and resolve them |
| **MIS Reporting** | Multi-tab management reports with date-range Excel export |
| **Delegations** | Task delegation with extension request flow (max 3 extensions) |
| **Checklists** | Department-wise daily checklists |
| **Live Tracking** | Real-time task completion tracking across departments |
| **Staff Management** | Add/edit employees with role-based permissions |
| **Departments** | Manage team departments |
| **Activity Log** | Full audit trail of all actions (30 entries per page) |
| **Trash** | Soft-delete with 90-day auto-purge and restore (20 entries per page) |
| **Settings** | System-wide configuration |

---

## 🛠 Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4
- **Database:** Supabase (PostgreSQL) — real-time sync + offline localStorage fallback
- **Email:** Brevo (Sendinblue) SMTP via Express backend (`server/`)
- **Export:** SheetJS (xlsx) for Excel export
- **Auth:** Custom role-based auth (Main Admin / Department Admin / Staff)

---

## 📁 Project Structure

```
workdesk/
├── src/
│   ├── pages/          # All page components (Tasks, Issues, Staff, etc.)
│   ├── components/
│   │   ├── common/     # Reusable: Pagination, DateRangeExportModal, Modal, Alert, Badge
│   │   ├── dashboard/  # Dashboard widgets
│   │   ├── layout/     # Sidebar, Navbar, Layout wrapper
│   │   └── forms/      # Shared form components
│   ├── context/
│   │   ├── AppContext.jsx   # Global state: tasks, issues, handovers, employees
│   │   └── AuthContext.jsx  # Auth state and role management
│   ├── services/
│   │   └── db.js       # Supabase CRUD helpers
│   ├── lib/
│   │   └── emailService.js  # Brevo email integration
│   └── utils/
│       └── index.js    # Helpers: uid, toDay (IST), fDate, exportToExcel, autoCycleTasks
├── server/
│   ├── index.js        # Express server for email sending
│   └── .env            # Brevo API key (never commit this)
├── .env                # Supabase public keys
└── vite.config.js
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Brevo](https://brevo.com) account (for email notifications)

### Installation

```bash
# Clone the repo
git clone https://github.com/prem9910/workdesk.git
cd workdesk

# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..
```

### Environment Variables

Create `.env` in the root:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Create `server/.env`:
```env
BREVO_API_KEY=your_brevo_api_key
PORT=3001
```

### Run

```bash
# Start frontend (http://localhost:5173)
npm run dev

# Start email server (separate terminal)
cd server && node index.js
```

---

## 🔐 Default Login

| Username | Password | Role |
|---|---|---|
| `VIBHAV` | `Vibhav@0206` | Main Admin |

> Additional admin and staff accounts are managed from the **Settings** page inside the app.

---

## 📊 Key Design Decisions

- **IST-aware daily cycling** — `toDay()` uses local date methods (not `toISOString()`) to avoid UTC midnight offset bugs in Indian timezone.
- **Offline-first** — All data is stored in Supabase AND synced to `localStorage` as fallback. App works even if Supabase is temporarily unreachable.
- **Duplicate-safe task cycling** — `getDuplicateCycleIds()` cleans up race-condition duplicates on every app init.
- **Pagination everywhere** — All list views paginate (10/20/30 per page depending on the section).

---

## 📄 License

Private project — all rights reserved.
