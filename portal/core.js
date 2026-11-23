/*
 * LCM Work Portal — shared backend core.
 *
 * This exact file runs in two places:
 *   1. Google Apps Script (paste it as a file named "Core.gs") — the real backend.
 *   2. The browser, in Preview mode only (no API_URL set) — backed by localStorage.
 *
 * It holds every business rule: OTP login, roles, tasks, remarks, method-change
 * approvals, daily works, uploads, team management and the activity log.
 * Storage, email and Drive are injected through `db` and `svc` adapters.
 */
/* eslint-disable no-var */
var LCM_TABLES = {
  Users: ['id', 'email', 'name', 'role', 'department', 'active', 'createdAt'],
  Tasks: ['id', 'title', 'description', 'method', 'assignee', 'priority', 'status', 'progress',
    'category', 'startDate', 'dueDate', 'isDaily', 'createdBy', 'createdAt', 'updatedAt', 'completedAt'],
  Remarks: ['id', 'taskId', 'author', 'text', 'statusFrom', 'statusTo', 'progress', 'createdAt'],
  Proposals: ['id', 'taskId', 'author', 'title', 'approach', 'reason', 'status', 'adminNote',
    'reviewedBy', 'reviewedAt', 'createdAt'],
  Files: ['id', 'taskId', 'name', 'url', 'driveId', 'mime', 'size', 'uploader', 'department', 'folder', 'createdAt'],
  DailyLogs: ['id', 'date', 'author', 'summary', 'hours', 'blockers', 'createdAt'],
  Activity: ['id', 'actor', 'action', 'detail', 'taskId', 'createdAt'],
  Attendance: ['id', 'date', 'email', 'checkIn', 'checkOut', 'note', 'report', 'reportUrl', 'editedBy', 'createdAt'],
  // Private "My Mind" space: notes (kind=note) and mind-tree items (kind=node), one row each.
  Mind: ['id', 'owner', 'kind', 'parentId', 'title', 'body', 'status', 'links', 'tags', 'order', 'collapsed', 'createdAt', 'updatedAt', 'meta'],
  // Links My Mind tasks to the Google Calendar events created for their deadlines (backend only).
  MindCal: ['id', 'owner', 'eventId', 'series', 'sig', 'mode', 'updatedAt'],
  Sessions: ['id', 'email', 'expiresAt', 'createdAt']
};

var LCM_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'In Review', 'Completed'];
var LCM_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
// Office time zone for attendance dates and admin corrections (India Standard Time, no DST).
var LCM_TIMEZONE = 'Asia/Kolkata';
var LCM_TZ_OFFSET = '+05:30';
// Only these accounts get the private "My Mind" section. Their data is visible to nobody else, admins included.
var LCM_MIND_OWNERS = ['wesleyj84660@gmail.com'];

function LCMCore(db, svc) {
  var OTP_TTL_SEC = 600;
  var OTP_MAX_ATTEMPTS = 5;
  var OTP_RESEND_SEC = 45;
  var SESSION_DAYS = 7;
  var MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

  function err(msg, code) { var e = new Error(msg); e.code = code || 400; return e; }
  function now() { return svc.now(); }
  function lc(s) { return String(s || '').trim().toLowerCase(); }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 5000); }
  function bool(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

  function users() {
    return db.all('Users').map(function (u) { u.active = u.active === '' ? true : bool(u.active); return u; });
  }
  function findUser(email) {
    email = lc(email);
    return users().filter(function (u) { return lc(u.email) === email; })[0] || null;
  }
  function publicUser(u) {
    return { id: u.id, email: lc(u.email), name: u.name, role: u.role, department: u.department, active: u.active };
  }
  function log(actor, action, detail, taskId) {
    db.insert('Activity', { id: svc.uuid(), actor: actor, action: action, detail: str(detail, 500), taskId: taskId || '', createdAt: now() });
  }
  function getTask(id) {
    var t = db.all('Tasks').filter(function (x) { return x.id === id; })[0];
    if (!t) throw err('Task not found', 404);
    return t;
  }
  function canSeeTask(user, t) { return user.role === 'admin' || lc(t.assignee) === lc(user.email); }
  function requireAdmin(user) { if (user.role !== 'admin') throw err('Admins only', 403); }

  // ---------- Auth ----------
  function ensureBootstrapAdmin(email) {
    var admins = (svc.adminEmails || []).map(lc);
    if (admins.indexOf(email) === -1) return;
    if (findUser(email)) return;
    db.insert('Users', { id: svc.uuid(), email: email, name: email.split('@')[0], role: 'admin', department: 'Management', active: true, createdAt: now() });
  }

  function requestOtp(p) {
    var email = lc(p.email);
    if (!validEmail(email)) throw err('Enter a valid email address');
    ensureBootstrapAdmin(email);
    var generic = { ok: true, message: 'If this email is registered, a 6-digit code has been sent. It expires in 10 minutes.' };
    var u = findUser(email);
    if (!u || !u.active) return generic;
    var last = svc.cacheGet('otp_sent_' + email);
    if (last) throw err('Please wait a few seconds before requesting another code', 429);
    var code = String(Math.floor(100000 + svc.random() * 900000));
    svc.cachePut('otp_' + email, JSON.stringify({ h: svc.hash(email + ':' + code), a: 0 }), OTP_TTL_SEC);
    svc.cachePut('otp_sent_' + email, '1', OTP_RESEND_SEC);
    svc.sendOtp(email, code, u.name);
    if (svc.exposeOtp) generic.previewCode = code; // Preview mode only — never set on the real backend
    return generic;
  }

  function verifyOtp(p) {
    var email = lc(p.email), code = str(p.code, 10);
    var raw = svc.cacheGet('otp_' + email);
    if (!raw) throw err('Code expired or not requested. Request a new one.', 401);
    var rec = JSON.parse(raw);
    if (rec.a >= OTP_MAX_ATTEMPTS) { svc.cacheRemove('otp_' + email); throw err('Too many attempts. Request a new code.', 429); }
    if (rec.h !== svc.hash(email + ':' + code)) {
      rec.a++; svc.cachePut('otp_' + email, JSON.stringify(rec), OTP_TTL_SEC);
      throw err('Incorrect code. ' + (OTP_MAX_ATTEMPTS - rec.a) + ' attempt(s) left.', 401);
    }
    svc.cacheRemove('otp_' + email);
    var u = findUser(email);
    if (!u || !u.active) throw err('Account not active', 403);
    var token = svc.uuid() + svc.uuid();
    var exp = new Date(Date.parse(now()) + SESSION_DAYS * 864e5).toISOString();
    db.insert('Sessions', { id: svc.hash(token), email: email, expiresAt: exp, createdAt: now() });
    log(email, 'login', 'Signed in');
    return { token: token, user: publicUser(u) };
  }

  function auth(token) {
    if (!token) throw err('Please sign in', 401);
    var id = svc.hash(token);
    // Sessions are cached for up to 6 hours so most requests skip reading the Sessions sheet.
    var s = svc.cacheGet('sess_' + id);
    s = s ? JSON.parse(s) : db.all('Sessions').filter(function (x) { return x.id === id; })[0];
    if (!s || Date.parse(s.expiresAt) < Date.parse(now())) throw err('Session expired. Please sign in again.', 401);
    svc.cachePut('sess_' + id, JSON.stringify({ email: s.email, expiresAt: s.expiresAt }), 21600);
    var u = findUser(s.email);
    if (!u || !u.active) throw err('Account not active', 403);
    return publicUser(u);
  }

  function logout(user, p, token) {
    svc.cacheRemove('sess_' + svc.hash(token));
    db.remove('Sessions', svc.hash(token));
    return { ok: true };
  }

  // ---------- Data ----------
  function bootstrap(user) {
    var tasks = db.all('Tasks').filter(function (t) { return canSeeTask(user, t); });
    var ids = {}; tasks.forEach(function (t) { ids[t.id] = 1; });
    var inScope = function (r) { return user.role === 'admin' || ids[r.taskId]; };
    var mine = function (r) { return user.role === 'admin' || lc(r.author) === lc(user.email); };
    tasks.forEach(function (t) { t.progress = num(t.progress, 0); t.isDaily = bool(t.isDaily); });
    return {
      me: user,
      users: users().map(publicUser),
      tasks: tasks,
      remarks: db.all('Remarks').filter(inScope),
      proposals: db.all('Proposals').filter(function (r) { return inScope(r) && mine(r); }),
      files: db.all('Files').filter(inScope),
      dailyLogs: db.all('DailyLogs').filter(mine),
      attendance: db.all('Attendance').filter(function (r) { return user.role === 'admin' || lc(r.email) === lc(user.email); }),
      serverNow: now(),
      officeDate: officeDate(),
      timezone: LCM_TIMEZONE,
      features: { mind: hasMind(user) },
      activity: (db.tail ? db.tail('Activity', 400) : db.all('Activity').slice(-400)).filter(function (a) {
        return user.role === 'admin' || lc(a.actor) === lc(user.email) || ids[a.taskId];
      }).slice(-300),
      departments: users().map(function (u) { return u.department; }).filter(function (d, i, a) { return d && a.indexOf(d) === i; }).sort(),
      statuses: LCM_STATUSES,
      priorities: LCM_PRIORITIES,
      uploadsFolderUrl: user.role === 'admin' ? (svc.folderUrl ? svc.folderUrl() : '') : ''
    };
  }

  function createTask(user, p) {
    requireAdmin(user);
    var title = str(p.title, 200);
    if (!title) throw err('Title is required');
    var assignee = lc(p.assignee);
    if (assignee && !findUser(assignee)) throw err('Assignee is not a registered employee');
    var t = {
      id: svc.uuid(), title: title, description: str(p.description), method: str(p.method),
      assignee: assignee, priority: LCM_PRIORITIES.indexOf(p.priority) >= 0 ? p.priority : 'Medium',
      status: LCM_STATUSES.indexOf(p.status) >= 0 ? p.status : 'Not Started', progress: 0,
      category: str(p.category, 80), startDate: str(p.startDate, 10) || now().slice(0, 10),
      dueDate: str(p.dueDate, 10), isDaily: bool(p.isDaily), createdBy: user.email,
      createdAt: now(), updatedAt: now(), completedAt: ''
    };
    if (t.status === 'Completed') { t.progress = 100; t.completedAt = now(); }
    db.insert('Tasks', t);
    log(user.email, t.isDaily ? 'daily_work' : 'task_created', (t.isDaily ? 'Daily work: ' : 'Created: ') + t.title + (assignee ? ' → ' + assignee : ''), t.id);
    return t;
  }

  function updateTask(user, p) {
    var t = getTask(p.id);
    if (!canSeeTask(user, t)) throw err('Not your task', 403);
    var patch = {};
    var isAdmin = user.role === 'admin';
    if (isAdmin) {
      ['title', 'description', 'method', 'category', 'startDate', 'dueDate'].forEach(function (k) {
        if (p[k] !== undefined) patch[k] = str(p[k]);
      });
      if (p.priority !== undefined && LCM_PRIORITIES.indexOf(p.priority) >= 0) patch.priority = p.priority;
      if (p.isDaily !== undefined) patch.isDaily = bool(p.isDaily);
      if (p.assignee !== undefined) {
        var a = lc(p.assignee);
        if (a && !findUser(a)) throw err('Assignee is not a registered employee');
        if (a !== lc(t.assignee)) log(user.email, 'task_assigned', t.title + ' → ' + (a || 'unassigned'), t.id);
        patch.assignee = a;
      }
    }
    if (p.status !== undefined) {
      if (LCM_STATUSES.indexOf(p.status) < 0) throw err('Unknown status');
      if (p.status !== t.status) {
        patch.status = p.status;
        patch.completedAt = p.status === 'Completed' ? now() : '';
        if (p.status === 'Completed') patch.progress = 100;
        db.insert('Remarks', { id: svc.uuid(), taskId: t.id, author: user.email, text: str(p.remark) || 'Status changed',
          statusFrom: t.status, statusTo: p.status, progress: patch.progress != null ? patch.progress : num(t.progress, 0), createdAt: now() });
        log(user.email, 'status', t.title + ': ' + t.status + ' → ' + p.status, t.id);
      }
    }
    if (p.progress !== undefined && patch.progress === undefined) {
      patch.progress = Math.max(0, Math.min(100, Math.round(num(p.progress, 0))));
    }
    if (!Object.keys(patch).length) return t;
    patch.updatedAt = now();
    return db.update('Tasks', t.id, patch);
  }

  function deleteTask(user, p) {
    requireAdmin(user);
    var t = getTask(p.id);
    db.remove('Tasks', t.id);
    log(user.email, 'task_deleted', 'Deleted: ' + t.title, t.id);
    return { ok: true };
  }

  function addRemark(user, p) {
    var t = getTask(p.taskId);
    if (!canSeeTask(user, t)) throw err('Not your task', 403);
    var text = str(p.text, 3000);
    if (!text) throw err('Remark cannot be empty');
    var progress = p.progress !== undefined && p.progress !== '' ? Math.max(0, Math.min(100, Math.round(num(p.progress, 0)))) : num(t.progress, 0);
    var r = { id: svc.uuid(), taskId: t.id, author: user.email, text: text, statusFrom: '', statusTo: '', progress: progress, createdAt: now() };
    db.insert('Remarks', r);
    if (progress !== num(t.progress, 0)) db.update('Tasks', t.id, { progress: progress, updatedAt: now() });
    log(user.email, 'remark', t.title + ': ' + text.slice(0, 120), t.id);
    return r;
  }

  function createProposal(user, p) {
    var t = getTask(p.taskId);
    if (!canSeeTask(user, t)) throw err('Not your task', 403);
    var approach = str(p.approach, 5000);
    if (!approach) throw err('Describe the alternative method');
    var pr = { id: svc.uuid(), taskId: t.id, author: user.email, title: str(p.title, 200) || 'Alternative method',
      approach: approach, reason: str(p.reason, 2000), status: 'Pending', adminNote: '', reviewedBy: '', reviewedAt: '', createdAt: now() };
    db.insert('Proposals', pr);
    log(user.email, 'proposal', 'Proposed a new method for "' + t.title + '"', t.id);
    if (svc.notifyAdmins) svc.notifyAdmins(users().filter(function (u) { return u.role === 'admin' && u.active; }).map(function (u) { return lc(u.email); }),
      'Approval needed: new method for "' + t.title + '"', user.email + ' proposed:\n\n' + approach + (pr.reason ? '\n\nWhy: ' + pr.reason : ''));
    return pr;
  }

  function reviewProposal(user, p) {
    requireAdmin(user);
    var pr = db.all('Proposals').filter(function (x) { return x.id === p.id; })[0];
    if (!pr) throw err('Proposal not found', 404);
    if (pr.status !== 'Pending') throw err('Already reviewed');
    var decision = p.decision === 'Approved' ? 'Approved' : 'Rejected';
    var updated = db.update('Proposals', pr.id, { status: decision, adminNote: str(p.note, 2000), reviewedBy: user.email, reviewedAt: now() });
    var t = getTask(pr.taskId);
    if (decision === 'Approved') {
      db.update('Tasks', t.id, { method: pr.approach, updatedAt: now() });
    }
    db.insert('Remarks', { id: svc.uuid(), taskId: t.id, author: user.email,
      text: 'Method change ' + decision.toLowerCase() + ': ' + pr.title + (p.note ? ' — ' + str(p.note, 500) : ''),
      statusFrom: '', statusTo: '', progress: num(t.progress, 0), createdAt: now() });
    log(user.email, 'proposal_' + decision.toLowerCase(), decision + ' method change by ' + pr.author + ' on "' + t.title + '"', t.id);
    return updated;
  }

  function uploadFile(user, p) {
    var t = p.taskId ? getTask(p.taskId) : null;
    if (t && !canSeeTask(user, t)) throw err('Not your task', 403);
    var reportDate = p.report ? officeDate() : '';
    var name = str(p.name, 200).replace(/[\\/]/g, '_');
    if (!name || !p.data) throw err('No file received');
    var size = Math.floor(String(p.data).length * 3 / 4);
    if (size > MAX_UPLOAD_BYTES) throw err('File is larger than 25 MB');
    // Folder layout in Drive: <root> / <Department> / <Task title> / file
    // Department = the task assignee's department (so a task's files stay together),
    // falling back to the uploader's own department, then "General".
    var owner = t && t.assignee ? findUser(t.assignee) : null;
    var dept = str((owner && owner.department) || user.department, 80) || 'General';
    if (reportDate) dept = str(user.department, 80) || 'General';
    var taskFolder = reportDate ? 'Daily Reports / ' + reportDate.slice(0, 7) : (t ? t.title : 'General Uploads');
    var stored = svc.saveFile(name, str(p.mime, 120) || 'application/octet-stream', p.data, {
      path: reportDate ? [dept, 'Daily Reports', reportDate.slice(0, 7)] : [dept, t ? t.title : 'General Uploads'],
      department: dept, task: taskFolder, uploader: user.email
    });
    var f = { id: svc.uuid(), taskId: t ? t.id : '', name: name, url: stored.url, driveId: stored.id,
      mime: str(p.mime, 120), size: size, uploader: user.email, department: dept,
      folder: dept + ' / ' + taskFolder, createdAt: now() };
    db.insert('Files', f);
    log(user.email, 'upload', 'Uploaded ' + name + (t ? ' to "' + t.title + '"' : ''), t ? t.id : '');
    return f;
  }

  // ---------- Attendance (server clock, office time zone) ----------
  function officeDate() { return svc.officeDate ? svc.officeDate() : now().slice(0, 10); }
  function todayRecord(email) {
    var d = officeDate();
    return db.all('Attendance').filter(function (r) { return r.date === d && lc(r.email) === lc(email); })[0] || null;
  }
  function checkIn(user, p) {
    var rec = todayRecord(user.email);
    if (rec) throw err('You already checked in today at ' + svc.formatTime(rec.checkIn));
    rec = { id: svc.uuid(), date: officeDate(), email: user.email, checkIn: now(), checkOut: '', note: str(p.note, 300), editedBy: '', createdAt: now() };
    db.insert('Attendance', rec);
    log(user.email, 'check_in', 'Checked in — present at office (' + svc.formatTime(rec.checkIn) + ')');
    return rec;
  }
  function checkOut(user, p) {
    var rec = todayRecord(user.email);
    if (!rec) throw err('Check in first');
    if (rec.checkOut) throw err('You already checked out today at ' + svc.formatTime(rec.checkOut));
    var report = str(p.report, 5000);
    if (report.length < 5) throw err('Write a short report of what you did today before checking out');
    var outAt = now();
    var hours = Math.round((Date.parse(outAt) - Date.parse(rec.checkIn)) / 36e4) / 10;
    var dept = str(user.department, 80) || 'General';
    var taskLines = (Array.isArray(p.taskIds) ? p.taskIds : []).map(function (id) {
      var t = db.all('Tasks').filter(function (x) { return x.id === id && lc(x.assignee) === lc(user.email); })[0];
      return t ? t.title + ' — ' + t.status + ' (' + (num(t.progress, 0)) + '%)' : null;
    }).filter(Boolean);
    var files = (Array.isArray(p.files) ? p.files : []).slice(0, 20).map(function (f) { return str(f.name, 200) + ': ' + str(f.url, 500); });
    var doc = { id: '', url: '' };
    if (svc.saveReport) {
      doc = svc.saveReport({
        path: [dept, 'Daily Reports', rec.date.slice(0, 7)],
        title: rec.date + ' — ' + user.name + ' — Daily Report',
        heading: 'Daily Work Report',
        fields: [['Name', user.name + ' (' + user.email + ')'], ['Department', dept], ['Date', rec.date],
          ['Entry', svc.formatTime(rec.checkIn)], ['Exit', svc.formatTime(outAt)], ['Hours in office', String(hours)]],
        sections: [['Work done today', report], ['Tasks worked on', taskLines.join('\n') || '—'],
          ['Blockers / help needed', str(p.blockers, 2000) || 'None'], ['Plan for tomorrow', str(p.plan, 2000) || '—'],
          ['Attachments', files.join('\n') || 'None']]
      });
    }
    var out = db.update('Attendance', rec.id, { checkOut: outAt, report: report, reportUrl: doc.url || '' });
    db.insert('DailyLogs', { id: svc.uuid(), date: rec.date, author: user.email, summary: report, hours: hours,
      blockers: str(p.blockers, 1000), createdAt: outAt });
    log(user.email, 'check_out', 'Checked out (' + svc.formatTime(outAt) + ') and submitted the daily report');
    return out;
  }
  function toIso(date, hhmm) {
    if (!hhmm) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hhmm)) throw err('Use a valid date and HH:MM time');
    return new Date(date + 'T' + hhmm + ':00' + LCM_TZ_OFFSET).toISOString();
  }
  // Admin correction: add or fix a member's entry/exit (e.g. forgot to check out).
  function saveAttendance(user, p) {
    requireAdmin(user);
    var email = lc(p.email), date = str(p.date, 10);
    if (!findUser(email)) throw err('Unknown member');
    var inIso = toIso(date, str(p.checkIn, 5)), outIso = toIso(date, str(p.checkOut, 5));
    if (!inIso) throw err('Entry time is required');
    if (outIso && outIso <= inIso) throw err('Exit time must be after entry time');
    var rec = db.all('Attendance').filter(function (r) { return r.date === date && lc(r.email) === email; })[0];
    var patch = { checkIn: inIso, checkOut: outIso, note: str(p.note, 300), editedBy: user.email };
    var saved = rec ? db.update('Attendance', rec.id, patch)
      : db.insert('Attendance', Object.assign({ id: svc.uuid(), date: date, email: email, createdAt: now() }, patch));
    log(user.email, 'attendance_edit', 'Set attendance for ' + email + ' on ' + date + ' (' + p.checkIn + '–' + (p.checkOut || '…') + ')');
    return saved;
  }
  function deleteAttendance(user, p) {
    requireAdmin(user);
    db.remove('Attendance', str(p.id, 64));
    log(user.email, 'attendance_edit', 'Removed an attendance entry');
    return { ok: true };
  }

  function addDailyLog(user, p) {
    var summary = str(p.summary, 3000);
    if (!summary) throw err('Write what you worked on');
    var d = { id: svc.uuid(), date: str(p.date, 10) || now().slice(0, 10), author: user.email, summary: summary,
      hours: Math.max(0, Math.min(24, num(p.hours, 0))), blockers: str(p.blockers, 1000), createdAt: now() };
    db.insert('DailyLogs', d);
    log(user.email, 'daily_log', 'Daily log for ' + d.date, '');
    return d;
  }

  function saveUser(user, p) {
    requireAdmin(user);
    var email = lc(p.email);
    if (!validEmail(email)) throw err('Enter a valid email');
    var role = p.role === 'admin' ? 'admin' : 'employee';
    var existing = findUser(email);
    if (existing) {
      if (lc(existing.email) === lc(user.email) && (role !== 'admin' || p.active === false)) throw err('You cannot remove your own admin access');
      var u = db.update('Users', existing.id, { name: str(p.name, 100) || existing.name, role: role,
        department: str(p.department, 80), active: p.active === undefined ? existing.active : bool(p.active) });
      log(user.email, 'user_updated', 'Updated ' + email);
      return publicUser(u);
    }
    var nu = { id: svc.uuid(), email: email, name: str(p.name, 100) || email.split('@')[0], role: role,
      department: str(p.department, 80), active: true, createdAt: now() };
    db.insert('Users', nu);
    log(user.email, 'user_added', 'Added ' + role + ' ' + email);
    return publicUser(nu);
  }

  // ---------- My Mind (private notes + mind tree) ----------
  var MIND_FIELDS = ['kind', 'parentId', 'title', 'body', 'status', 'links', 'tags', 'order', 'collapsed'];
  function hasMind(user) { return (svc.mindOwners || LCM_MIND_OWNERS).map(lc).indexOf(lc(user.email)) >= 0; }
  function requireMind(user) { if (!hasMind(user)) throw err('Not available for this account', 403); }
  function mindLoad(user) {
    requireMind(user);
    return { items: db.all('Mind').filter(function (r) { return lc(r.owner) === lc(user.email); }), serverNow: now() };
  }
  // Batch save: { upserts: [item...], deletes: [id...] }. Only touches the caller's own rows.
  function mindSync(user, p) {
    requireMind(user);
    var mine = {};
    db.all('Mind').forEach(function (r) { if (lc(r.owner) === lc(user.email)) mine[r.id] = r; else mine[r.id] = false; });
    var fresh = [], saved = 0;
    (Array.isArray(p.upserts) ? p.upserts : []).slice(0, 2000).forEach(function (it) {
      var id = str(it.id, 64);
      if (!id || mine[id] === false) return; // never overwrite someone else's row
      var row = { kind: it.kind === 'note' ? 'note' : 'node', parentId: str(it.parentId, 64), title: str(it.title, 300),
        body: str(it.body, 45000), status: str(it.status, 20), links: str(it.links, 4000), tags: str(it.tags, 500),
        order: num(it.order, 0), collapsed: bool(it.collapsed) ? 'true' : '', meta: str(it.meta, 6000), updatedAt: now() };
      if (mine[id]) { db.update('Mind', id, row); }
      else { row.id = id; row.owner = lc(user.email); row.createdAt = now(); fresh.push(row); mine[id] = row; }
      saved++;
    });
    if (fresh.length) { if (db.insertMany) db.insertMany('Mind', fresh); else fresh.forEach(function (r) { db.insert('Mind', r); }); }
    var dels = (Array.isArray(p.deletes) ? p.deletes : []).slice(0, 2000).filter(function (id) { return mine[id]; });
    if (dels.length > 3 && db.removeMany) db.removeMany('Mind', dels);
    else dels.forEach(function (id) { db.remove('Mind', id); });
    var removed = dels.length;
    // Mirror deadlines to Google Calendar (never blocks saving if Calendar fails)
    var cal = null;
    if (svc.calendarSync) {
      try {
        var fresh = mindLookup(user); // rows as just saved
        var changed = (Array.isArray(p.upserts) ? p.upserts : []).map(function (it) { return fresh[str(it.id, 64)]; }).filter(function (r) { return r && r.kind === 'node'; });
        cal = svc.calendarSync(lc(user.email), changed, dels, fresh, false);
      } catch (e) { cal = { error: String(e.message || e) }; }
    }
    return { saved: saved, removed: removed, calendar: cal, serverNow: now() };
  }

  function mindLookup(user) {
    var byId = {};
    db.all('Mind').forEach(function (r) { if (lc(r.owner) === lc(user.email)) byId[r.id] = r; });
    return byId;
  }
  // Full reconcile of every task with a deadline against Google Calendar.
  function mindCalSync(user) {
    requireMind(user);
    if (!svc.calendarSync) return { calendar: { mode: 'off' } };
    var all = mindLookup(user);
    var list = Object.keys(all).map(function (k) { return all[k]; }).filter(function (r) { return r.kind === 'node'; });
    return { calendar: svc.calendarSync(lc(user.email), list, [], all, true) };
  }

  var authed = {
    bootstrap: bootstrap, logout: logout, createTask: createTask, updateTask: updateTask, deleteTask: deleteTask,
    addRemark: addRemark, createProposal: createProposal, reviewProposal: reviewProposal,
    uploadFile: uploadFile, addDailyLog: addDailyLog, saveUser: saveUser,
    checkIn: checkIn, checkOut: checkOut, saveAttendance: saveAttendance, deleteAttendance: deleteAttendance,
    mindLoad: mindLoad, mindSync: mindSync, mindCalSync: mindCalSync
  };

  return {
    handle: function (action, payload, token) {
      payload = payload || {};
      if (action === 'requestOtp') return requestOtp(payload);
      if (action === 'verifyOtp') return verifyOtp(payload);
      if (action === 'ping') return { ok: true };
      var fn = authed[action];
      if (!fn) throw err('Unknown action: ' + action);
      var user = auth(token);
      var result = fn(user, payload, token);
      // Changes return the fresh dashboard data in the same reply, saving a second round trip.
      if (action === 'bootstrap' || action === 'logout' || action === 'uploadFile' || action.indexOf('mind') === 0) return result;
      return { result: result, state: bootstrap(user) };
    }
  };
}

if (typeof module !== 'undefined') module.exports = { LCMCore: LCMCore, LCM_TABLES: LCM_TABLES };
