/* LCM Work Portal — frontend (no build step). */
(function () {
  'use strict';

  var CFG = window.LCM_CONFIG || {};
  var API_URL = (CFG.API_URL || '').trim();
  var PREVIEW = !API_URL;
  var LOGO = '/assets/img/logo-uNv_1gp3.png';
  var STATUS_COLORS = { 'Not Started': '#8b93a7', 'In Progress': '#0077ff', 'Blocked': '#ef4444', 'In Review': '#f5a524', 'Completed': '#22c55e' };
  var PRIO_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  var AV_COLORS = ['#0077ff', '#7c3aed', '#0ea5a4', '#d97706', '#db2777', '#16a34a', '#2563eb', '#9333ea'];

  var S = {
    token: store('lcm_token'),
    data: null,
    view: store('lcm_view') || 'overview',
    taskView: store('lcm_taskview') || 'board',
    filters: { q: '', status: '', assignee: '', priority: '', scope: 'all' },
    sort: { key: 'dueDate', dir: 1 },
    openTask: null,
    drawerTab: 'updates',
    login: { step: 'email', email: '', role: 'employee', previewCode: '' }
  };

  // ---------- utils ----------
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((Date.parse(a) - Date.parse(b)) / 864e5); }
  function fmtDate(s) { if (!s) return '—'; var d = new Date(s.length === 10 ? s + 'T00:00:00' : s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  function ago(s) {
    var m = Math.round((Date.now() - Date.parse(s)) / 6e4);
    if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24); return d < 30 ? d + 'd ago' : fmtDate(s);
  }
  var TZ = 'Asia/Kolkata';
  var skew = 0; // server clock minus this device's clock, in ms
  function serverNow() { return new Date(Date.now() + skew); }
  function officeDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }) : '—'; }
  function hhmm(iso) { return iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : ''; }
  function durH(a, b) { return a ? Math.max(0, ((b ? Date.parse(b) : serverNow().getTime()) - Date.parse(a)) / 36e5) : 0; }
  function fmtDur(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + 'h ' + ('0' + (m % 60)).slice(-2) + 'm'; }
  function myToday() { var d = S.data.officeDate; return S.data.attendance.filter(function (r) { return r.date === d && r.email === S.data.me.email; })[0]; }
  function sKey(s) { return 's-' + String(s).replace(/\s/g, ''); }
  function pill(s) { return '<span class="pill ' + sKey(s) + '">' + esc(s) + '</span>'; }
  function prio(p) { return '<span class="prio p-' + esc(p) + '">' + esc(p) + '</span>'; }
  function isOverdue(t) { return t.dueDate && t.status !== 'Completed' && t.dueDate < today(); }
  function userBy(email) { email = String(email || '').toLowerCase(); return (S.data.users || []).filter(function (u) { return u.email === email; })[0]; }
  function nameOf(email) { var u = userBy(email); return u ? u.name : (email || 'Unassigned'); }
  function initials(n) { return String(n || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0].toUpperCase(); }).join(''); }
  function avColor(s) { var h = 0; String(s).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return AV_COLORS[h % AV_COLORS.length]; }
  function avatar(email, sm) { var n = nameOf(email); return '<span class="avatar' + (sm ? ' sm' : '') + '" style="background:' + avColor(email || n) + '" title="' + esc(n) + '">' + esc(initials(n)) + '</span>'; }
  function isAdmin() { return S.data && S.data.me.role === 'admin'; }
  function fmtSize(b) { b = +b || 0; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, kind === 'err' ? 6000 : 3500);
  }
  var ICONS = {
    overview: '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
    tasks: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    daily: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    approvals: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    files: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  };
  function icon(n, size) { return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[n] + '</svg>'; }

  // ---------- API ----------
  var preview = PREVIEW ? previewBackend() : null;
  function api(action, payload) {
    if (PREVIEW) {
      return new Promise(function (res, rej) {
        setTimeout(function () {
          try { res(JSON.parse(JSON.stringify(preview.handle(action, payload, S.token)))); } catch (e) { rej(e); }
        }, 120);
      }).catch(handleErr);
    }
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {}, token: S.token })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error); e.code = j.code; throw e; }
      return j.data;
    }).catch(handleErr);
  }
  function handleErr(e) {
    if (e.code === 401 && S.token && S.data) { signOut(true); }
    if (e instanceof TypeError) e.message = 'Could not reach the server. Check your connection.';
    throw e;
  }
  function refresh(silent) {
    return api('bootstrap').then(function (d) {
      if (d.serverNow) skew = Date.parse(d.serverNow) - Date.now();
      d.officeDate = officeDay(serverNow());
      d.attendance = d.attendance || [];
      S.data = d;
      render();
    }).catch(function (e) { if (!silent) toast(e.message, 'err'); });
  }
  function act(action, payload, okMsg) {
    return api(action, payload).then(function (r) {
      if (okMsg) toast(okMsg, 'ok');
      return refresh(true).then(function () { return r; });
    }).catch(function (e) { toast(e.message, 'err'); throw e; });
  }

  // ---------- Preview backend (browser only) ----------
  function previewBackend() {
    var KEY = 'lcm_preview_db_v1';
    var mem;
    try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; }
    var cache = {};
    function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} }
    function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
    function hash(s) { var h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16); }
    if (!mem) { mem = {}; Object.keys(LCM_TABLES).forEach(function (t) { mem[t] = []; }); seed(); save(); }
    Object.keys(LCM_TABLES).forEach(function (t) { if (!mem[t]) mem[t] = []; });
    var db = {
      all: function (t) { return (mem[t] || []).map(function (r) { return Object.assign({}, r); }); },
      insert: function (t, o) { mem[t].push(Object.assign({}, o)); save(); return o; },
      update: function (t, i, p) { var r = mem[t].filter(function (x) { return x.id === i; })[0]; if (!r) throw new Error('not found'); Object.assign(r, p); save(); return Object.assign({}, r); },
      remove: function (t, i) { mem[t] = mem[t].filter(function (x) { return x.id !== i; }); save(); }
    };
    var svc = {
      adminEmails: ['admin@lcmev.com'], exposeOtp: true,
      now: function () { return new Date().toISOString(); }, uuid: id, random: Math.random, hash: hash,
      officeDate: function () { return officeDay(new Date()); },
      formatTime: function (iso) { return fmtTime(iso); },
      cacheGet: function (k) { var c = cache[k]; return c && c.exp > Date.now() ? c.v : null; },
      cachePut: function (k, v, s) { cache[k] = { v: v, exp: Date.now() + s * 1000 }; },
      cacheRemove: function (k) { delete cache[k]; },
      sendOtp: function () {}, notifyAdmins: function () {},
      saveFile: function () { return { id: 'preview', url: '' }; },
      saveReport: function () { return { id: 'preview', url: '' }; },
      folderUrl: function () { return 'https://drive.google.com/drive/folders/18lrhR09L3AlYDWeyz-_rzVeVPClLZl4i'; }
    };
    function seed() {
      var now = Date.now();
      function d(off) { return new Date(now + off * 864e5).toISOString().slice(0, 10); }
      function ts(off) { return new Date(now + off * 864e5).toISOString(); }
      var people = [
        ['admin@lcmev.com', 'Admin', 'admin', 'Management'],
        ['wesly@lcmev.com', 'Wesly J', 'employee', 'Electronics'],
        ['jayshri@lcmev.com', 'Jayshri Bej', 'employee', 'Design'],
        ['chethan@lcmev.com', 'Chethan Ashray', 'employee', 'Mechanical'],
        ['naveen@lcmev.com', 'Naveen Islavath', 'employee', 'Manufacturing']
      ];
      people.forEach(function (p) { mem.Users.push({ id: id(), email: p[0], name: p[1], role: p[2], department: p[3], active: true, createdAt: ts(-30) }); });
      var tasks = [
        ['MPPT controller PCB rev B', 'wesly@lcmev.com', 'High', 'In Progress', 60, 'Electronics', -6, 4],
        ['Gearset torque test on bench', 'chethan@lcmev.com', 'Critical', 'Blocked', 30, 'Testing', -5, 1],
        ['Investor deck visual refresh', 'jayshri@lcmev.com', 'Medium', 'In Review', 90, 'Design', -4, 2],
        ['Generator housing CAD v3', 'chethan@lcmev.com', 'High', 'Not Started', 0, 'Mechanical', 1, 9],
        ['Vendor quotes for propeller castings', 'naveen@lcmev.com', 'Medium', 'Completed', 100, 'Procurement', -10, -3],
        ['Battery charge-rate logging script', 'wesly@lcmev.com', 'Medium', 'Completed', 100, 'Software', -9, -2],
        ['Assembly SOP draft', 'naveen@lcmev.com', 'Low', 'In Progress', 40, 'Manufacturing', -2, 6],
        ['Website team page photos', 'jayshri@lcmev.com', 'Low', 'Not Started', 0, 'Design', 0, -1]
      ];
      tasks.forEach(function (t, i) {
        var done = t[3] === 'Completed';
        mem.Tasks.push({ id: 't' + i, title: t[0], description: 'Owner to post progress remarks and any files here.', method: '', assignee: t[1], priority: t[2], status: t[3], progress: t[4],
          category: t[5], startDate: d(t[6]), dueDate: d(t[7]), isDaily: false, createdBy: 'admin@lcmev.com', createdAt: ts(t[6]), updatedAt: ts(-1), completedAt: done ? ts(t[7]) : '' });
        mem.Activity.push({ id: id(), actor: 'admin@lcmev.com', action: 'task_created', detail: 'Created: ' + t[0] + ' → ' + t[1], taskId: 't' + i, createdAt: ts(t[6]) });
      });
      mem.Tasks.push({ id: 'td', title: 'Daily: bench safety checklist', description: 'Complete the checklist before powering the test rig.', method: '', assignee: 'chethan@lcmev.com', priority: 'Medium', status: 'Not Started', progress: 0, category: 'Daily', startDate: d(0), dueDate: d(0), isDaily: true, createdBy: 'admin@lcmev.com', createdAt: ts(0), updatedAt: ts(0), completedAt: '' });
      mem.Remarks.push({ id: id(), taskId: 't1', author: 'chethan@lcmev.com', text: 'Waiting on load cell calibration from vendor. Bench is assembled.', statusFrom: 'In Progress', statusTo: 'Blocked', progress: 30, createdAt: ts(-1) });
      mem.Remarks.push({ id: id(), taskId: 't0', author: 'wesly@lcmev.com', text: 'Layout done; routing the high-current traces now.', statusFrom: '', statusTo: '', progress: 60, createdAt: ts(-0.3) });
      mem.Proposals.push({ id: id(), taskId: 't1', author: 'chethan@lcmev.com', title: 'Use dynamometer at partner lab', approach: 'Run the torque test on the partner lab dynamometer this week instead of waiting for our own load cell.', reason: 'Unblocks testing ~10 days earlier.', status: 'Pending', adminNote: '', reviewedBy: '', reviewedAt: '', createdAt: ts(-0.5) });
      [[-1, 'wesly@lcmev.com', 'Routed MPPT power stage, DRC clean.'], [-1, 'naveen@lcmev.com', 'Drafted SOP sections 1–3.']].forEach(function (l) {
        mem.DailyLogs.push({ id: id(), date: d(l[0]), author: l[1], summary: l[2], hours: 7, blockers: '', createdAt: ts(l[0]) });
      });
      mem.Activity.push({ id: id(), actor: 'chethan@lcmev.com', action: 'status', detail: 'Gearset torque test on bench: In Progress → Blocked', taskId: 't1', createdAt: ts(-1) });
      mem.Activity.push({ id: id(), actor: 'chethan@lcmev.com', action: 'proposal', detail: 'Proposed a new method for "Gearset torque test on bench"', taskId: 't1', createdAt: ts(-0.5) });
    }
    return LCMCore(db, svc);
  }

  // ---------- Auth ----------
  function signOut(expired) {
    if (S.token && !expired) api('logout').catch(function () {});
    S.token = null; S.data = null; store('lcm_token', null);
    S.login = { step: 'email', email: '', role: S.login.role, previewCode: '' };
    if (expired) toast('Session expired. Please sign in again.', 'err');
    render();
  }

  function renderLogin() {
    var L = S.login;
    var html = '<div class="login-wrap"><div class="login-card">' +
      '<div class="brand"><img src="' + LOGO + '" alt="LCM"><div><b style="font-family:Montserrat">LCM Work Portal</b><div class="small muted">Loop Charging Module</div></div></div>';
    if (L.step === 'email') {
      html += '<h1>Sign in</h1><p class="muted small" style="margin:0">We\'ll email you a one-time 6-digit code. No password needed.</p>' +
        '<div class="role-switch"><button data-role="employee" class="' + (L.role === 'employee' ? 'on' : '') + '">Employee</button><button data-role="admin" class="' + (L.role === 'admin' ? 'on' : '') + '">Admin</button></div>' +
        '<form id="emailForm"><label class="field"><span>' + (L.role === 'admin' ? 'Admin' : 'Work') + ' email</span><input class="input" type="email" name="email" required autocomplete="email" placeholder="you@company.com" value="' + esc(L.email) + '"></label>' +
        '<button class="btn primary" type="submit">Send code</button></form>' +
        (PREVIEW ? '<div class="preview-code">Preview mode: try <b>admin@lcmev.com</b> (admin) or <b>wesly@lcmev.com</b> (employee). The code will appear here instead of by email.</div>' : '');
    } else {
      html += '<h1>Check your email</h1><p class="muted small" style="margin:0">Enter the code sent to <b style="color:#fff">' + esc(L.email) + '</b></p>' +
        '<form id="otpForm" style="margin-top:20px"><div class="otp">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<input class="input" inputmode="numeric" autocomplete="' + (i ? 'off' : 'one-time-code') + '" aria-label="Digit ' + (i + 1) + '">'; }).join('') + '</div>' +
        '<button class="btn primary" type="submit">Verify &amp; sign in</button></form>' +
        '<div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn ghost sm" id="changeEmail">← Change email</button><button class="btn ghost sm" id="resend">Resend code</button></div>' +
        (L.previewCode ? '<div class="preview-code">Preview mode code: <b style="letter-spacing:3px">' + esc(L.previewCode) + '</b></div>' : '');
    }
    html += '<a class="back-link" href="/">← Back to lcmev.com</a></div></div>';
    $('#app').innerHTML = (PREVIEW ? previewBanner() : '') + html;

    $$('.role-switch button').forEach(function (b) { b.onclick = function () { L.role = b.dataset.role; renderLogin(); }; });
    var ef = $('#emailForm');
    if (ef) {
      ef.email.focus();
      ef.onsubmit = function (e) { e.preventDefault(); sendCode(ef.email.value, ef.querySelector('button')); };
    }
    var of = $('#otpForm');
    if (of) {
      var boxes = $$('.otp input');
      boxes[0].focus();
      boxes.forEach(function (inp, i) {
        inp.addEventListener('input', function () {
          var v = inp.value.replace(/\D/g, '');
          if (v.length > 1) { v.split('').slice(0, 6 - i).forEach(function (c, j) { boxes[i + j].value = c; }); (boxes[Math.min(5, i + v.length)]).focus(); }
          else { inp.value = v; if (v && i < 5) boxes[i + 1].focus(); }
          if (boxes.every(function (b) { return b.value; })) of.requestSubmit();
        });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !inp.value && i) boxes[i - 1].focus(); });
        inp.addEventListener('paste', function (e) {
          var t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
          if (t.length) { e.preventDefault(); t.split('').forEach(function (c, j) { if (boxes[j]) boxes[j].value = c; }); if (t.length === 6) of.requestSubmit(); }
        });
      });
      of.onsubmit = function (e) {
        e.preventDefault();
        var code = boxes.map(function (b) { return b.value; }).join('');
        if (code.length !== 6) return toast('Enter all 6 digits', 'err');
        var btn = of.querySelector('button'); btn.disabled = true; btn.textContent = 'Verifying…';
        api('verifyOtp', { email: L.email, code: code }).then(function (r) {
          S.token = r.token; store('lcm_token', r.token);
          if (L.role === 'admin' && r.user.role !== 'admin') toast('Signed in. This account has employee access.', 'ok');
          else toast('Welcome, ' + r.user.name, 'ok');
          S.view = 'overview';
          return refresh();
        }).catch(function (e2) {
          toast(e2.message, 'err'); btn.disabled = false; btn.textContent = 'Verify & sign in';
          boxes.forEach(function (b) { b.value = ''; }); boxes[0].focus();
        });
      };
      $('#changeEmail').onclick = function () { L.step = 'email'; L.previewCode = ''; renderLogin(); };
      $('#resend').onclick = function () { sendCode(L.email, $('#resend')); };
    }
  }
  function sendCode(email, btn) {
    btn.disabled = true;
    api('requestOtp', { email: email }).then(function (r) {
      S.login.email = email.trim().toLowerCase(); S.login.step = 'code'; S.login.previewCode = r.previewCode || '';
      toast(r.message, 'ok'); renderLogin();
    }).catch(function (e) { toast(e.message, 'err'); btn.disabled = false; });
  }
  function previewBanner() {
    return '<div class="banner">Preview mode — the backend isn\'t connected yet, so data is stored only in this browser. See <b>portal/SETUP.md</b> to go live.</div>';
  }

  // ---------- Shell ----------
  function navItems() {
    var d = S.data, a = isAdmin();
    var pending = d.proposals.filter(function (p) { return p.status === 'Pending'; }).length;
    return [
      ['overview', 'Overview', 'overview'],
      ['tasks', a ? 'All Tasks' : 'My Tasks', 'tasks'],
      ['attendance', 'Attendance', 'clock'],
      ['daily', 'Daily Works', 'daily'],
      ['approvals', a ? 'Approvals' : 'Method Changes', 'approvals', a ? pending : 0],
      a ? ['team', 'Team', 'team'] : null,
      ['files', 'Files', 'files'],
      ['activity', 'Activity', 'activity']
    ].filter(Boolean);
  }
  var TITLES = { attendance: 'Attendance', overview: 'Overview', tasks: 'Tasks', daily: 'Daily Works', approvals: 'Approvals', team: 'Team', files: 'Files', activity: 'Activity' };

  function render() {
    if (!S.token) return renderLogin();
    if (!S.data) { $('#app').innerHTML = '<div class="boot">Loading your workspace…</div>'; return; }
    if (S.view === 'team' && !isAdmin()) S.view = 'overview';
    var me = S.data.me;
    var html = (PREVIEW ? previewBanner() : '') + '<div class="shell"><aside class="side" id="side">' +
      '<div class="logo"><img src="' + LOGO + '" alt=""><b>Work Portal</b></div><nav class="nav">' +
      navItems().map(function (n) {
        return '<button data-view="' + n[0] + '" class="' + (S.view === n[0] ? 'on' : '') + '">' + icon(n[2]) + esc(n[1]) + (n[3] ? '<span class="count">' + n[3] + '</span>' : '') + '</button>';
      }).join('') +
      '<button onclick="location.href=\'/\'">' + icon('home') + 'Website</button>' +
      '</nav><div class="me">' + avatar(me.email) + '<div style="min-width:0;flex:1"><div class="small" style="font-weight:600;overflow:hidden;text-overflow:ellipsis">' + esc(me.name) + '</div><span class="role-tag">' + esc(me.role) + '</span></div>' +
      '<button class="btn ghost sm" id="logout" title="Sign out">' + icon('logout', 16) + '</button></div></aside>' +
      '<div class="overlay hidden" id="sideOverlay" style="z-index:24"></div>' +
      '<main class="main"><div class="top"><button class="btn ghost sm menu-btn" id="menuBtn">' + icon('menu') + '</button><h2>' + TITLES[S.view] + '</h2><span class="spacer"></span>' +
      attendanceButton() +
      '<button class="btn ghost sm" id="refreshBtn" title="Refresh">' + icon('refresh', 16) + '</button>' +
      (isAdmin() ? '<button class="btn primary sm" id="newTaskBtn">' + icon('plus', 16) + '<span class="hide-sm">New task</span></button>' : '') +
      '</div><div class="content" id="content"></div></main></div>';
    $('#app').innerHTML = html;
    $$('.nav button[data-view]').forEach(function (b) { b.onclick = function () { S.view = b.dataset.view; store('lcm_view', S.view); closeSide(); render(); window.scrollTo(0, 0); }; });
    $('#logout').onclick = function () { signOut(); };
    $('#refreshBtn').onclick = function () { refresh().then(function () { toast('Up to date', 'ok'); }); };
    $('#menuBtn').onclick = function () { $('#side').classList.add('open'); $('#sideOverlay').classList.remove('hidden'); };
    $('#sideOverlay').onclick = closeSide;
    if ($('#newTaskBtn')) $('#newTaskBtn').onclick = function () { taskForm(); };
    bindAttendanceButtons(document);
    var c = $('#content');
    ({ attendance: viewAttendance, overview: viewOverview, tasks: viewTasks, daily: viewDaily, approvals: viewApprovals, team: viewTeam, files: viewFiles, activity: viewActivity })[S.view](c);
    if (S.openTask) renderDrawer();
  }
  function closeSide() { var s = $('#side'); if (s) s.classList.remove('open'); var o = $('#sideOverlay'); if (o) o.classList.add('hidden'); }

  // ---------- Charts (SVG) ----------
  function donut(parts, size) {
    size = size || 150;
    var total = parts.reduce(function (s, p) { return s + p.v; }, 0);
    var r = size / 2 - 12, c = 2 * Math.PI * r, off = 0;
    var segs = total ? parts.filter(function (p) { return p.v; }).map(function (p) {
      var len = p.v / total * c;
      var s = '<circle r="' + r + '" cx="' + size / 2 + '" cy="' + size / 2 + '" fill="none" stroke="' + p.c + '" stroke-width="16" stroke-dasharray="' + Math.max(0, len - 2) + ' ' + (c - len + 2) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"><title>' + esc(p.l) + ': ' + p.v + '</title></circle>';
      off += len; return s;
    }).join('') : '<circle r="' + r + '" cx="' + size / 2 + '" cy="' + size / 2 + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="16"/>';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' + segs +
      '<text x="50%" y="48%" text-anchor="middle" style="font-size:26px;font-weight:700;fill:#fff;font-family:Montserrat">' + total + '</text>' +
      '<text x="50%" y="63%" text-anchor="middle">tasks</text></svg>';
  }
  function ring(pct, size, color) {
    size = size || 90; var r = size / 2 - 7, c = 2 * Math.PI * r;
    return '<span class="ring"><svg width="' + size + '" height="' + size + '"><circle r="' + r + '" cx="' + size / 2 + '" cy="' + size / 2 + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>' +
      '<circle r="' + r + '" cx="' + size / 2 + '" cy="' + size / 2 + '" fill="none" stroke="' + (color || '#22c55e') + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (pct / 100 * c) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg><b>' + pct + '%</b></span>';
  }
  function trendChart(tasks, days) {
    days = days || 14;
    var W = 520, H = 170, P = { l: 28, r: 10, t: 12, b: 24 };
    var labels = [], done = [], created = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 864e5); var k = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      labels.push(k);
      done.push(tasks.filter(function (t) { return t.completedAt && localDay(t.completedAt) === k; }).length);
      created.push(tasks.filter(function (t) { return t.createdAt && localDay(t.createdAt) === k; }).length);
    }
    var max = Math.max(2, Math.max.apply(null, done.concat(created)));
    var x = function (i) { return P.l + i * (W - P.l - P.r) / (days - 1); };
    var y = function (v) { return H - P.b - v / max * (H - P.t - P.b); };
    var line = function (arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' '); };
    var grid = '';
    for (var g = 0; g <= max; g += Math.ceil(max / 4)) grid += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="rgba(255,255,255,.06)"/><text x="' + (P.l - 8) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + '</text>';
    var xl = labels.map(function (l, i) { return i % 3 === (days - 1) % 3 ? '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtDate(l) + '</text>' : ''; }).join('');
    var area = line(done) + ' L' + x(days - 1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z';
    var dots = done.map(function (v, i) { return '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="#22c55e"><title>' + fmtDate(labels[i]) + ': ' + v + ' completed, ' + created[i] + ' created</title></circle>'; }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="none" style="display:block">' +
      '<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".3"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>' +
      grid + xl + '<path d="' + area + '" fill="url(#ga)"/><path d="' + line(created) + '" fill="none" stroke="#0077ff" stroke-width="2" stroke-dasharray="4 4"/>' +
      '<path d="' + line(done) + '" fill="none" stroke="#22c55e" stroke-width="2.5"/>' + dots + '</svg>' +
      '<div class="legend"><span><i style="background:#22c55e"></i>Completed</span><span><i style="background:#0077ff"></i>Created</span></div>';
  }
  function localDay(iso) { var d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function statusLegend() { return '<div class="legend">' + S.data.statuses.map(function (s) { return '<span><i style="background:' + STATUS_COLORS[s] + '"></i>' + s + '</span>'; }).join('') + '</div>'; }
  function workload(tasks) {
    var people = S.data.users.filter(function (u) { return u.active; });
    var rows = people.map(function (u) {
      var mine = tasks.filter(function (t) { return t.assignee === u.email; });
      return { u: u, mine: mine };
    }).filter(function (r) { return r.mine.length || r.u.role === 'employee'; }).sort(function (a, b) { return b.mine.length - a.mine.length; });
    var max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.mine.length; })));
    if (!rows.length) return '<div class="empty">No employees yet</div>';
    return rows.map(function (r) {
      var segs = S.data.statuses.map(function (s) {
        var n = r.mine.filter(function (t) { return t.status === s; }).length;
        return n ? '<span style="width:' + (n / max * 100) + '%;background:' + STATUS_COLORS[s] + '" title="' + s + ': ' + n + '"></span>' : '';
      }).join('');
      return '<div class="bar-row"><span class="name row">' + avatar(r.u.email, true) + '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(r.u.name) + '</span></span><div class="stack">' + segs + '</div><span class="dim small" style="text-align:right">' + r.mine.length + '</span></div>';
    }).join('') + statusLegend();
  }

  // ---------- Overview ----------
  function viewOverview(c) {
    var d = S.data, tasks = d.tasks, t0 = today();
    var open = tasks.filter(function (t) { return t.status !== 'Completed'; });
    var overdue = open.filter(isOverdue);
    var doneWeek = tasks.filter(function (t) { return t.completedAt && Date.now() - Date.parse(t.completedAt) < 7 * 864e5; });
    var pending = d.proposals.filter(function (p) { return p.status === 'Pending'; });
    var rate = tasks.length ? Math.round(tasks.filter(function (t) { return t.status === 'Completed'; }).length / tasks.length * 100) : 0;
    var avgProg = open.length ? Math.round(open.reduce(function (s, t) { return s + (+t.progress || 0); }, 0) / open.length) : 0;
    var dueToday = open.filter(function (t) { return t.dueDate === t0; });
    var kpis = [
      ['Total tasks', tasks.length, (d.tasks.filter(function (t) { return t.isDaily && t.startDate === t0; }).length) + ' daily works today', '#0077ff'],
      ['In progress', tasks.filter(function (t) { return t.status === 'In Progress'; }).length, 'avg ' + avgProg + '% done on open work', '#3b95ff'],
      ['Completed (7d)', doneWeek.length, rate + '% overall completion', '#22c55e'],
      ['Overdue', overdue.length, dueToday.length + ' due today', '#ef4444'],
      ['Blocked', tasks.filter(function (t) { return t.status === 'Blocked'; }).length, 'needs attention', '#f97316'],
      [isAdmin() ? 'Pending approvals' : 'My proposals', isAdmin() ? pending.length : d.proposals.length, isAdmin() ? 'method changes to review' : pending.length + ' awaiting review', '#f5a524']
    ];
    var html = '';
    if (overdue.length) html += '<div class="alert red">' + icon('alert') + '<span><b>' + overdue.length + ' overdue task' + (overdue.length > 1 ? 's' : '') + ':</b> ' + overdue.slice(0, 3).map(function (t) { return esc(t.title); }).join(', ') + (overdue.length > 3 ? '…' : '') + '</span></div>';
    if (isAdmin() && pending.length) html += '<div class="alert amber">' + icon('approvals') + '<span><b>' + pending.length + ' method change' + (pending.length > 1 ? 's' : '') + '</b> waiting for your approval. <a href="#" data-go="approvals">Review now →</a></span></div>';
    html += '<div class="kpis">' + kpis.map(function (k) { return '<div class="kpi" style="--accent:' + k[3] + '"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div><div class="sub">' + k[2] + '</div></div>'; }).join('') + '</div>';
    var parts = d.statuses.map(function (s) { return { l: s, v: tasks.filter(function (t) { return t.status === s; }).length, c: STATUS_COLORS[s] }; });
    html += '<div class="grid g-3">' +
      '<div class="card"><h3>Status breakdown</h3><div class="donut-wrap">' + donut(parts) + '<div class="legend">' + parts.map(function (p) { return '<span><i style="background:' + p.c + '"></i>' + p.l + '<b>' + p.v + '</b></span>'; }).join('') + '</div></div></div>' +
      '<div class="card"><h3>Throughput — last 14 days</h3>' + trendChart(tasks) + '</div>' +
      (isAdmin() ? '<div class="card"><h3>Team workload</h3>' + workload(tasks) + '</div>'
        : '<div class="card"><h3>My completion</h3><div class="row" style="gap:24px">' + ring(rate, 110) + '<div class="small">' + d.priorities.slice().reverse().map(function (p) { var n = open.filter(function (t) { return t.priority === p; }).length; return '<div class="row" style="margin-bottom:8px">' + prio(p) + '<span class="muted">' + n + ' open</span></div>'; }).join('') + '</div></div></div>') +
      '</div>';
    var upcoming = open.filter(function (t) { return t.dueDate; }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; }).slice(0, 8);
    html += '<div class="grid g-2"><div class="card"><h3>Upcoming deadlines<span class="spacer"></span><a href="#" class="small" data-go="tasks">View all →</a></h3><div class="scroll">' +
      (upcoming.length ? upcoming.map(function (t) {
        var dd = dayDiff(t.dueDate, t0);
        var when = dd < 0 ? '<span class="overdue small nowrap">' + (-dd) + 'd overdue</span>' : dd === 0 ? '<span class="small nowrap" style="color:#ffc35c">Due today</span>' : '<span class="small muted nowrap">in ' + dd + 'd</span>';
        return '<div class="list-item" data-task="' + t.id + '">' + avatar(t.assignee, true) + '<div style="flex:1;min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.title) + '</div><div class="progress" style="margin-top:6px;max-width:220px"><span style="width:' + (+t.progress || 0) + '%"></span></div></div>' + pill(t.status) + when + '</div>';
      }).join('') : '<div class="empty">Nothing due. 🎉</div>') + '</div></div>' +
      '<div class="card"><h3>Recent activity<span class="spacer"></span><a href="#" class="small" data-go="activity">All →</a></h3><div class="scroll">' + feed(d.activity.slice(-12).reverse()) + '</div></div></div>';
    c.innerHTML = html;
    bindCommon(c);
  }

  var ACT_ICON = { check_in: '🟢', check_out: '🔴', attendance_edit: '🕒', login: '🔑', task_created: '📝', task_assigned: '👤', status: '🔄', remark: '💬', proposal: '💡', proposal_approved: '✅', proposal_rejected: '❌', upload: '📎', daily_log: '🗓️', daily_work: '📌', user_added: '➕', user_updated: '✏️', task_deleted: '🗑️' };
  function feed(items) {
    items = items.filter(function (a) { return a.action !== 'login'; });
    if (!items.length) return '<div class="empty">No activity yet</div>';
    return '<ul class="feed">' + items.map(function (a) {
      return '<li' + (a.taskId ? ' data-task="' + esc(a.taskId) + '" style="cursor:pointer"' : '') + '><span class="ico">' + (ACT_ICON[a.action] || '•') + '</span><div style="min-width:0"><div><b>' + esc(nameOf(a.actor)) + '</b> <span class="muted">' + esc(a.detail) + '</span></div><div class="when">' + ago(a.createdAt) + '</div></div></li>';
    }).join('') + '</ul>';
  }
  function bindCommon(root) {
    $$('[data-task]', root).forEach(function (el) { el.addEventListener('click', function (e) { if (e.target.closest('a,button,select,input')) return; openTask(el.dataset.task); }); });
    $$('[data-go]', root).forEach(function (el) { el.addEventListener('click', function (e) { e.preventDefault(); S.view = el.dataset.go; store('lcm_view', S.view); render(); }); });
  }

  // ---------- Tasks ----------
  function filteredTasks() {
    var f = S.filters, q = f.q.toLowerCase();
    return S.data.tasks.filter(function (t) {
      if (f.status && t.status !== f.status) return false;
      if (f.assignee && t.assignee !== f.assignee) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.scope === 'overdue' && !isOverdue(t)) return false;
      if (f.scope === 'daily' && !t.isDaily) return false;
      if (q && (t.title + ' ' + t.description + ' ' + t.category + ' ' + nameOf(t.assignee)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function viewTasks(c) {
    var d = S.data, f = S.filters;
    var opt = function (arr, cur, all) { return '<option value="">' + all + '</option>' + arr.map(function (x) { var v = x.v != null ? x.v : x, l = x.l || x; return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); };
    c.innerHTML = '<div class="toolbar">' +
      '<input class="input search" id="fq" placeholder="Search tasks…" value="' + esc(f.q) + '">' +
      '<select class="input" id="fs">' + opt(d.statuses, f.status, 'All statuses') + '</select>' +
      (isAdmin() ? '<select class="input" id="fa">' + opt(d.users.map(function (u) { return { v: u.email, l: u.name }; }), f.assignee, 'Everyone') + '</select>' : '') +
      '<select class="input" id="fp">' + opt(d.priorities, f.priority, 'Any priority') + '</select>' +
      '<select class="input" id="fx"><option value="all">All tasks</option><option value="overdue"' + (f.scope === 'overdue' ? ' selected' : '') + '>Overdue only</option><option value="daily"' + (f.scope === 'daily' ? ' selected' : '') + '>Daily works</option></select>' +
      '<span class="spacer"></span><div class="seg">' + ['board', 'list', 'timeline'].map(function (v) { return '<button data-tv="' + v + '" class="' + (S.taskView === v ? 'on' : '') + '">' + v[0].toUpperCase() + v.slice(1) + '</button>'; }).join('') + '</div>' +
      '<button class="btn sm" id="csv">' + icon('download', 15) + ' CSV</button></div><div id="tv"></div>';
    var bindF = function (id, key) { var el = $(id); if (el) el.addEventListener(id === '#fq' ? 'input' : 'change', function () { f[key] = el.value; drawTasks(); }); };
    bindF('#fq', 'q'); bindF('#fs', 'status'); bindF('#fa', 'assignee'); bindF('#fp', 'priority'); bindF('#fx', 'scope');
    $$('[data-tv]').forEach(function (b) { b.onclick = function () { S.taskView = b.dataset.tv; store('lcm_taskview', S.taskView); $$('[data-tv]').forEach(function (x) { x.classList.toggle('on', x === b); }); drawTasks(); }; });
    $('#csv').onclick = exportCsv;
    drawTasks();
  }
  function drawTasks() {
    var el = $('#tv'); if (!el) return;
    var tasks = filteredTasks();
    ({ board: drawBoard, list: drawList, timeline: drawTimeline })[S.taskView](el, tasks);
    bindCommon(el);
  }
  function taskCard(t) {
    var dd = t.dueDate ? dayDiff(t.dueDate, today()) : null;
    return '<div class="tcard" draggable="true" data-task="' + t.id + '"><div class="row">' + prio(t.priority) + (t.isDaily ? '<span class="tag">Daily</span>' : '') + (t.category ? '<span class="tag">' + esc(t.category) + '</span>' : '') + '</div>' +
      '<div class="t">' + esc(t.title) + '</div>' +
      '<div class="progress" style="margin-bottom:10px"><span style="width:' + (+t.progress || 0) + '%;background:' + STATUS_COLORS[t.status] + '"></span></div>' +
      '<div class="meta">' + avatar(t.assignee, true) + '<span>' + (+t.progress || 0) + '%</span><span class="spacer"></span>' +
      (t.dueDate ? '<span class="' + (isOverdue(t) ? 'overdue' : '') + '">' + (dd === 0 ? 'Today' : fmtDate(t.dueDate)) + '</span>' : '') + '</div></div>';
  }
  function drawBoard(el, tasks) {
    el.innerHTML = '<div class="board">' + S.data.statuses.map(function (s) {
      var col = tasks.filter(function (t) { return t.status === s; }).sort(function (a, b) { return PRIO_RANK[a.priority] - PRIO_RANK[b.priority]; });
      return '<div class="col" data-status="' + s + '"><div class="col-head"><span style="width:8px;height:8px;border-radius:50%;background:' + STATUS_COLORS[s] + '"></span>' + s + '<span class="n">' + col.length + '</span></div>' + col.map(taskCard).join('') + '</div>';
    }).join('') + '</div>';
    var dragId = null;
    $$('.tcard', el).forEach(function (card) {
      card.addEventListener('dragstart', function (e) { dragId = card.dataset.task; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    });
    $$('.col', el).forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', function () { col.classList.remove('drop'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('drop');
        var id = dragId || e.dataTransfer.getData('text/plain');
        var t = S.data.tasks.filter(function (x) { return x.id === id; })[0];
        if (t && t.status !== col.dataset.status) {
          t.status = col.dataset.status; drawTasks();
          act('updateTask', { id: id, status: col.dataset.status }, 'Moved to ' + col.dataset.status);
        }
      });
    });
  }
  function drawList(el, tasks) {
    var k = S.sort.key, dir = S.sort.dir;
    tasks = tasks.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (k === 'priority') { av = PRIO_RANK[av]; bv = PRIO_RANK[bv]; }
      if (k === 'progress') { av = +av; bv = +bv; }
      if (k === 'assignee') { av = nameOf(av); bv = nameOf(bv); }
      if (!av && av !== 0) return 1; if (!bv && bv !== 0) return -1;
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
    });
    var cols = [['title', 'Task'], ['assignee', 'Assignee'], ['status', 'Status'], ['priority', 'Priority'], ['progress', 'Progress'], ['dueDate', 'Due'], ['updatedAt', 'Updated']];
    el.innerHTML = '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th class="sort" data-k="' + c[0] + '">' + c[1] + (k === c[0] ? (dir > 0 ? ' ↑' : ' ↓') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (tasks.length ? tasks.map(function (t) {
        return '<tr class="click" data-task="' + t.id + '"><td><div style="font-weight:600">' + esc(t.title) + '</div><div class="small dim">' + esc(t.category || '') + (t.isDaily ? ' · Daily' : '') + '</div></td>' +
          '<td><span class="row">' + avatar(t.assignee, true) + '<span class="small">' + esc(nameOf(t.assignee)) + '</span></span></td><td>' + pill(t.status) + '</td><td>' + prio(t.priority) + '</td>' +
          '<td><div class="row"><div class="progress" style="flex:1"><span style="width:' + (+t.progress || 0) + '%"></span></div><span class="small dim">' + (+t.progress || 0) + '%</span></div></td>' +
          '<td class="nowrap ' + (isOverdue(t) ? 'overdue' : '') + '">' + fmtDate(t.dueDate) + '</td><td class="small dim nowrap">' + ago(t.updatedAt) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">No tasks match these filters</td></tr>') + '</tbody></table></div>';
    $$('th.sort', el).forEach(function (th) { th.onclick = function () { if (S.sort.key === th.dataset.k) S.sort.dir *= -1; else { S.sort.key = th.dataset.k; S.sort.dir = 1; } drawTasks(); }; });
  }
  function drawTimeline(el, tasks) {
    tasks = tasks.filter(function (t) { return t.startDate || t.dueDate; }).sort(function (a, b) { return (a.startDate || a.dueDate) < (b.startDate || b.dueDate) ? -1 : 1; });
    if (!tasks.length) { el.innerHTML = '<div class="card empty">No dated tasks to show</div>'; return; }
    var t0 = today();
    var min = tasks.reduce(function (m, t) { var s = t.startDate || t.dueDate; return s < m ? s : m; }, t0);
    var max = tasks.reduce(function (m, t) { var s = t.dueDate || t.startDate; return s > m ? s : m; }, t0);
    min = new Date(Date.parse(min) - 2 * 864e5).toISOString().slice(0, 10);
    max = new Date(Date.parse(max) + 3 * 864e5).toISOString().slice(0, 10);
    var span = Math.max(7, dayDiff(max, min));
    var pos = function (dstr) { return dayDiff(dstr, min) / span * 100; };
    var step = span > 60 ? 7 : span > 25 ? 3 : 1;
    var ticks = '', grid = '';
    for (var i = 0; i <= span; i += step) {
      var ds = new Date(Date.parse(min) + i * 864e5).toISOString().slice(0, 10);
      ticks += '<span style="left:' + (i / span * 100) + '%">' + fmtDate(ds) + '</span>';
      grid += '<div class="g-grid" style="left:' + (i / span * 100) + '%"></div>';
    }
    var todayLine = '<div class="g-today" style="left:' + pos(t0) + '%"></div>';
    el.innerHTML = '<div class="gantt"><div class="gantt-inner"><div class="g-head"><div class="g-label dim small">Task</div><div class="g-days">' + ticks + '</div></div>' +
      tasks.map(function (t) {
        var s = t.startDate || t.dueDate, e = t.dueDate || t.startDate;
        if (e < s) { var tmp = s; s = e; e = tmp; }
        var left = pos(s), width = Math.max(1.5, (dayDiff(e, s) + 1) / span * 100);
        return '<div class="g-row"><div class="g-label" data-task="' + t.id + '">' + avatar(t.assignee, true) + ' ' + esc(t.title) + '</div><div class="g-track">' + grid + todayLine +
          '<div class="g-bar" data-task="' + t.id + '" title="' + esc(t.title) + ' · ' + fmtDate(s) + ' → ' + fmtDate(e) + ' · ' + (+t.progress || 0) + '%" style="left:' + left + '%;width:' + width + '%;background:' + STATUS_COLORS[t.status] + (isOverdue(t) ? ';box-shadow:0 0 0 2px #ef4444' : '') + '"><div class="fill" style="width:' + (+t.progress || 0) + '%"></div><span>' + (+t.progress || 0) + '%</span></div></div></div>';
      }).join('') + '</div></div>' + statusLegend() + '<p class="small dim">Red line = today. Bar fill = progress. Red outline = overdue.</p>';
  }
  function exportCsv() {
    var rows = [['Title', 'Assignee', 'Status', 'Priority', 'Progress', 'Category', 'Start', 'Due', 'Daily', 'Approved method', 'Description', 'Updated']];
    filteredTasks().forEach(function (t) { rows.push([t.title, nameOf(t.assignee), t.status, t.priority, t.progress, t.category, t.startDate, t.dueDate, t.isDaily ? 'Yes' : '', t.method, t.description, t.updatedAt]); });
    var csv = rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'lcm-tasks-' + today() + '.csv'; a.click();
  }

  // ---------- Task form (admin) ----------
  function modal(html, onMount) {
    closeModal();
    var o = document.createElement('div'); o.className = 'overlay top'; o.id = 'mOverlay';
    var m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.setAttribute('role', 'dialog'); m.innerHTML = html;
    document.body.appendChild(o); document.body.appendChild(m);
    o.onclick = closeModal;
    $$('[data-close]', m).forEach(function (b) { b.onclick = closeModal; });
    if (onMount) onMount(m);
    var first = m.querySelector('input,textarea,select'); if (first) first.focus();
  }
  function closeModal() { ['#modal', '#mOverlay'].forEach(function (s) { var e = $(s); if (e) e.remove(); }); }
  function employeeOptions(cur, allowAll) {
    return '<option value="">Unassigned</option>' + (allowAll ? '<option value="__all__">Every active employee (one task each)</option>' : '') +
      S.data.users.filter(function (u) { return u.active; }).map(function (u) { return '<option value="' + esc(u.email) + '"' + (u.email === cur ? ' selected' : '') + '>' + esc(u.name) + ' — ' + esc(u.department || u.role) + '</option>'; }).join('');
  }
  function taskForm(t, daily) {
    var isNew = !t; t = t || { priority: 'Medium', status: 'Not Started', startDate: today(), dueDate: daily ? today() : '', isDaily: !!daily, category: daily ? 'Daily' : '' };
    var cats = Array.from(new Set(S.data.tasks.map(function (x) { return x.category; }).filter(Boolean)));
    modal('<h3>' + (isNew ? (daily ? 'Add daily work' : 'New task') : 'Edit task') + '</h3><form id="tf">' +
      '<label class="field"><span>Title *</span><input class="input" name="title" required maxlength="200" value="' + esc(t.title || '') + '"></label>' +
      '<label class="field"><span>Description / instructions</span><textarea class="input" name="description">' + esc(t.description || '') + '</textarea></label>' +
      '<label class="field"><span>Method / how to execute (employees can propose changes)</span><textarea class="input" name="method" style="min-height:60px">' + esc(t.method || '') + '</textarea></label>' +
      '<div class="grid2"><label class="field"><span>Assign to</span><select class="input" name="assignee">' + employeeOptions(t.assignee, isNew) + '</select></label>' +
      '<label class="field"><span>Priority</span><select class="input" name="priority">' + S.data.priorities.map(function (p) { return '<option' + (p === t.priority ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Start date</span><input class="input" type="date" name="startDate" value="' + esc(t.startDate || '') + '"></label>' +
      '<label class="field"><span>Due date</span><input class="input" type="date" name="dueDate" value="' + esc(t.dueDate || '') + '"></label>' +
      '<label class="field"><span>Category</span><input class="input" name="category" list="cats" value="' + esc(t.category || '') + '"><datalist id="cats">' + cats.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></label>' +
      '<label class="field"><span>Status</span><select class="input" name="status">' + S.data.statuses.map(function (s) { return '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="row small" style="margin-bottom:16px"><input type="checkbox" name="isDaily"' + (t.isDaily ? ' checked' : '') + '> Daily work item</label>' +
      '<div class="row">' + (!isNew ? '<button type="button" class="btn danger sm" id="delTask">Delete</button>' : '') + '<span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">' + (isNew ? 'Create' : 'Save') + '</button></div></form>',
      function (m) {
        var f = $('#tf', m);
        f.onsubmit = function (e) {
          e.preventDefault();
          var p = { title: f.title.value, description: f.description.value, method: f.method.value, assignee: f.assignee.value, priority: f.priority.value, startDate: f.startDate.value, dueDate: f.dueDate.value, category: f.category.value, status: f.status.value, isDaily: f.isDaily.checked };
          var btn = f.querySelector('.btn.primary'); btn.disabled = true;
          var done = function () { closeModal(); };
          if (isNew) {
            var targets = p.assignee === '__all__' ? S.data.users.filter(function (u) { return u.active && u.role === 'employee'; }).map(function (u) { return u.email; }) : [p.assignee];
            if (!targets.length) { toast('No active employees to assign to', 'err'); btn.disabled = false; return; }
            targets.reduce(function (pr, a) { return pr.then(function () { return api('createTask', Object.assign({}, p, { assignee: a })); }); }, Promise.resolve())
              .then(function () { toast(targets.length > 1 ? 'Created ' + targets.length + ' tasks' : 'Task created', 'ok'); done(); refresh(true); })
              .catch(function (er) { toast(er.message, 'err'); btn.disabled = false; });
          } else {
            p.id = t.id;
            act('updateTask', p, 'Task saved').then(done).catch(function () { btn.disabled = false; });
          }
        };
        var del = $('#delTask', m);
        if (del) del.onclick = function () { if (confirm('Delete "' + t.title + '"? This cannot be undone.')) act('deleteTask', { id: t.id }, 'Task deleted').then(function () { closeModal(); closeDrawer(); }); };
      });
  }

  // ---------- Task drawer ----------
  function openTask(id) { S.openTask = id; S.drawerTab = 'updates'; renderDrawer(); }
  function closeDrawer() { S.openTask = null; ['#drawer', '#dOverlay'].forEach(function (s) { var e = $(s); if (e) e.remove(); }); }
  function renderDrawer() {
    var t = S.data.tasks.filter(function (x) { return x.id === S.openTask; })[0];
    if (!t) { closeDrawer(); return; }
    var scrollTop = $('#drawer') ? $('#drawer').scrollTop : 0;
    ['#drawer', '#dOverlay'].forEach(function (s) { var e = $(s); if (e) e.remove(); });
    var remarks = S.data.remarks.filter(function (r) { return r.taskId === t.id; }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var files = S.data.files.filter(function (f) { return f.taskId === t.id; });
    var props = S.data.proposals.filter(function (p) { return p.taskId === t.id; }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var canEdit = isAdmin() || t.assignee === S.data.me.email;
    var tab = S.drawerTab;
    var html = '<div class="drawer-head"><div class="row"><span class="row wrap" style="gap:6px">' + pill(t.status) + prio(t.priority) + (t.isDaily ? '<span class="tag">Daily</span>' : '') + (t.category ? '<span class="tag">' + esc(t.category) + '</span>' : '') + '</span><span class="spacer"></span>' +
      (isAdmin() ? '<button class="btn sm" id="editTask">Edit</button>' : '') + '<button class="btn ghost sm" id="closeDrawer" aria-label="Close">' + icon('x') + '</button></div>' +
      '<h2 style="font-size:21px;margin-top:12px">' + esc(t.title) + '</h2></div><div class="drawer-body">' +
      (canEdit ? '<div class="small muted" style="margin-bottom:8px">Update status</div><div class="status-picker">' + S.data.statuses.map(function (s) {
        return '<button data-st="' + s + '" class="' + (s === t.status ? 'on ' + sKey(s) : '') + '">' + s + '</button>';
      }).join('') + '</div>' +
        '<div style="margin-top:16px"><div class="row small"><span class="muted">Progress</span><span class="spacer"></span><b id="progVal">' + (+t.progress || 0) + '%</b></div><input type="range" min="0" max="100" step="5" id="prog" value="' + (+t.progress || 0) + '"></div>' : '') +
      '<div class="kv"><div><span>Assignee</span><span class="row" style="margin-top:4px">' + avatar(t.assignee, true) + '<span class="small">' + esc(nameOf(t.assignee)) + '</span></span></div>' +
      '<div><span>Start</span>' + fmtDate(t.startDate) + '</div><div><span>Due</span><span class="' + (isOverdue(t) ? 'overdue' : '') + '">' + fmtDate(t.dueDate) + '</span></div><div><span>Created by</span><span class="small">' + esc(nameOf(t.createdBy)) + '</span></div></div>' +
      (t.description ? '<div class="desc">' + esc(t.description) + '</div>' : '') +
      (t.method ? '<div class="method-box"><b style="color:#5ee08f">Approved method</b>\n' + esc(t.method) + '</div>' : '') +
      '<div class="tabs">' + [['updates', 'Updates & remarks (' + remarks.length + ')'], ['files', 'Files (' + files.length + ')'], ['method', 'Method changes (' + props.length + ')']].map(function (x) { return '<button data-tab="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><div id="tabBody">';
    if (tab === 'updates') {
      html += (canEdit ? '<form id="remarkForm" class="card" style="margin-bottom:18px"><label class="field"><span>Add a remark / development update</span><textarea class="input" name="text" placeholder="What changed? Any developments, blockers or results…" required></textarea></label><div class="row"><span class="small muted">Progress also saves with this remark</span><span class="spacer"></span><button class="btn primary sm">Post update</button></div></form>' : '') +
        (remarks.length ? '<ul class="timeline">' + remarks.map(function (r) {
          var st = r.statusTo ? pill(r.statusFrom || '—') + ' → ' + pill(r.statusTo) : '';
          return '<li><span class="dot" style="background:' + (r.statusTo ? STATUS_COLORS[r.statusTo] : '#0077ff') + '"></span><div class="row small">' + avatar(r.author, true) + '<b>' + esc(nameOf(r.author)) + '</b><span class="dim">' + ago(r.createdAt) + '</span><span class="spacer"></span><span class="dim">' + (r.progress !== '' ? esc(r.progress) + '%' : '') + '</span></div>' +
            (st ? '<div class="row small" style="margin-top:6px">' + st + '</div>' : '') + (r.text && r.text !== 'Status changed' ? '<div class="body">' + esc(r.text) + '</div>' : '') + '</li>';
        }).join('') + '</ul>' : '<div class="empty">No updates yet</div>');
    } else if (tab === 'files') {
      html += (canEdit ? '<div class="dropzone" id="dz">' + icon('upload', 26) + '<div style="margin-top:8px"><b>Drop files here</b> or click to choose</div><div class="small dim">Saved to LCM - WORK / Department / Task in Google Drive · max 25 MB each</div><input type="file" id="fileIn" multiple hidden></div><div id="upStatus" class="small muted" style="margin:8px 0"></div>' : '') +
        (files.length ? files.map(fileRow).join('') : '<div class="empty">No files yet</div>');
    } else {
      html += (canEdit && !isAdmin() ? '<form id="propForm" class="card" style="margin-bottom:18px"><h3 style="margin-bottom:6px">Suggest another way to do this</h3><p class="small muted" style="margin:0 0 12px">Your admin reviews it. Once approved, it becomes the task\'s official method.</p>' +
        '<label class="field"><span>Short title</span><input class="input" name="title" maxlength="200" placeholder="e.g. Use partner lab dynamometer"></label>' +
        '<label class="field"><span>Proposed method *</span><textarea class="input" name="approach" required placeholder="Describe the steps you would take instead"></textarea></label>' +
        '<label class="field"><span>Why is it better?</span><textarea class="input" name="reason" style="min-height:60px" placeholder="Faster, cheaper, safer, more accurate…"></textarea></label>' +
        '<div class="row"><span class="spacer"></span><button class="btn primary sm">Send for approval</button></div></form>' : '') +
        (props.length ? props.map(proposalCard).join('') : '<div class="empty">No method changes proposed</div>');
    }
    html += '</div></div>';
    var o = document.createElement('div'); o.className = 'overlay'; o.id = 'dOverlay'; o.onclick = closeDrawer;
    var d = document.createElement('aside'); d.className = 'drawer'; d.id = 'drawer'; d.innerHTML = html;
    document.body.appendChild(o); document.body.appendChild(d);
    d.scrollTop = scrollTop;

    $('#closeDrawer').onclick = closeDrawer;
    if ($('#editTask')) $('#editTask').onclick = function () { taskForm(t); };
    $$('[data-tab]', d).forEach(function (b) { b.onclick = function () { S.drawerTab = b.dataset.tab; renderDrawer(); }; });
    $$('[data-st]', d).forEach(function (b) {
      b.onclick = function () {
        var st = b.dataset.st; if (st === t.status) return;
        var note = st === 'Blocked' ? prompt('What is blocking this task? (added as a remark)') : '';
        if (note === null) return;
        act('updateTask', { id: t.id, status: st, remark: note || '' }, 'Status → ' + st);
      };
    });
    var prog = $('#prog', d);
    if (prog) {
      prog.oninput = function () { $('#progVal').textContent = prog.value + '%'; };
      prog.onchange = function () { act('updateTask', { id: t.id, progress: +prog.value }, 'Progress saved'); };
    }
    var rf = $('#remarkForm', d);
    if (rf) rf.onsubmit = function (e) { e.preventDefault(); var b = rf.querySelector('button'); b.disabled = true; act('addRemark', { taskId: t.id, text: rf.text.value, progress: prog ? +prog.value : undefined }, 'Update posted').catch(function () { b.disabled = false; }); };
    var pf = $('#propForm', d);
    if (pf) pf.onsubmit = function (e) { e.preventDefault(); var b = pf.querySelector('button'); b.disabled = true; act('createProposal', { taskId: t.id, title: pf.title.value, approach: pf.approach.value, reason: pf.reason.value }, 'Sent to admin for approval').catch(function () { b.disabled = false; }); };
    bindProposalButtons(d);
    var dz = $('#dz', d);
    if (dz) setupDropzone(dz, $('#fileIn', d), $('#upStatus', d), t.id);
  }
  function fileRow(f) {
    return '<div class="file-row">' + icon('files', 18) + '<div style="flex:1;min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>' : esc(f.name) + ' <span class="tag">preview — not on Drive</span>') + '</div>' +
      '<div class="small dim">' + fmtSize(f.size) + ' · ' + esc(nameOf(f.uploader)) + ' · ' + ago(f.createdAt) + (f.folder ? ' · 📁 ' + esc(f.folder) : '') + '</div></div></div>';
  }
  function setupDropzone(dz, input, status, taskId) {
    dz.onclick = function () { input.click(); };
    ['dragover', 'dragenter'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function () { dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); upload(e.dataTransfer.files); });
    input.onchange = function () { upload(input.files); input.value = ''; };
    function upload(list) {
      var files = Array.prototype.slice.call(list || []);
      if (!files.length) return;
      var big = files.filter(function (f) { return f.size > 25 * 1048576; });
      if (big.length) { toast(big[0].name + ' is over 25 MB', 'err'); files = files.filter(function (f) { return f.size <= 25 * 1048576; }); }
      var i = 0;
      (function next() {
        if (i >= files.length) { status.textContent = ''; refresh(true); toast('Uploaded ' + files.length + ' file' + (files.length > 1 ? 's' : ''), 'ok'); return; }
        var f = files[i++];
        status.textContent = 'Uploading ' + f.name + ' (' + i + '/' + files.length + ')…';
        var r = new FileReader();
        r.onload = function () {
          var tid = typeof taskId === 'function' ? taskId() : taskId;
          api('uploadFile', { taskId: tid || '', name: f.name, mime: f.type, data: String(r.result).split(',')[1] || '' }).then(next).catch(function (e) { toast(f.name + ': ' + e.message, 'err'); next(); });
        };
        r.readAsDataURL(f);
      })();
    }
  }
  function proposalCard(p) {
    var t = S.data.tasks.filter(function (x) { return x.id === p.taskId; })[0];
    return '<div class="proposal"><div class="row wrap">' + avatar(p.author, true) + '<b>' + esc(nameOf(p.author)) + '</b><span class="dim small">' + ago(p.createdAt) + '</span><span class="spacer"></span>' + pill(p.status) + '</div>' +
      (S.view === 'approvals' && t ? '<div class="small" style="margin-top:8px">Task: <a href="#" data-task="' + t.id + '">' + esc(t.title) + '</a></div>' : '') +
      '<div style="font-weight:600;margin-top:8px">' + esc(p.title) + '</div><div class="approach">' + esc(p.approach) + '</div>' +
      (p.reason ? '<div class="small muted"><b>Why:</b> ' + esc(p.reason) + '</div>' : '') +
      (p.status !== 'Pending' ? '<div class="small dim" style="margin-top:8px">' + esc(p.status) + ' by ' + esc(nameOf(p.reviewedBy)) + ' · ' + ago(p.reviewedAt) + (p.adminNote ? ' — “' + esc(p.adminNote) + '”' : '') + '</div>' : '') +
      (isAdmin() && p.status === 'Pending' ? '<div class="row" style="margin-top:12px"><input class="input" placeholder="Note to employee (optional)" data-note="' + p.id + '" style="flex:1;padding:7px 10px"><button class="btn success sm" data-approve="' + p.id + '">Approve</button><button class="btn danger sm" data-reject="' + p.id + '">Reject</button></div>' : '') + '</div>';
  }
  function bindProposalButtons(root) {
    $$('[data-approve],[data-reject]', root).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.approve || b.dataset.reject, approve = !!b.dataset.approve;
        var note = (root.querySelector('[data-note="' + id + '"]') || {}).value || '';
        b.disabled = true;
        act('reviewProposal', { id: id, decision: approve ? 'Approved' : 'Rejected', note: note }, approve ? 'Approved — task method updated' : 'Proposal rejected').catch(function () { b.disabled = false; });
      };
    });
  }

  // ---------- Daily works ----------
  function viewDaily(c) {
    var d = S.data, t0 = today();
    var dailyTasks = d.tasks.filter(function (t) { return t.isDaily; }).sort(function (a, b) { return (b.startDate || '') < (a.startDate || '') ? -1 : 1; });
    var todays = dailyTasks.filter(function (t) { return t.startDate === t0 || t.dueDate === t0; });
    var todayDone = todays.filter(function (t) { return t.status === 'Completed'; }).length;
    var logs = d.dailyLogs.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var html = '<div class="grid g-2"><div class="card"><h3>Today\'s daily works · ' + fmtDate(t0) + '<span class="spacer"></span>' + (isAdmin() ? '<button class="btn primary sm" id="addDaily">' + icon('plus', 15) + ' Add daily work</button>' : '') + '</h3>' +
      '<div class="row" style="gap:20px;margin-bottom:14px">' + ring(todays.length ? Math.round(todayDone / todays.length * 100) : 0, 80) + '<div><div style="font-family:Montserrat;font-size:22px;font-weight:700">' + todayDone + ' / ' + todays.length + '</div><div class="small muted">completed today</div></div></div>' +
      (todays.length ? todays.map(function (t) { return '<div class="list-item" data-task="' + t.id + '">' + avatar(t.assignee, true) + '<div style="flex:1;min-width:0">' + esc(t.title) + '<div class="small dim">' + esc(nameOf(t.assignee)) + '</div></div>' + pill(t.status) + '</div>'; }).join('') : '<div class="empty">No daily works for today' + (isAdmin() ? ' — add one above' : '') + '</div>') + '</div>' +
      '<div class="card"><h3>Submit daily log</h3><form id="logForm"><div class="grid2"><label class="field"><span>Date</span><input class="input" type="date" name="date" value="' + t0 + '"></label><label class="field"><span>Hours</span><input class="input" type="number" name="hours" min="0" max="24" step="0.5" value="8"></label></div>' +
      '<label class="field"><span>What did you work on?</span><textarea class="input" name="summary" required placeholder="Key work done, results, developments…"></textarea></label>' +
      '<label class="field"><span>Blockers (optional)</span><input class="input" name="blockers"></label><div class="row"><span class="spacer"></span><button class="btn primary sm">Submit log</button></div></form></div></div>';
    html += '<div class="grid g-2e"><div class="card"><h3>Daily work history</h3><div class="scroll">' + (dailyTasks.length ? dailyTasks.slice(0, 50).map(function (t) { return '<div class="list-item" data-task="' + t.id + '"><span class="small dim nowrap" style="width:54px">' + fmtDate(t.startDate) + '</span>' + avatar(t.assignee, true) + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.title) + '</span>' + pill(t.status) + '</div>'; }).join('') : '<div class="empty">None yet</div>') + '</div></div>' +
      '<div class="card"><h3>' + (isAdmin() ? 'Team daily logs' : 'My daily logs') + '</h3><div class="scroll">' + (logs.length ? '<ul class="timeline">' + logs.slice(0, 60).map(function (l) {
        return '<li><span class="dot"></span><div class="row small">' + avatar(l.author, true) + '<b>' + esc(nameOf(l.author)) + '</b><span class="dim">' + fmtDate(l.date) + ' · ' + esc(l.hours) + 'h</span></div><div class="body">' + esc(l.summary) + (l.blockers ? '\n\n⚠️ Blocker: ' + esc(l.blockers) : '') + '</div></li>';
      }).join('') + '</ul>' : '<div class="empty">No logs yet</div>') + '</div></div></div>';
    c.innerHTML = html;
    bindCommon(c);
    if ($('#addDaily')) $('#addDaily').onclick = function () { taskForm(null, true); };
    var lf = $('#logForm');
    lf.onsubmit = function (e) { e.preventDefault(); act('addDailyLog', { date: lf.date.value, hours: lf.hours.value, summary: lf.summary.value, blockers: lf.blockers.value }, 'Daily log saved'); };
  }

  // ---------- Approvals ----------
  function viewApprovals(c) {
    var ps = S.data.proposals.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var pending = ps.filter(function (p) { return p.status === 'Pending'; }), rest = ps.filter(function (p) { return p.status !== 'Pending'; });
    c.innerHTML = (isAdmin() ? '<p class="muted" style="margin-top:0">Employees can suggest another way to execute a task. Approving replaces the task\'s official method and notifies the timeline.</p>'
      : '<p class="muted" style="margin-top:0">To suggest a different way of doing a task, open the task → <b>Method changes</b>.</p>') +
      '<div class="grid g-2e"><div><h3 style="margin-bottom:12px">Pending (' + pending.length + ')</h3>' + (pending.length ? pending.map(proposalCard).join('') : '<div class="card empty">Nothing waiting</div>') + '</div>' +
      '<div><h3 style="margin-bottom:12px">Reviewed (' + rest.length + ')</h3>' + (rest.length ? rest.map(proposalCard).join('') : '<div class="card empty">None yet</div>') + '</div></div>';
    bindCommon(c); bindProposalButtons(c);
  }

  // ---------- Team ----------
  function viewTeam(c) {
    var d = S.data;
    var rows = d.users.map(function (u) {
      var mine = d.tasks.filter(function (t) { return t.assignee === u.email; });
      var done = mine.filter(function (t) { return t.status === 'Completed'; }).length;
      return { u: u, total: mine.length, open: mine.length - done, done: done, overdue: mine.filter(isOverdue).length, blocked: mine.filter(function (t) { return t.status === 'Blocked'; }).length, rate: mine.length ? Math.round(done / mine.length * 100) : 0,
        last: d.activity.filter(function (a) { return a.actor === u.email && a.action !== 'login'; }).slice(-1)[0] };
    });
    c.innerHTML = '<div class="toolbar"><span class="muted small">Only people listed here can sign in. Admins can assign work and approve method changes.</span><span class="spacer"></span><button class="btn primary sm" id="addUser">' + icon('plus', 15) + ' Add member</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Open</th><th>Done</th><th>Overdue</th><th>Blocked</th><th>Completion</th><th>Last active</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr style="' + (r.u.active ? '' : 'opacity:.45') + '"><td><span class="row">' + avatar(r.u.email) + '<span><b>' + esc(r.u.name) + '</b><div class="small dim">' + esc(r.u.email) + (r.u.department ? ' · ' + esc(r.u.department) : '') + '</div></span></span></td>' +
          '<td><span class="role-tag">' + esc(r.u.role) + '</span>' + (r.u.active ? '' : ' <span class="tag">inactive</span>') + '</td><td>' + r.open + '</td><td>' + r.done + '</td><td class="' + (r.overdue ? 'overdue' : '') + '">' + r.overdue + '</td><td>' + r.blocked + '</td>' +
          '<td><div class="row"><div class="progress" style="flex:1"><span style="width:' + r.rate + '%;background:#22c55e"></span></div><span class="small dim">' + r.rate + '%</span></div></td>' +
          '<td class="small dim nowrap">' + (r.last ? ago(r.last.createdAt) : '—') + '</td><td><button class="btn sm" data-edit-user="' + esc(r.u.email) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="grid g-2e" style="margin-top:14px"><div class="card"><h3>Workload by member</h3>' + workload(d.tasks) + '</div><div class="card"><h3>Tasks by category</h3>' + categoryBars() + '</div></div>';
    $('#addUser').onclick = function () { userForm(); };
    $$('[data-edit-user]').forEach(function (b) { b.onclick = function () { userForm(userBy(b.dataset.editUser)); }; });
  }
  function categoryBars() {
    var m = {}; S.data.tasks.forEach(function (t) { var k = t.category || 'Uncategorized'; m[k] = (m[k] || 0) + 1; });
    var e = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var max = e.length ? e[0][1] : 1;
    return e.length ? e.map(function (x) { return '<div class="bar-row"><span class="name">' + esc(x[0]) + '</span><div class="stack"><span style="width:' + (x[1] / max * 100) + '%;background:#0077ff"></span></div><span class="dim small" style="text-align:right">' + x[1] + '</span></div>'; }).join('') : '<div class="empty">No tasks yet</div>';
  }
  function userForm(u) {
    var isNew = !u; u = u || { role: 'employee', active: true };
    modal('<h3>' + (isNew ? 'Add team member' : 'Edit ' + esc(u.name)) + '</h3><form id="uf">' +
      '<label class="field"><span>Email *</span><input class="input" type="email" name="email" required value="' + esc(u.email || '') + '"' + (isNew ? '' : ' readonly') + '></label>' +
      '<div class="grid2"><label class="field"><span>Full name</span><input class="input" name="name" value="' + esc(u.name || '') + '"></label>' +
      '<label class="field"><span>Department (Drive sub-folder)</span><input class="input" name="department" list="depts" placeholder="e.g. Electronics" value="' + esc(u.department || '') + '"><datalist id="depts">' + (S.data.departments || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></label>' +
      '<label class="field"><span>Role</span><select class="input" name="role"><option value="employee">Employee</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option></select></label>' +
      '<label class="field"><span>Access</span><select class="input" name="active"><option value="true">Active — can sign in</option><option value="false"' + (u.active ? '' : ' selected') + '>Disabled</option></select></label></div>' +
      '<div class="row"><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>', function (m) {
      var f = $('#uf', m);
      f.onsubmit = function (e) { e.preventDefault(); act('saveUser', { email: f.email.value, name: f.name.value, department: f.department.value, role: f.role.value, active: f.active.value === 'true' }, 'Member saved').then(closeModal); };
    });
  }

  // ---------- Files ----------
  function viewFiles(c) {
    var d = S.data;
    var files = d.files.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var taskName = function (id) { var t = d.tasks.filter(function (x) { return x.id === id; })[0]; return t ? t.title : 'General'; };
    c.innerHTML = '<div class="grid g-2"><div class="card"><h3>Upload to Google Drive</h3>' +
      '<label class="field"><span>Attach to task</span><select class="input" id="upTask"><option value="">General (no task)</option>' + d.tasks.map(function (t) { return '<option value="' + t.id + '">' + esc(t.title) + '</option>'; }).join('') + '</select></label>' +
      '<div class="dropzone" id="dz">' + icon('upload', 26) + '<div style="margin-top:8px"><b>Drop files here</b> or click to choose</div><div class="small dim">Saved to LCM - WORK / Department / Task · max 25 MB</div><input type="file" id="fileIn" multiple hidden></div><div id="upStatus" class="small muted" style="margin-top:8px"></div></div>' +
      '<div class="card"><h3>Storage</h3><div class="kpi" style="--accent:#0077ff;border:0;padding:0 0 0 14px;margin-bottom:12px"><div class="label">Files uploaded</div><div class="value">' + files.length + '</div><div class="sub">' + fmtSize(files.reduce(function (s, f) { return s + (+f.size || 0); }, 0)) + ' total</div></div>' +
      (d.uploadsFolderUrl ? '<a class="btn sm" href="' + esc(d.uploadsFolderUrl) + '" target="_blank" rel="noopener">' + icon('files', 15) + ' Open Drive folder</a>' : '<p class="small muted">' + (PREVIEW ? 'In preview mode files are not sent to Drive.' : 'Uploads go to the LCM - WORK Drive folder, sorted into department sub-folders.') + '</p>') + '</div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>File</th><th>Task</th><th>Drive folder</th><th>Uploaded by</th><th>Size</th><th>When</th></tr></thead><tbody>' +
      (files.length ? files.map(function (f) {
        return '<tr><td>' + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>' : esc(f.name)) + '</td><td>' + (f.taskId ? '<a href="#" data-task="' + esc(f.taskId) + '">' + esc(taskName(f.taskId)) + '</a>' : '<span class="dim">General</span>') + '</td><td class="small dim">' + esc(f.folder || '—') + '</td><td><span class="row">' + avatar(f.uploader, true) + '<span class="small">' + esc(nameOf(f.uploader)) + '</span></span></td><td class="small dim">' + fmtSize(f.size) + '</td><td class="small dim nowrap">' + ago(f.createdAt) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">No files yet</td></tr>') + '</tbody></table></div>';
    bindCommon(c);
    var dz = $('#dz'); var sel = $('#upTask');
    setupDropzone(dz, $('#fileIn'), $('#upStatus'), function () { return sel.value; });
  }
  // ---------- Attendance ----------
  function attendanceButton() {
    var r = myToday();
    if (!r) return '<button class="btn success sm" data-checkin>' + icon('clock', 15) + '<span>Check in</span></button>';
    if (!r.checkOut) return '<span class="small muted nowrap hide-sm">In since ' + fmtTime(r.checkIn) + '</span><button class="btn danger sm" data-checkout>' + icon('clock', 15) + '<span>Check out</span></button>';
    return '<span class="small muted nowrap hide-sm">✓ ' + fmtTime(r.checkIn) + ' – ' + fmtTime(r.checkOut) + '</span>';
  }
  function bindAttendanceButtons(root) {
    $$('[data-checkin]', root).forEach(function (b) { b.onclick = function () { b.disabled = true; act('checkIn', {}, 'Marked present ✓').catch(function () { b.disabled = false; }); }; });
    $$('[data-checkout]', root).forEach(function (b) { b.onclick = checkoutForm; });
    $$('[data-report]', root).forEach(function (b) { b.onclick = function () { showReport(b.dataset.report); }; });
  }
  function checkoutForm() {
    var r = myToday(); if (!r) return;
    var mine = S.data.tasks.filter(function (t) { return t.assignee === S.data.me.email && (t.status !== 'Completed' || (t.completedAt && localDay(t.completedAt) === S.data.officeDate)); });
    modal('<h3>Check out · daily report</h3><p class="small muted" style="margin-top:-8px">In since <b>' + fmtTime(r.checkIn) + '</b> · ' + fmtDur(durH(r.checkIn, '')) + ' so far. Your report is saved to Google Drive (Daily Reports) and your admin can see it.</p><form id="cof">' +
      '<label class="field"><span>What did you do today? *</span><textarea class="input" name="report" required minlength="5" style="min-height:110px" placeholder="Work completed, results, developments…"></textarea></label>' +
      (mine.length ? '<div class="field"><span class="small muted" style="display:block;margin-bottom:6px">Tasks you worked on</span><div class="check-list">' + mine.map(function (t) {
        return '<label class="row small"><input type="checkbox" name="task" value="' + t.id + '"> <span style="flex:1">' + esc(t.title) + '</span>' + pill(t.status) + '</label>'; }).join('') + '</div></div>' : '') +
      '<label class="field"><span>Blockers / help needed</span><input class="input" name="blockers" placeholder="Optional"></label>' +
      '<label class="field"><span>Plan for tomorrow</span><input class="input" name="plan" placeholder="Optional"></label>' +
      '<label class="field"><span>Attach files (photos, results…) · saved with the report</span><input class="input" type="file" name="files" multiple></label>' +
      '<div id="coStatus" class="small muted" style="margin-bottom:10px"></div>' +
      '<div class="row"><span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn danger">Submit report &amp; check out</button></div></form>', function (m) {
      var f = $('#cof', m), st = $('#coStatus', m);
      f.onsubmit = function (e) {
        e.preventDefault();
        var btn = f.querySelector('.btn.danger'); btn.disabled = true;
        var list = Array.prototype.slice.call(f.files.files || []);
        var big = list.filter(function (x) { return x.size > 25 * 1048576; });
        if (big.length) { toast(big[0].name + ' is over 25 MB', 'err'); btn.disabled = false; return; }
        var uploaded = [];
        var chain = list.reduce(function (pr, file, i) {
          return pr.then(function () {
            st.textContent = 'Uploading ' + file.name + ' (' + (i + 1) + '/' + list.length + ')…';
            return new Promise(function (res, rej) {
              var rd = new FileReader();
              rd.onload = function () { api('uploadFile', { report: true, name: file.name, mime: file.type, data: String(rd.result).split(',')[1] || '' }).then(function (x) { uploaded.push({ name: x.name, url: x.url }); res(); }).catch(rej); };
              rd.onerror = rej; rd.readAsDataURL(file);
            });
          });
        }, Promise.resolve());
        chain.then(function () {
          st.textContent = 'Saving report to Drive…';
          return api('checkOut', { report: f.report.value, blockers: f.blockers.value, plan: f.plan.value, files: uploaded,
            taskIds: $$('input[name=task]:checked', f).map(function (x) { return x.value; }) });
        }).then(function () { closeModal(); toast('Checked out — report saved to Drive', 'ok'); return refresh(true); })
          .catch(function (er) { toast(er.message, 'err'); st.textContent = ''; btn.disabled = false; });
      };
    });
  }
  function showReport(id) {
    var r = S.data.attendance.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    modal('<h3>' + esc(nameOf(r.email)) + ' · ' + new Date(r.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + '</h3>' +
      '<div class="row small muted" style="margin-top:-8px;margin-bottom:14px">' + fmtTime(r.checkIn) + ' – ' + fmtTime(r.checkOut) + ' · ' + fmtDur(durH(r.checkIn, r.checkOut)) + '</div>' +
      '<div class="timeline"><div class="body" style="margin:0">' + esc(r.report || 'No report') + '</div></div>' +
      '<div class="row" style="margin-top:16px">' + (r.reportUrl ? '<a class="btn sm" href="' + esc(r.reportUrl) + '" target="_blank" rel="noopener">' + icon('files', 15) + ' Open in Google Drive</a>' : '') + '<span class="spacer"></span><button class="btn" data-close>Close</button></div>');
  }
  function attStatus(r) {
    if (!r) return '<span class="pill s-Rejected">Absent</span>';
    if (!r.checkOut) return r.date === S.data.officeDate ? '<span class="pill s-InProgress">In office</span>' : '<span class="pill s-InReview">No exit</span>';
    return '<span class="pill s-Completed">Present</span>';
  }
  function monthDays(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), n = new Date(y, m, 0).getDate(), out = [];
    for (var i = 1; i <= n; i++) out.push(ym + '-' + ('0' + i).slice(-2));
    return out;
  }
  function viewAttendance(c) {
    var d = S.data, me = d.me, admin = isAdmin(), today = d.officeDate;
    S.attDate = S.attDate || today; S.attMonth = S.attMonth || today.slice(0, 7);
    var r = myToday();
    var clock = '<div class="card att-today"><div><div class="small muted">Office time · India (IST)</div><div class="att-clock" id="attClock">' + fmtTime(serverNow().toISOString()) + '</div>' +
      '<div class="muted">' + new Date(today + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</div></div>' +
      '<div class="att-stats"><div><span>Entry</span><b>' + (r ? fmtTime(r.checkIn) : '—') + '</b></div><div><span>Exit</span><b>' + (r && r.checkOut ? fmtTime(r.checkOut) : '—') + '</b></div>' +
      '<div><span>Hours</span><b id="attHours">' + (r ? fmtDur(durH(r.checkIn, r.checkOut)) : '—') + '</b></div><div><span>Status</span>' + attStatus(r) + '</div></div>' +
      '<div class="att-action">' + (!r ? '<button class="btn success big" data-checkin>' + icon('clock', 18) + ' Check in — I\'m in the office</button>'
        : !r.checkOut ? '<button class="btn danger big" data-checkout>' + icon('clock', 18) + ' Check out</button>'
        : '<div class="muted small">Day complete ✓</div>') + '<div class="small dim" style="margin-top:6px">Time is taken from the server clock, not your device.</div></div></div>';

    var html = clock;
    var members = d.users.filter(function (u) { return u.active; });
    if (admin) {
      var day = d.attendance.filter(function (x) { return x.date === S.attDate; });
      var byEmail = {}; day.forEach(function (x) { byEmail[x.email] = x; });
      var present = day.length, inNow = day.filter(function (x) { return !x.checkOut && x.date === today; }).length;
      var done = day.filter(function (x) { return x.checkOut; });
      var avg = done.length ? done.reduce(function (s, x) { return s + durH(x.checkIn, x.checkOut); }, 0) / done.length : 0;
      html += '<div class="toolbar" style="margin-top:18px"><h3 style="margin:0">Daily register</h3><input class="input" type="date" id="attDate" value="' + S.attDate + '" max="' + today + '">' +
        '<button class="btn sm" id="attToday">Today</button><span class="spacer"></span><button class="btn sm" id="attAdd">' + icon('plus', 15) + ' Add / fix entry</button></div>' +
        '<div class="kpis" style="grid-template-columns:repeat(5,minmax(0,1fr))">' + [
          ['Present', present + ' / ' + members.length, '#22c55e'], ['In office now', inNow, '#0077ff'], ['Checked out', done.length, '#8b93a7'],
          ['Absent', Math.max(0, members.length - present), '#ef4444'], ['Avg hours', done.length ? fmtDur(avg) : '—', '#f5a524']
        ].map(function (k) { return '<div class="kpi" style="--accent:' + k[2] + '"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div></div>'; }).join('') + '</div>' +
        '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Department</th><th>Entry</th><th>Exit</th><th>Hours</th><th>Status</th><th>Report</th><th></th></tr></thead><tbody>' +
        members.map(function (u) {
          var x = byEmail[u.email];
          return '<tr><td><span class="row">' + avatar(u.email, true) + '<b>' + esc(u.name) + '</b></span></td><td class="small muted">' + esc(u.department || '—') + '</td>' +
            '<td class="nowrap">' + (x ? fmtTime(x.checkIn) : '—') + '</td><td class="nowrap">' + (x && x.checkOut ? fmtTime(x.checkOut) : '—') + '</td>' +
            '<td class="nowrap">' + (x ? fmtDur(durH(x.checkIn, x.checkOut || (x.date === today ? '' : x.checkIn))) : '—') + '</td><td>' + attStatus(x) +
            (x && x.editedBy ? ' <span class="tag" title="Edited by ' + esc(nameOf(x.editedBy)) + '">edited</span>' : '') + '</td>' +
            '<td>' + (x && x.report ? '<button class="btn sm" data-report="' + x.id + '">View</button>' : '<span class="dim">—</span>') + '</td>' +
            '<td><button class="btn ghost sm" data-att-edit="' + esc(u.email) + '">Edit</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    // Monthly register
    var days = monthDays(S.attMonth);
    var rows = admin ? members : [me];
    var recs = {}; d.attendance.forEach(function (x) { if (x.date.slice(0, 7) === S.attMonth) recs[x.email + '|' + x.date] = x; });
    html += '<div class="toolbar" style="margin-top:22px"><h3 style="margin:0">Monthly attendance</h3><input class="input" type="month" id="attMonth" value="' + S.attMonth + '" max="' + today.slice(0, 7) + '">' +
      '<span class="spacer"></span><span class="legend" style="margin:0"><span><i style="background:#22c55e"></i>Present</span><span><i style="background:#f5a524"></i>No exit</span><span><i style="background:rgba(239,68,68,.35)"></i>Absent</span><span><i style="background:rgba(255,255,255,.05)"></i>Sunday / future</span></span>' +
      '<button class="btn sm" id="attCsv">' + icon('download', 15) + ' CSV</button></div>' +
      '<div class="table-wrap"><table class="att-grid"><thead><tr><th class="sticky">Member</th>' + days.map(function (x) {
        var dt = new Date(x + 'T12:00:00'); return '<th class="' + (dt.getDay() === 0 ? 'sun' : '') + (x === today ? ' now' : '') + '">' + (+x.slice(8)) + '<div>' + 'SMTWTFS'[dt.getDay()] + '</div></th>';
      }).join('') + '<th>Days</th><th>Hours</th></tr></thead><tbody>' +
      rows.map(function (u) {
        var cnt = 0, hrs = 0;
        var cells = days.map(function (x) {
          var rr = recs[u.email + '|' + x], sun = new Date(x + 'T12:00:00').getDay() === 0, future = x > today;
          if (rr) { cnt++; var h = rr.checkOut ? durH(rr.checkIn, rr.checkOut) : 0; hrs += h;
            return '<td><span class="att-cell ' + (rr.checkOut || x === today ? 'p' : 'nx') + '" title="' + esc(x + ': ' + fmtTime(rr.checkIn) + ' – ' + (rr.checkOut ? fmtTime(rr.checkOut) : 'no exit') + (h ? ' (' + fmtDur(h) + ')' : '')) + '">P</span></td>'; }
          return '<td><span class="att-cell ' + (sun || future ? 'off' : (u.createdAt && x < String(u.createdAt).slice(0, 10) ? 'off' : 'a')) + '" title="' + x + '"></span></td>';
        }).join('');
        return '<tr><td class="sticky"><span class="row">' + avatar(u.email, true) + '<span class="small">' + esc(u.name) + '</span></span></td>' + cells + '<td><b>' + cnt + '</b></td><td class="nowrap small">' + fmtDur(hrs) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (!admin) {
      var mine = d.attendance.filter(function (x) { return x.date.slice(0, 7) === S.attMonth; }).sort(function (p, q) { return p.date < q.date ? 1 : -1; });
      html += '<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Date</th><th>Entry</th><th>Exit</th><th>Hours</th><th>Status</th><th>Report</th></tr></thead><tbody>' +
        (mine.length ? mine.map(function (x) { return '<tr><td class="nowrap">' + new Date(x.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + '</td><td>' + fmtTime(x.checkIn) + '</td><td>' + (x.checkOut ? fmtTime(x.checkOut) : '—') + '</td><td>' + (x.checkOut ? fmtDur(durH(x.checkIn, x.checkOut)) : '—') + '</td><td>' + attStatus(x) + '</td><td>' + (x.report ? '<button class="btn sm" data-report="' + x.id + '">View</button>' : '—') + '</td></tr>'; }).join('')
          : '<tr><td colspan="6" class="empty">No attendance this month</td></tr>') + '</tbody></table></div>';
    }
    c.innerHTML = html;
    bindAttendanceButtons(c);
    var tick = setInterval(function () {
      var el = $('#attClock'); if (!el) return clearInterval(tick);
      el.textContent = new Date(serverNow()).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      var rr = myToday(), hEl = $('#attHours'); if (rr && hEl && !rr.checkOut) hEl.textContent = fmtDur(durH(rr.checkIn, ''));
    }, 1000);
    if ($('#attDate')) $('#attDate').onchange = function () { S.attDate = this.value || today; render(); };
    if ($('#attToday')) $('#attToday').onclick = function () { S.attDate = today; render(); };
    $('#attMonth').onchange = function () { S.attMonth = this.value || today.slice(0, 7); render(); };
    if ($('#attAdd')) $('#attAdd').onclick = function () { attendanceForm(); };
    $$('[data-att-edit]', c).forEach(function (b) { b.onclick = function () { attendanceForm(b.dataset.attEdit, S.attDate); }; });
    $('#attCsv').onclick = function () {
      var out = [['Date', 'Name', 'Email', 'Department', 'Entry', 'Exit', 'Hours', 'Status', 'Edited by', 'Report', 'Report link']];
      rows.forEach(function (u) { days.forEach(function (x) {
        if (x > today) return;
        var rr = recs[u.email + '|' + x];
        out.push([x, u.name, u.email, u.department || '', rr ? fmtTime(rr.checkIn) : '', rr && rr.checkOut ? fmtTime(rr.checkOut) : '', rr && rr.checkOut ? durH(rr.checkIn, rr.checkOut).toFixed(2) : '',
          rr ? (rr.checkOut ? 'Present' : 'No exit') : (new Date(x + 'T12:00:00').getDay() === 0 ? 'Sunday' : 'Absent'), rr && rr.editedBy ? rr.editedBy : '', rr ? rr.report || '' : '', rr ? rr.reportUrl || '' : '']);
      }); });
      var csv = out.map(function (r2) { return r2.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      var aEl = document.createElement('a'); aEl.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); aEl.download = 'lcm-attendance-' + S.attMonth + '.csv'; aEl.click();
    };
  }
  function attendanceForm(email, date) {
    date = date || S.data.officeDate;
    var rec = email && S.data.attendance.filter(function (x) { return x.email === email && x.date === date; })[0];
    modal('<h3>Add / fix attendance</h3><p class="small muted" style="margin-top:-8px">For when someone forgot to check in or out. Times are India time (IST). Changes are marked "edited".</p><form id="af">' +
      '<label class="field"><span>Member</span><select class="input" name="email">' + S.data.users.filter(function (u) { return u.active; }).map(function (u) { return '<option value="' + esc(u.email) + '"' + (u.email === email ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="grid2"><label class="field"><span>Date</span><input class="input" type="date" name="date" value="' + date + '" max="' + S.data.officeDate + '"></label><span></span>' +
      '<label class="field"><span>Entry time *</span><input class="input" type="time" name="checkIn" required value="' + hhmm(rec && rec.checkIn) + '"></label>' +
      '<label class="field"><span>Exit time</span><input class="input" type="time" name="checkOut" value="' + hhmm(rec && rec.checkOut) + '"></label></div>' +
      '<label class="field"><span>Reason / note</span><input class="input" name="note" value="' + esc(rec ? rec.note : '') + '" placeholder="e.g. forgot to check out"></label>' +
      '<div class="row">' + (rec ? '<button type="button" class="btn danger sm" id="afDel">Remove entry</button>' : '') + '<span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>', function (m) {
      var f = $('#af', m);
      f.onsubmit = function (e) { e.preventDefault(); act('saveAttendance', { email: f.email.value, date: f.date.value, checkIn: f.checkIn.value, checkOut: f.checkOut.value, note: f.note.value }, 'Attendance saved').then(closeModal); };
      if ($('#afDel', m)) $('#afDel', m).onclick = function () { if (confirm('Remove this attendance entry?')) act('deleteAttendance', { id: rec.id }, 'Entry removed').then(closeModal); };
    });
  }

  // ---------- Activity ----------
  function viewActivity(c) {
    var items = S.data.activity.slice().reverse();
    var byDay = {};
    items.filter(function (a) { return a.action !== 'login'; }).forEach(function (a) { var k = localDay(a.createdAt); (byDay[k] = byDay[k] || []).push(a); });
    var keys = Object.keys(byDay).sort().reverse();
    c.innerHTML = keys.length ? keys.map(function (k) { return '<div class="card" style="margin-bottom:14px"><h3>' + (k === today() ? 'Today' : new Date(k + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })) + '<span class="spacer"></span><span class="small dim">' + byDay[k].length + ' events</span></h3>' + feed(byDay[k]) + '</div>'; }).join('') : '<div class="card empty">No activity yet</div>';
    bindCommon(c);
  }

  // ---------- Boot ----------
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if ($('#modal')) closeModal(); else if (S.openTask) closeDrawer(); } });
  setInterval(function () { if (S.token && S.data && !document.hidden && !$('#modal') && !document.activeElement.matches('textarea,input')) refresh(true); }, (CFG.REFRESH_SECONDS || 60) * 1000);
  if (S.token) { render(); refresh(); } else render();
})();
