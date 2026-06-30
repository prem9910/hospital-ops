// Responsive email templates — mobile / tablet / desktop
// Uses media queries + fluid tables (email-client compatible)

// HTML-entity escape for any string interpolated into the email body.
// Without this, a malicious user who puts `<script>alert(1)</script>` in
// their name, dept, task title, etc. could inject code into every email
// recipient's mail client. The escape covers the 5 HTML-significant
// chars; everything else passes through as-is (we don't want to break
// Unicode names etc.).
function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function signature(hospitalName, headerColor) {
  return `<div class="email-signature">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td style="width:50px;vertical-align:top;padding-right:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:${headerColor};text-align:center;line-height:44px;font-size:22px">🏥</div>
      </td>
      <td style="vertical-align:top">
        <p class="sig-name">${hospitalName}</p>
        <p class="sig-title">Work Desk</p>
        <div class="sig-divider"></div>
        <p class="sig-detail">📍 Operations Platform</p>
        <p class="sig-detail">📧 <a href="mailto:ops@${hospitalName.toLowerCase().replace(/\s+/g,'')}.in">desk@workdesk.app</a></p>
        <p class="sig-detail">🕐 Working Hours: 8:00 AM – 8:00 PM</p>
        <p class="sig-tagline">"Streamlining Operations, One Task at a Time"</p>
      </td>
    </tr>
  </table>
</div>`;
}

function baseWrap(headerColor, headerHtml, bodyHtml, hospitalName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Work Desk</title>
<style>
  /* ── Reset ── */
  body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  body{margin:0!important;padding:0!important;background-color:#f3f7fc}

  /* ── Outer wrapper ── */
  .wrapper{width:100%;background:#f3f7fc;padding:20px 0}
  .email-container{max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0}

  /* ── Header ── */
  .email-header{background:${headerColor};padding:28px 32px}
  .email-header h2{color:#ffffff;margin:0;font-size:22px;font-family:Arial,sans-serif;font-weight:700}
  .email-header p{color:rgba(255,255,255,0.88);margin:6px 0 0;font-size:14px;font-family:Arial,sans-serif}

  /* ── Body ── */
  .email-body{padding:28px 32px;font-family:Arial,sans-serif}
  .greeting{font-size:16px;margin:0 0 6px}
  .subtext{color:#4a5568;font-size:14px;margin:0 0 16px;line-height:1.6}

  /* ── Info table ── */
  .info-table{width:100%;border-collapse:collapse;margin:16px 0;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}
  .info-table td{padding:11px 15px;font-size:13px;color:#1a2535;font-family:Arial,sans-serif;vertical-align:top;line-height:1.5}
  .info-table .label{font-weight:700;width:42%;background:#f8fbff;border-right:1px solid #e2e8f0;white-space:nowrap}
  .info-table .value{color:#1a2535}
  .info-table tr:not(:last-child) td{border-bottom:1px solid #e2e8f0}
  .info-table tr.alt .label{background:#f0f4fb}
  .info-table tr.alt .value{background:#f9fbff}

  /* ── Alert box ── */
  .alert-box{padding:13px 16px;border-radius:0 8px 8px 0;font-size:13px;margin-top:4px;line-height:1.6}

  /* ── Signature ── */
  .email-signature{margin-top:24px;padding-top:16px;border-top:2px solid #e2e8f0}
  .sig-inner{display:flex;align-items:flex-start;gap:14px}
  .sig-logo{width:44px;height:44px;border-radius:10px;background:${headerColor};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;text-align:center;line-height:44px}
  .sig-text{}
  .sig-name{font-size:14px;font-weight:700;color:#0b1e3d;margin:0 0 2px;font-family:Arial,sans-serif}
  .sig-title{font-size:12px;color:#6b7a90;margin:0 0 6px;font-family:Arial,sans-serif}
  .sig-divider{width:36px;height:2px;background:${headerColor};border-radius:2px;margin:6px 0}
  .sig-detail{font-size:11.5px;color:#4a5568;margin:2px 0;font-family:Arial,sans-serif}
  .sig-detail a{color:${headerColor};text-decoration:none}
  .sig-tagline{font-size:11px;color:#9ca3af;margin:8px 0 0;font-style:italic;font-family:Arial,sans-serif}

  /* ── Footer ── */
  .email-footer{padding:12px 32px 18px;text-align:center;border-top:1px solid #f0f4f8}
  .email-footer p{font-size:12px;color:#9ca3af;margin:0;font-family:Arial,sans-serif}

  /* ── TABLET (max 600px) ── */
  @media screen and (max-width:600px){
    .sig-logo{width:38px;height:38px;font-size:18px;line-height:38px}
    .wrapper{padding:12px 0}
    .email-container{border-radius:0;border-left:none;border-right:none;max-width:100%}
    .email-header{padding:20px 18px}
    .email-header h2{font-size:18px}
    .email-header p{font-size:13px}
    .email-body{padding:20px 18px}
    .greeting{font-size:15px}
    .email-footer{padding:10px 18px 16px}
    .info-table .label{width:40%}
  }

  /* ── MOBILE (max 480px) ── */
  @media screen and (max-width:480px){
    .sig-logo{width:34px;height:34px;font-size:16px;line-height:34px}
    .sig-name{font-size:13px}
    .sig-title{font-size:11px}
    .sig-detail{font-size:11px}
    .wrapper{padding:0}
    .email-header{padding:16px 14px}
    .email-header h2{font-size:16px}
    .email-header p{font-size:12px}
    .email-body{padding:16px 14px}
    .greeting{font-size:14px}
    .subtext{font-size:13px}
    .email-footer{padding:8px 14px 14px}
    .email-footer p{font-size:11px}

    /* Stack label+value on mobile */
    .info-table,
    .info-table tbody,
    .info-table tr,
    .info-table td{display:block;width:100%!important}
    .info-table tr{border-bottom:1px solid #e2e8f0}
    .info-table tr:last-child{border-bottom:none}
    .info-table .label{
      border-right:none;
      border-bottom:1px solid #e8edf3;
      padding:9px 12px 6px;
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:0.4px;
      color:#6b7a90;
    }
    .info-table .value{padding:6px 12px 10px;font-size:13px}
    .info-table tr.alt .label{background:#f0f4fb}
    .info-table tr.alt .value{background:#f9fbff}
    .alert-box{font-size:12px;padding:11px 13px}
  .signature{font-size:12px;padding:11px 13px}
  .signature .sig-name{font-size:13px}
  .signature .sig-detail{font-size:11px}
  }
</style>
</head>
<body>
<div class="wrapper">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <div class="email-container">
        <div class="email-header">${headerHtml}</div>
        <div class="email-body">${bodyHtml}${signature(hospitalName, headerColor)}</div>
        <div class="email-footer">
          <p>Work Desk &nbsp;|&nbsp; ${hospitalName}</p>
        </div>
      </div>
    </td></tr>
  </table>
</div>
</body>
</html>`;
}

function row(label, value, alt) {
  return `<tr${alt ? ' class="alt"' : ''}>
    <td class="label">${label}</td>
    <td class="value">${value || '—'}</td>
  </tr>`;
}

function alertBox(color, bgColor, borderColor, text) {
  return `<div class="alert-box" style="background:${bgColor};border-left:4px solid ${borderColor};color:${color}">${text}</div>`;
}

// ── 1. Employee Welcome ───────────────────────────────────────────────────────
export function buildWelcomeHtml({ to_name, to_email, dept, role, hospital_name, username, password }) {
  const header = `
    <h2>🗂️ Work Desk</h2>
    <p>Welcome to the Team!</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext">You have been successfully registered as an <strong>Employee</strong> on the <strong>Work Desk</strong>.</p>
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0">
      ${row('👤 Name',       `<strong>${esc(to_name)}</strong>`, false)}
      ${row('🏢 Department', esc(dept),                          true)}
      ${row('🔑 Role',       esc(role),                          false)}
      ${row('📧 Email',      esc(to_email),                      true)}
      ${row('🆔 Username',   `<strong>${esc(username || '—')}</strong>`, false)}
      ${row('🔒 Password',   `<strong style="font-family:monospace;font-size:15px;letter-spacing:1px">${esc(password || '—')}</strong>`, true)}
    </table>
    ${alertBox('#b7791f', '#fef5e7', '#b7791f', '⚠️ Please log in and change your password from Settings → Change Password as soon as possible.')}`;

  return baseWrap('#0d7377', header, body, hospital_name);
}

// ── 2. Task Assigned ──────────────────────────────────────────────────────────
export function buildAssignedHtml({ to_name, task_name, task_type, assigned_by, dept, sched_date, task_time, freq, priority, notes, hospital_name }) {
  const colorMap = { 'Normal Task': '#0d7377', 'Handover Task': '#7c3aed', 'Delegation Task': '#d97706' };
  const iconMap  = { 'Normal Task': '📋',      'Handover Task': '🔄',      'Delegation Task': '📤' };
  const color    = colorMap[task_type] || '#0d7377';
  const icon     = iconMap[task_type]  || '📋';

  const header = `
    <h2>${icon} ${task_type}</h2>
    <p>You have been assigned a new task</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext"><strong>${esc(assigned_by)}</strong> has assigned you a <strong>${esc(task_type)}</strong>:</p>
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0">
      ${row('📌 Task Name',    `<strong>${esc(task_name)}</strong>`, false)}
      ${row('🏢 Department',   esc(dept),                              true)}
      ${row('📅 Date',         esc(sched_date) || '—',                 false)}
      ${row('⏰ Time',         esc(task_time)  || '—',                 true)}
      ${row('🔁 Frequency',    esc(freq)       || '—',                 false)}
      ${row('⚡ Priority',     esc(priority)   || 'Medium',            true)}
      ${row('👤 Assigned By',  `<strong>${esc(assigned_by)}</strong>`, false)}
      ${notes ? row('📝 Notes', esc(notes), true) : ''}
    </table>
    ${alertBox('#856404', '#fff3cd', '#f5c842', '⚠️ Please complete this task by the scheduled date and time.')}`;

  return baseWrap(color, header, body, hospital_name);
}

// ── 3. Task Completed ─────────────────────────────────────────────────────────
export function buildCompletedHtml({ to_name, task_name, dept, completed_on, completed_at, priority, freq, hospital_name }) {
  const header = `
    <h2>✅ Task Successfully Completed!</h2>
    <p>Well done! You have completed your task.</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext">You have successfully completed the following task:</p>
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0">
      ${row('📌 Task Name',    `<strong>${esc(task_name)}</strong>`,    false)}
      ${row('🏢 Department',   esc(dept),                                true)}
      ${row('📅 Completed On', `<strong>${esc(completed_on)}</strong>`, false)}
      ${row('⏰ Completed At', esc(completed_at) || '—',                 true)}
      ${row('⚡ Priority',     esc(priority)     || 'Medium',            false)}
      ${row('🔁 Frequency',    esc(freq)         || '—',                 true)}
    </table>
    ${alertBox('#1a7a4a', '#d4edda', '#1a7a4a', '🎯 Thank you for completing your work on time.')}`;

  return baseWrap('#16a34a', header, body, hospital_name);
}

// ── 4. Task Reminder ──────────────────────────────────────────────────────────
export function buildReminderHtml({ to_name, task_name, dept, sched_date, task_time, freq, priority, assigned_by, reminder_type, hospital_name }) {
  const cfg = {
    overdue:   { color: '#dc2626', icon: '🚨', label: 'Overdue Task — Please Complete Immediately!',  alertBg: '#fee2e2', alertBorder: '#dc2626', alertText: '#7f1d1d', alertMsg: '🚨 This task is overdue — please complete it immediately.' },
    due_today: { color: '#d97706', icon: '⏰', label: 'Due Today — Must Be Completed Today',           alertBg: '#fff3cd', alertBorder: '#f5c842', alertText: '#856404', alertMsg: '⚠️ Please complete this task before the end of today.' },
    scheduled: { color: '#0d7377', icon: '📅', label: 'Scheduled Reminder',                            alertBg: '#e8f5fd', alertBorder: '#0d7377', alertText: '#0d7377', alertMsg: '📅 This is a reminder for your scheduled task — please complete it on time.' },
  };
  const c = cfg[reminder_type] || cfg.scheduled;

  const header = `
    <h2>${c.icon} Task Reminder</h2>
    <p>${c.label}</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext">This is a reminder for your scheduled task:</p>
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0">
      ${row('📌 Task Name',     `<strong>${esc(task_name)}</strong>`,         false)}
      ${row('🏢 Department',    esc(dept),                                      true)}
      ${row('📅 Schedule Date', `<strong>${esc(sched_date) || '—'}</strong>`, false)}
      ${row('⏰ Time',          esc(task_time)   || '—',                       true)}
      ${row('🔁 Frequency',     esc(freq)        || '—',                       false)}
      ${row('⚡ Priority',      esc(priority)    || 'Medium',                   true)}
      ${row('👤 Assigned By',   esc(assigned_by) || '—',                        false)}
    </table>
    ${alertBox(c.alertText, c.alertBg, c.alertBorder, c.alertMsg)}`;

  return baseWrap(c.color, header, body, hospital_name);
}

// ── 5. Handover Created — notify toName (recipient) ──────────────────────────
export function buildHandoverCreatedHtml({ to_name, from_name, dept, date_start, date_end, task_count, notes, hospital_name }) {
  const header = `
    <h2>🔄 Task Handover Request</h2>
    <p>You have received a handover request</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext"><strong>${esc(from_name)}</strong> has sent you a request to handover their tasks. Please review the details below and accept or reject:</p>
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0">
      ${row('👤 Handover From',  `<strong>${esc(from_name)}</strong>`, false)}
      ${row('👤 Handover To',    `<strong>${esc(to_name)}</strong>`,   true)}
      ${row('🏢 Department',     esc(dept) || '—',                     false)}
      ${row('📅 Start Date',     `<strong>${esc(date_start)}</strong>`, true)}
      ${row('📅 End Date',       `<strong>${esc(date_end)}</strong>`,   false)}
      ${row('📌 Tasks Count',    `<strong>${esc(task_count)} tasks</strong>`, true)}
      ${notes ? row('📝 Notes',  esc(notes), false) : ''}
    </table>
    ${alertBox('#7c3aed', '#f5f3ff', '#7c3aed', '⏳ Please log in to Work Desk to <strong>Accept</strong> or <strong>Reject</strong> this request.')}`;

  return baseWrap('#7c3aed', header, body, hospital_name);
}

// ── 6. Handover Tasks Assigned — notify toName on accept ─────────────────────
export function buildHandoverTasksHtml({ to_name, from_name, dept, date_start, date_end, tasks, hospital_name }) {
  const taskRows = tasks.map((t, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fbff'}">
      <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0b1e3d;border-bottom:1px solid #e2e8f0">${esc(t.name)}</td>
      <td style="padding:10px 14px;font-size:12px;color:#4a5568;border-bottom:1px solid #e2e8f0">${esc(t.dept) || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#4a5568;border-bottom:1px solid #e2e8f0">${esc(t.schedDate) || '—'}</td>
      <td style="padding:10px 14px;font-size:12px;border-bottom:1px solid #e2e8f0">
        <span style="background:${t.priority === 'high' ? '#fee2e2' : t.priority === 'medium' ? '#fff3cd' : '#d4edda'};color:${t.priority === 'high' ? '#7f1d1d' : t.priority === 'medium' ? '#7a4800' : '#155724'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800">
          ${esc((t.priority || 'medium').toUpperCase())}
        </span>
      </td>
    </tr>`).join('');

  const header = `
    <h2>📋 Handover Tasks Assigned</h2>
    <p>These tasks have been handed over to you — please complete them</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext">You have accepted the handover from <strong>${esc(from_name)}</strong>. The following <strong>${tasks.length} tasks</strong> are now your responsibility from <strong>${esc(date_start)}</strong> to <strong>${esc(date_end)}</strong>:</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:16px 0">
      <thead>
        <tr style="background:#0d7377">
          <th style="padding:10px 14px;font-size:11px;font-weight:800;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Task Name</th>
          <th style="padding:10px 14px;font-size:11px;font-weight:800;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Dept</th>
          <th style="padding:10px 14px;font-size:11px;font-weight:800;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Date</th>
          <th style="padding:10px 14px;font-size:11px;font-weight:800;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.5px">Priority</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>

    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${row('🏢 Department',  esc(dept) || '—',  false)}
      ${row('📅 From',        esc(date_start),   true)}
      ${row('📅 To',          esc(date_end),     false)}
      ${row('📌 Total Tasks', `<strong>${tasks.length}</strong>`, true)}
    </table>
    ${alertBox('#1a7a4a', '#d4edda', '#1a7a4a', '✅ Please complete these tasks as per the schedule. Contact your admin if you need any assistance.')}`;

  return baseWrap('#0d7377', header, body, hospital_name);
}

// ── 7. Handover Response — notify fromName (creator) ─────────────────────────
// decision: 'accepted' | 'rejected'
export function buildHandoverResponseHtml({ to_name, by_name, decision, remark, dept, date_start, date_end, task_count, hospital_name }) {
  const isAccepted = decision === 'accepted';
  const color       = isAccepted ? '#1a7a4a' : '#dc2626';
  const icon        = isAccepted ? '✅' : '❌';
  const label       = isAccepted ? 'Handover Accepted!' : 'Handover Rejected';

  const header = `
    <h2>${icon} ${label}</h2>
    <p>${isAccepted ? `${by_name} has accepted your handover` : `${by_name} has rejected your handover`}</p>`;

  const body = `
    <p class="greeting">Hello <strong>${esc(to_name)}</strong>,</p>
    <p class="subtext"><strong>${esc(by_name)}</strong> has responded to your handover request:</p>
    <table class="info-table" role="presentation" cellpadding="0" cellspacing="0">
      ${row('📋 Decision',    `<strong style="color:${color}">${icon} ${esc((decision || '').toUpperCase())}</strong>`, false)}
      ${row('👤 Decided By', `<strong>${esc(by_name)}</strong>`,           true)}
      ${row('🏢 Department', esc(dept) || '—',                             false)}
      ${row('📅 Period',     `${esc(date_start)} → ${esc(date_end)}`,      true)}
      ${row('📌 Tasks',      `${esc(task_count)} tasks`,                   false)}
      ${remark ? row('💬 Remark', `<em>${esc(remark)}</em>`, true) : ''}
    </table>
    ${isAccepted
      ? alertBox('#1a7a4a', '#d4edda', '#1a7a4a', `✅ ${esc(by_name)} will handle your tasks from ${esc(date_start)} to ${esc(date_end)}.`)
      : alertBox('#7f1d1d', '#fee2e2', '#dc2626', `❌ The handover has been rejected. Please select another employee or manage these tasks directly.`)}`;

  return baseWrap(color, header, body, hospital_name);
}
