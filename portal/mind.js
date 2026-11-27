/* LCM Work Portal — "My Mind": one private task model shown as Tree, Map, Board, Timeline, Calendar,
 * plus Obsidian-style Notes and a Graph. Every view edits the same items, so they stay linked. */
(function () {
  'use strict';
  var L; // app helpers (window.LCM)
  var PALETTE = ['#0077ff', '#22c55e', '#f5a524', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#eab308', '#6366f1', '#f97316'];
  var COLORS = ['', '#0077ff', '#22c55e', '#f5a524', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#64748b'];
  var ICONS = ['', '⭐', '🔥', '🚀', '💡', '⚠️', '🎯', '🧪', '🔧', '💰', '📞', '📝', '📦', '🧠', '❤️', '✅', '⏳', '📌'];
  var PRI = ['None', 'Low', 'Medium', 'High', 'Urgent'];
  var PRI_COLOR = ['', '#8b93a7', '#5aa8ff', '#f5a524', '#ef4444'];
  var RECUR = { '': 'Does not repeat', daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };
  var STATE_LABEL = { done: 'Done', blocked: 'Blocked', doing: 'Doing', ready: 'Ready', open: 'Open' };
  var STATE_COLOR = { done: '#22c55e', blocked: '#ef4444', doing: '#0077ff', ready: '#f5a524', open: '#8b93a7' };
  var VIEWS = [['tree', 'Tree'], ['map', 'Map'], ['board', 'Board'], ['timeline', 'Timeline'], ['calendar', 'Calendar'], ['notes', 'Notes'], ['graph', 'Graph']];
  var NOFILTER = function () { return { q: '', status: 'all', pri: '0', due: 'any', tag: '', branch: '' }; };

  var M = {
    items: {}, loaded: false, loading: false, mode: 'remote', error: '',
    tab: 'tree', sel: null, multi: {}, note: null, panel: true,
    f: NOFILTER(),
    dirty: {}, deleted: {}, saveTimer: null, saving: false, status: '',
    undo: [], redo: [],
    view: { tx: 40, ty: 40, k: 0.9, fitted: false },
    mapOpt: { layout: 'right', edge: 'curved', deps: true, dates: true, minimap: true, focus: null },
    tl: { start: null, px: 28 }, cal: null, nq: '', tagFilter: null, editMode: 'split', graphTags: false
  };
  try { var saved = JSON.parse(localStorage.getItem('lcm_mind_prefs') || 'null'); if (saved) { M.tab = saved.tab || M.tab; Object.assign(M.mapOpt, saved.mapOpt || {}); M.panel = saved.panel !== false; } } catch (e) {}
  function savePrefs() { try { localStorage.setItem('lcm_mind_prefs', JSON.stringify({ tab: M.tab, mapOpt: M.mapOpt, panel: M.panel })); } catch (e) {} }

  // ---------- basics ----------
  function esc(s) { return L.esc(s); }
  function uid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function list() { return Object.keys(M.items).map(function (k) { return M.items[k]; }); }
  function nodes() { return list().filter(function (x) { return x.kind === 'node'; }); }
  function notes() { return list().filter(function (x) { return x.kind === 'note'; }); }
  function meta(n) { if (!n.m) { try { n.m = n.meta ? JSON.parse(n.meta) : {}; } catch (e) { n.m = {}; } } return n.m; }
  function today() { return L.officeDay(L.serverNow()); }
  function addDays(d, n) { var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function dow(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }
  function dayDiff(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5); }
  function fmtD(d) { if (!d) return ''; var t = new Date(d + 'T12:00:00Z'); return t.getUTCDate() + ' ' + 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[t.getUTCMonth()]; }
  function dueLabel(d) { var x = dayDiff(d, today()); return x === 0 ? 'Today' : x === 1 ? 'Tomorrow' : x === -1 ? 'Yesterday' : x < 0 ? Math.abs(x) + 'd overdue' : x < 7 ? 'in ' + x + 'd' : fmtD(d); }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function fmtAgo(s) { var m = Math.round((Date.now() - Date.parse(s)) / 6e4); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
  function localKey() { return 'lcm_mind_local_' + L.S.data.me.email; }
  function download(name, data, type) { var a = document.createElement('a'); a.href = typeof data === 'string' && data.indexOf('data:') === 0 ? data : URL.createObjectURL(new Blob([data], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  // ---------- recurrence ----------
  function periodStart(recur, d) {
    if (recur === 'weekly') { var w = dow(d); return addDays(d, -((w + 6) % 7)); }
    if (recur === 'monthly') return d.slice(0, 8) + '01';
    return d;
  }
  function prevPeriod(r, p) {
    if (r === 'weekly') return addDays(p, -7);
    if (r === 'monthly') { var d = new Date(p + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); }
    if (r === 'weekdays') { var x = addDays(p, -1); while (dow(x) === 0 || dow(x) === 6) x = addDays(x, -1); return x; }
    return addDays(p, -1);
  }
  function doneThisPeriod(n) { var m = meta(n); if (!m.recur) return false; var ps = periodStart(m.recur, today()); return (m.done || []).some(function (d) { return d >= ps; }); }
  function streak(n) {
    var m = meta(n), set = {}; (m.done || []).forEach(function (d) { set[periodStart(m.recur, d)] = 1; });
    var cur = periodStart(m.recur, today()), c = 0, g = 0;
    if (!set[cur]) cur = prevPeriod(m.recur, cur);
    while (set[cur] && g++ < 400) { c++; cur = prevPeriod(m.recur, cur); }
    return c;
  }
  function nextDue(n) {
    var m = meta(n); if (!m.recur) return m.due || '';
    var t = today(); if (!doneThisPeriod(n)) return m.due && m.due > t ? m.due : t;
    if (m.recur === 'weekly') return addDays(periodStart('weekly', t), 7);
    if (m.recur === 'monthly') { var d = new Date(t.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); }
    var x = addDays(t, 1); if (m.recur === 'weekdays') while (dow(x) === 0 || dow(x) === 6) x = addDays(x, 1); return x;
  }

  // ---------- computed tree ----------
  var C;
  function compute() {
    var ch = {}, all = nodes();
    all.forEach(function (n) { meta(n); if (n.parentId && !M.items[n.parentId]) n.parentId = ''; (ch[n.parentId || ''] = ch[n.parentId || ''] || []).push(n); });
    Object.keys(ch).forEach(function (k) { ch[k].sort(function (a, b) { return (+a.order || 0) - (+b.order || 0); }); });
    var prog = {}, branch = {}, depth = {};
    function walk(n, d, br) {
      depth[n.id] = d; branch[n.id] = br;
      var c = ch[n.id] || [];
      if (!c.length) { prog[n.id] = { done: leafDone(n) ? 1 : 0, total: 1 }; return prog[n.id]; }
      var dn = 0, t = 0;
      c.forEach(function (x, i) { var p = walk(x, d + 1, meta(x).color || (d === 0 ? PALETTE[i % PALETTE.length] : br)); dn += p.done; t += p.total; });
      prog[n.id] = { done: dn, total: t }; return prog[n.id];
    }
    (ch[''] || []).forEach(function (n, i) { walk(n, 0, meta(n).color || PALETTE[i % PALETTE.length]); });
    var unblocks = {};
    all.forEach(function (n) { deps(n).forEach(function (d) { (unblocks[d] = unblocks[d] || []).push(n.id); }); });
    C = { ch: ch, prog: prog, unblocks: unblocks, branch: branch, depth: depth };
  }
  function kids(id) { return C.ch[id || ''] || []; }
  function leafDone(n) { return meta(n).recur ? doneThisPeriod(n) : n.status === 'done'; }
  function deps(n) { return String(n.links || '').split(',').filter(function (id) { return id && M.items[id] && M.items[id].kind === 'node'; }); }
  function isLeaf(n) { return !kids(n.id).length; }
  function isDone(n) { var p = C.prog[n.id]; return p ? p.done === p.total : leafDone(n); }
  function openDeps(n) { return deps(n).filter(function (d) { return !isDone(M.items[d]); }); }
  function state(n) { if (isDone(n)) return 'done'; if (openDeps(n).length) return 'blocked'; if (n.status === 'doing') return 'doing'; return isLeaf(n) ? 'ready' : 'open'; }
  function due(n) { return nextDue(n); }
  function overdue(n) { var d = due(n); return !!d && !isDone(n) && d < today(); }
  function path(n) { var p = [], cur = n, g = 0; while (cur && cur.parentId && g++ < 60) { cur = M.items[cur.parentId]; if (cur) p.unshift(cur); } return p; }
  function checklist(n) { var b = String(n.body || ''); return { d: (b.match(/^\s*[-*]\s+\[[xX]\]/gm) || []).length, t: (b.match(/^\s*[-*]\s+\[[ xX]\]/gm) || []).length }; }
  function subtree(id, out) { out = out || []; kids(id).forEach(function (c) { out.push(c.id); subtree(c.id, out); }); return out; }
  function isAncestor(a, b) { var cur = M.items[b], g = 0; while (cur && cur.parentId && g++ < 60) { if (cur.parentId === a) return true; cur = M.items[cur.parentId]; } return false; }
  function dependsOn(a, b, seen) { seen = seen || {}; if (a === b) return true; if (seen[a]) return false; seen[a] = 1; return deps(M.items[a]).some(function (d) { return dependsOn(d, b, seen); }); }

  // ---------- filters (shared by all task views) ----------
  function fActive() { var f = M.f; return !!(f.q || f.status !== 'all' || f.pri !== '0' || f.due !== 'any' || f.tag || f.branch); }
  function tagsOfNode(n) { return String(n.tags || '').split(/[\s,]+/).filter(Boolean).map(function (t) { return t.replace(/^#/, '').toLowerCase(); }); }
  function matchLeaf(n) {
    var f = M.f, m = meta(n), s = state(n), d = due(n), t = today();
    if (f.q) { var q = f.q.toLowerCase(); if ((n.title + ' ' + (n.body || '') + ' ' + (n.tags || '')).toLowerCase().indexOf(q) < 0) return false; }
    if (f.status === 'open' && s === 'done') return false;
    if (f.status !== 'all' && f.status !== 'open' && s !== f.status) return false;
    if (+f.pri && (+m.pri || 0) < +f.pri) return false;
    if (f.due === 'overdue' && !overdue(n)) return false;
    if (f.due === 'today' && !(d && d <= t && !isDone(n))) return false;
    if (f.due === 'week' && !(d && d <= addDays(t, 7))) return false;
    if (f.due === 'none' && d) return false;
    if (f.due === 'recur' && !m.recur) return false;
    if (f.tag && tagsOfNode(n).indexOf(f.tag) < 0) return false;
    if (f.branch && n.id !== f.branch && !isAncestor(f.branch, n.id)) return false;
    return true;
  }
  function visible() {
    if (!fActive()) return null;
    var vis = {};
    nodes().forEach(function (n) { if (matchLeaf(n)) { vis[n.id] = 2; path(n).forEach(function (p) { if (!vis[p.id]) vis[p.id] = 1; }); } });
    return vis;
  }
  function filteredLeaves() { return nodes().filter(function (n) { return isLeaf(n) && matchLeaf(n); }); }

  // ---------- storage / sync ----------
  function load() {
    if (M.loading) return; M.loading = true; M.error = '';
    L.api('mindLoad').then(function (r) {
      M.mode = 'remote'; M.offline = false; setAll(r.items || []);
      var local = readLocal();
      if (!r.items.length && local.length) { setAll(local); markAll(); flush(); }
      if (applyPending()) flush();
    }).catch(function (e) {
      if (/Unknown action/i.test(e.message)) { M.mode = 'local'; setAll(readLocal()); }
      else if (/reach the server|Failed to fetch|NetworkError/i.test(e.message) && readStore().items) {
        // Offline: open the last synced copy; edits queue up and sync when the connection returns
        M.mode = 'remote'; M.offline = true; setAll(readStore().items); applyPending();
      }
      else M.error = e.message;
    }).then(function () {
      purgeStarter(); M.loaded = true; M.loading = false; saveStore(); draw();
      if (M.mode === 'remote' && !M.offline) setTimeout(function () { calSync(true); }, 1500);
    });
  }
  // ---------- offline copy (per user, this device) ----------
  function storeKey() { return 'lcm_mind_store_' + L.S.data.me.email; }
  function readStore() { try { return JSON.parse(localStorage.getItem(storeKey()) || '{}'); } catch (e) { return {}; } }
  function saveStore() {
    if (M.mode !== 'remote') return;
    try { localStorage.setItem(storeKey(), JSON.stringify({ items: list().map(serial), pending: { dirty: Object.keys(M.dirty), deleted: Object.keys(M.deleted) }, at: new Date().toISOString() })); } catch (e) {}
  }
  // Re-apply edits that were made offline (or not yet saved when the app closed)
  function applyPending() {
    var st = readStore(), p = st.pending || {}, byId = {}, n = 0;
    (st.items || []).forEach(function (x) { byId[x.id] = x; });
    (p.dirty || []).forEach(function (id) { if (byId[id]) { var o = byId[id]; delete o.m; M.items[id] = o; meta(o); M.dirty[id] = 1; n++; } });
    (p.deleted || []).forEach(function (id) { if (M.items[id]) delete M.items[id]; M.deleted[id] = 1; n++; });
    return n;
  }
  window.addEventListener('online', function () {
    if (!L || !M.loaded) return;
    flush().then(function () { if (M.offline) { M.offline = false; M.loaded = false; if (root && document.body.contains(root)) view(root, L); } });
  });
  function setAll(arr) { M.items = {}; arr.forEach(function (x) { delete x.m; M.items[x.id] = x; meta(x); }); }
  function readLocal() { try { return JSON.parse(localStorage.getItem(localKey()) || '[]'); } catch (e) { return []; } }
  function markAll() { Object.keys(M.items).forEach(function (k) { M.dirty[k] = 1; }); }
  function touch(id) { var n = M.items[id]; if (!n) return; n.updatedAt = new Date().toISOString(); M.dirty[id] = 1; schedule(); }
  function remove(id) { delete M.items[id]; delete M.dirty[id]; M.deleted[id] = 1; schedule(); }
  function schedule() { M.status = M.offline || !navigator.onLine ? 'Offline — will sync' : 'Saving soon…'; setStatus(); clearTimeout(M.saveTimer); M.saveTimer = setTimeout(flush, 800); clearTimeout(M.storeTimer); M.storeTimer = setTimeout(saveStore, 300); }
  function serial(n) { var o = {}; Object.keys(n).forEach(function (k) { if (k !== 'm') o[k] = n[k]; }); var s = JSON.stringify(n.m || {}); o.meta = s === '{}' ? '' : s; return o; }
  function flush() {
    var ups = Object.keys(M.dirty).map(function (k) { return M.items[k]; }).filter(Boolean).map(serial), dels = Object.keys(M.deleted);
    if (!ups.length && !dels.length) return Promise.resolve();
    if (M.mode === 'local') {
      try { localStorage.setItem(localKey(), JSON.stringify(list().map(serial))); } catch (e) { L.toast('Browser storage is full', 'err'); }
      M.dirty = {}; M.deleted = {}; M.status = 'Saved on this device'; setStatus(); return Promise.resolve();
    }
    if (M.saving) { schedule(); return Promise.resolve(); }
    M.saving = true; M.dirty = {}; M.deleted = {}; M.status = 'Saving…'; setStatus();
    return L.api('mindSync', { upserts: ups, deletes: dels }).then(function (r) {
      M.saving = false; M.offline = false; M.status = 'Saved ✓'; setStatus(); try { localStorage.removeItem(localKey()); } catch (e) {} saveStore();
      calStatus(r && r.calendar);
    }).catch(function (e) {
      M.saving = false; ups.forEach(function (u) { if (M.items[u.id]) M.dirty[u.id] = 1; }); dels.forEach(function (d) { M.deleted[d] = 1; });
      var net = /reach the server|Failed to fetch|NetworkError/i.test(e.message); saveStore();
      M.status = net ? 'Offline — will sync' : 'Not saved — retrying'; setStatus(); if (!net) L.toast('My Mind: ' + e.message, 'err');
      clearTimeout(M.saveTimer); M.saveTimer = setTimeout(flush, 5000);
    });
  }
  // ---------- Google Calendar mirror (deadlines → wesleyj84660@gmail.com calendar) ----------
  function calStatus(c) {
    if (!c) return;
    M.calInfo = c;
    var el = $('#calTag'); if (el) el.outerHTML = calTag();
    if (c.pending) { clearTimeout(M.calTimer); M.calTimer = setTimeout(function () { calSync(true); }, 4000); }
  }
  function calTag() {
    var c = M.calInfo;
    if (M.mode === 'local') return '<span class="tag" id="calTag" title="Calendar sync starts once the backend is updated">📅 Calendar: after backend update</span>';
    if (!c) return '<span class="tag" id="calTag">📅 Calendar…</span>';
    if (c.error) return '<span class="tag" id="calTag" style="color:#ff9b9b" title="' + esc(c.error) + '">📅 Calendar error</span>';
    if (c.mode === 'off') return '<span class="tag" id="calTag">📅 Calendar off</span>';
    return '<span class="tag" id="calTag" title="Deadlines appear as all-day events' + (c.mode === 'invite' ? ' (sent as invitations — share your calendar with the portal account to write directly)' : '') + '">📅 ' + esc(c.calendar || 'Google Calendar') + (c.pending ? ' · syncing ' + c.pending : ' ✓') + '</span>';
  }
  function calSync(quiet) {
    if (M.mode !== 'remote') { if (!quiet) L.toast('Calendar sync starts after the backend is updated', 'err'); return; }
    L.api('mindCalSync').then(function (r) {
      calStatus(r.calendar);
      if (!quiet) L.toast('Google Calendar synced' + (r.calendar.changed ? ' — ' + r.calendar.changed + ' events updated' : ' — already up to date'), 'ok');
    }).catch(function (e) { if (/Unknown action/i.test(e.message)) { M.calInfo = { mode: 'off' }; } else if (!quiet) L.toast('Calendar: ' + e.message, 'err'); });
  }
  function setStatus() { var el = $('#mindStatus'); if (el) el.textContent = M.status; }
  window.addEventListener('beforeunload', function () {
    if (!L || (!Object.keys(M.dirty).length && !Object.keys(M.deleted).length)) return;
    if (M.mode === 'remote' && L.API_URL && navigator.sendBeacon) {
      var ups = Object.keys(M.dirty).map(function (k) { return M.items[k]; }).filter(Boolean).map(serial);
      navigator.sendBeacon(L.API_URL, new Blob([JSON.stringify({ action: 'mindSync', token: L.S.token, payload: { upserts: ups, deletes: Object.keys(M.deleted) } })], { type: 'text/plain' }));
    } else flush();
  });
  // One-time clean-up: remove the starter plan that the previous version loaded automatically.
  function purgeStarter() {
    var S = window.LCM_MIND_SEED; if (!S) return;
    var titles = {}, noteTitles = {};
    (function walk(a) { a.forEach(function (x) { titles[x.t] = 1; if (x.c) walk(x.c); }); })(S.tree);
    S.notes.forEach(function (n) { noteTitles[n.t] = 1; });
    var gone = 0;
    list().forEach(function (it) {
      if (it.meta) return; // items created by this version always carry meta
      if ((it.kind === 'node' && titles[it.title]) || (it.kind === 'note' && noteTitles[it.title] && it.updatedAt === it.createdAt)) { remove(it.id); gone++; }
    });
    if (gone) {
      list().forEach(function (it) { if (it.kind === 'node' && it.parentId && !M.items[it.parentId]) { it.parentId = ''; touch(it.id); } });
      L.toast('Cleared ' + gone + ' starter items — the canvas is yours', 'ok');
    }
  }

  // ---------- undo / redo ----------
  function snap() { return JSON.stringify(list().map(serial)); }
  function checkpoint() { M.undo.push(snap()); if (M.undo.length > 60) M.undo.shift(); M.redo = []; }
  function restore(str) {
    var before = {}; list().forEach(function (n) { before[n.id] = JSON.stringify(serial(n)); });
    var arr = JSON.parse(str), after = {};
    M.items = {}; arr.forEach(function (o) { M.items[o.id] = o; meta(o); after[o.id] = JSON.stringify(o); });
    Object.keys(before).forEach(function (id) { if (!after[id]) M.deleted[id] = 1; });
    Object.keys(after).forEach(function (id) { delete M.deleted[id]; if (before[id] !== after[id]) M.dirty[id] = 1; });
    schedule();
  }
  function undo() { if (!M.undo.length) return L.toast('Nothing to undo'); M.redo.push(snap()); restore(M.undo.pop()); draw(); }
  function redo() { if (!M.redo.length) return L.toast('Nothing to redo'); M.undo.push(snap()); restore(M.redo.pop()); draw(); }

  // ---------- mutations ----------
  function newItem(fields) {
    var now = new Date().toISOString(), id = uid();
    var n = Object.assign({ id: id, kind: 'node', parentId: '', title: '', body: '', status: 'todo', links: '', tags: '', order: 0, collapsed: '', createdAt: now, updatedAt: now, meta: '' }, fields);
    n.m = n.m || {}; M.items[id] = n; touch(id); return n;
  }
  function addNode(parentId, afterId, fields) {
    compute();
    var sibs = kids(parentId), order = sibs.length;
    if (afterId) { var idx = sibs.map(function (x) { return x.id; }).indexOf(afterId); order = idx + 1; sibs.slice(order).forEach(function (x) { x.order = (+x.order || 0) + 1; touch(x.id); }); }
    var m = (fields && fields.m) || {};
    var par = M.items[parentId];
    if (par && meta(par).x != null && m.x == null) {
      // keep new boxes next to a manually placed parent on the map
      var ref = afterId ? M.items[afterId] : sibs[sibs.length - 1];
      m.x = meta(par).x + 290; m.y = ref && meta(ref).y != null ? meta(ref).y + 64 : meta(par).y;
    }
    if (par && par.collapsed) { par.collapsed = ''; touch(par.id); }
    var n = newItem(Object.assign({}, fields || {}, { parentId: parentId || '', order: order, m: m }));
    M.sel = n.id; M.multi = {}; return n;
  }
  function setDone(n, done) {
    if (isLeaf(n)) {
      var m = meta(n);
      if (m.recur) { var t = today(), ps = periodStart(m.recur, t); m.done = (m.done || []).filter(function (d) { return d < ps; }); if (done) m.done.push(t); m.done = m.done.slice(-120); }
      else { n.status = done ? 'done' : (n.status === 'done' ? 'todo' : n.status); if (done) m.doneAt = today(); else delete m.doneAt; }
      touch(n.id); return;
    }
    kids(n.id).forEach(function (c) { setDone(c, done); });
  }
  function toggleDone(n) {
    compute();
    var s = state(n), to = !isDone(n);
    if (to && s === 'blocked' && !confirm('"' + n.title + '" is still blocked by ' + openDeps(n).length + ' open link(s). Mark it done anyway?')) return false;
    if (!isLeaf(n) && !confirm((to ? 'Mark all ' : 'Re-open all ') + C.prog[n.id].total + ' sub-tasks of "' + n.title + '"?')) return false;
    checkpoint(); setDone(n, to); compute();
    if (to) {
      var un = (C.unblocks[n.id] || []).map(function (x) { return M.items[x]; }).filter(function (x) { return x && state(x) === 'ready'; });
      if (un.length) L.toast('Unblocked: ' + un.map(function (x) { return x.title; }).join(', '), 'ok');
      else if (meta(n).recur) L.toast('Done for ' + (meta(n).recur === 'weekly' ? 'this week' : meta(n).recur === 'monthly' ? 'this month' : 'today') + ' · streak ' + streak(n), 'ok');
    }
    return true;
  }
  function removeTree(id) {
    subtree(id).concat([id]).forEach(function (x) {
      nodes().forEach(function (o) { var l = deps(o); if (l.indexOf(x) >= 0) { o.links = l.filter(function (y) { return y !== x; }).join(','); touch(o.id); } });
      remove(x);
    });
  }
  function delNodes(ids) {
    compute();
    ids = ids.filter(function (id) { return M.items[id] && !ids.some(function (o) { return o !== id && isAncestor(o, id); }); });
    if (!ids.length) return;
    var cnt = ids.reduce(function (s, id) { return s + 1 + subtree(id).length; }, 0);
    var name = ids.length === 1 ? '"' + (M.items[ids[0]].title || 'Untitled') + '"' : ids.length + ' items';
    if (!confirm('Delete ' + name + (cnt > ids.length ? ' and ' + (cnt - ids.length) + ' sub-tasks' : '') + '? (Undo brings it back)')) return;
    checkpoint();
    var first = M.items[ids[0]], sibs = kids(first.parentId), i = sibs.indexOf(first);
    ids.forEach(removeTree);
    var next = (sibs[i + 1] && M.items[sibs[i + 1].id]) || (sibs[i - 1] && M.items[sibs[i - 1].id]) || M.items[first.parentId];
    M.sel = next ? next.id : null; M.multi = {};
    draw();
  }
  function duplicate(id) {
    var src = M.items[id]; if (!src) return; checkpoint(); compute();
    var map = {};
    function copy(n, parentId, order) {
      var m = JSON.parse(JSON.stringify(meta(n))); if (m.x != null) { m.x += 30; m.y += 30; } m.done = []; delete m.doneAt;
      var c = newItem({ parentId: parentId, title: n.title + (n.id === id ? ' (copy)' : ''), body: n.body, status: n.status === 'done' ? 'todo' : n.status, tags: n.tags, order: order, collapsed: n.collapsed, links: n.links, m: m });
      map[n.id] = c.id; kids(n.id).forEach(function (k, i) { copy(k, c.id, i); }); return c;
    }
    var top = copy(src, src.parentId, (+src.order || 0) + 0.5);
    Object.keys(map).forEach(function (o) { var c = M.items[map[o]]; c.links = deps(c).map(function (d) { return map[d] || d; }).join(','); });
    compute(); kids(src.parentId).forEach(function (x, i) { x.order = i; touch(x.id); });
    M.sel = top.id; draw();
  }
  function setField(n, key, val, isMeta) {
    checkpoint();
    if (isMeta) { var m = meta(n); if (val === '' || val == null) delete m[key]; else m[key] = val; } else n[key] = val;
    touch(n.id);
  }
  function addDep(target, src) {
    if (!target || !src || target.id === src.id) return false;
    if (isAncestor(target.id, src.id) || isAncestor(src.id, target.id)) { L.toast('Can\'t link a task to its own branch', 'err'); return false; }
    if (dependsOn(src.id, target.id)) { L.toast('That link would create a loop', 'err'); return false; }
    if (deps(target).indexOf(src.id) >= 0) return false;
    checkpoint(); target.links = deps(target).concat([src.id]).join(','); touch(target.id); return true;
  }
  function inbox() {
    compute();
    var b = kids('').filter(function (x) { return x.title === 'Inbox'; })[0];
    return b || newItem({ title: 'Inbox', order: kids('').length, m: { icon: '📥' } });
  }

  // ---------- quick add: "Call vendor tomorrow !high #parts >Electronics every day" ----------
  function parseQuick(text) {
    var t = today(), m = {}, tags = [], title = ' ' + text.trim(), parent = null;
    function take(re, fn) { title = title.replace(re, function () { fn.apply(null, arguments); return ' '; }); }
    take(/\s!(urgent|high|med(?:ium)?|low)\b/i, function (a, p) { m.pri = { urgent: 4, high: 3, med: 2, medium: 2, low: 1 }[p.toLowerCase()]; });
    take(/\s#([\w\-/]+)/g, function (a, tg) { tags.push(tg); });
    take(/\s>([^!#>]+?)(?=\s(?:!|#|today|tomorrow|every|daily|weekly|monthly|on\s|by\s|due\s|\d{4}-)|\s*$)/i, function (a, b) { parent = b.trim(); });
    var END = '(?=\\s*$|\\s+(?:!|#|>|every|by\\s|on\\s|due\\s|today|tomorrow|tmrw|next\\sweek|in\\s\\d|\\d{4}-|daily|weekly|monthly|weekdays))';
    function T(src, fn) { take(new RegExp(src, 'i'), fn); }
    T('\\severy\\s?(?:day|morning|evening|night)\\b|\\severyday\\b|\\sdaily' + END, function () { m.recur = 'daily'; });
    T('\\severy\\s?weekday\\b|\\sweekdays' + END, function () { m.recur = 'weekdays'; });
    T('\\severy\\s?week\\b|\\sweekly' + END, function () { m.recur = 'weekly'; });
    T('\\severy\\s?month\\b|\\smonthly' + END, function () { m.recur = 'monthly'; });
    var PRE = '\\s(?:(?:by|on|due)\\s)';
    T('(?:' + PRE + '|\\s)(?:today|tonight)' + END, function () { m.due = t; });
    T('(?:' + PRE + '|\\s)(?:tomorrow|tmrw|tmr)' + END, function () { m.due = addDays(t, 1); });
    T('(?:' + PRE + '|\\s)next\\sweek' + END, function () { m.due = addDays(periodStart('weekly', t), 7); });
    T('(?:' + PRE + '|\\s)in\\s(\\d+)\\s?(d|days?|w|weeks?)' + END, function (a, n, u) { m.due = addDays(t, +n * (/^w/i.test(u) ? 7 : 1)); });
    T('(?:' + PRE + '|\\s)(\\d{4}-\\d{2}-\\d{2})' + END, function (a, d) { m.due = d; });
    T('(?:' + PRE + '|\\s)(mon|tues?|wed|thu(?:rs)?|fri|sat|sun)(?:day|nesday|urday)?' + END, function (a, d) { var want = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(d.toLowerCase().slice(0, 3)), x = addDays(t, 1); while (dow(x) !== want) x = addDays(x, 1); m.due = x; });
    return { title: title.replace(/\s+/g, ' ').trim(), m: m, tags: tags, parent: parent };
  }
  function quickAdd(text, forcedParent) {
    var q = parseQuick(text); if (!q.title) return null;
    var pid;
    if (forcedParent !== undefined) pid = forcedParent;
    else if (q.parent) {
      var hit = nodes().filter(function (x) { return x.title.toLowerCase() === q.parent.toLowerCase(); })[0] || nodes().filter(function (x) { return x.title.toLowerCase().indexOf(q.parent.toLowerCase()) === 0; })[0];
      pid = hit ? hit.id : newItem({ title: q.parent, order: (compute(), kids('').length) }).id;
    } else if (M.sel && M.items[M.sel] && (compute(), !isLeaf(M.items[M.sel]))) pid = M.sel;
    else pid = inbox().id;
    return addNode(pid, null, { title: q.title, tags: q.tags.join(', '), m: q.m });
  }

  // ---------- shell ----------
  var root;
  function view(c, app) {
    L = app; root = c;
    var h = (location.hash || '').slice(1); if (h && VIEWS.some(function (v) { return v[0] === h; })) { M.tab = h; history.replaceState(null, '', location.pathname + location.search); }
    if (!M.loaded) { c.innerHTML = '<div class="card empty">Opening your mind…</div>'; load(); return; }
    draw();
  }
  var TASKVIEWS = ['tree', 'map', 'board', 'timeline', 'calendar'];
  function draw() {
    if (!root || !document.body.contains(root)) return;
    var act = document.activeElement, focusId = act && act.id && root.contains(act) ? act.id : null, selStart = null;
    try { selStart = focusId ? act.selectionStart : null; } catch (e) {}
    if (M.error) { root.innerHTML = '<div class="card empty">Could not load My Mind: ' + esc(M.error) + '<br><br><button class="btn sm" id="mRetry">Retry</button></div>'; $('#mRetry').onclick = function () { M.loaded = false; M.error = ''; view(root, L); }; return; }
    compute(); savePrefs();
    var isTask = TASKVIEWS.indexOf(M.tab) >= 0;
    var html = (M.offline ? '<div class="alert amber">Offline — showing your last synced copy. Changes are kept on this device and sync automatically when you reconnect.</div>' : '') + (M.mode === 'local' ? '<div class="alert amber">Saved on this device only — update the Apps Script backend to sync My Mind to Google Sheets (it uploads automatically once updated).</div>' : '') +
      '<div class="toolbar mind-top"><div class="seg">' + VIEWS.map(function (t) { return '<button data-mtab="' + t[0] + '" class="' + (M.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<span class="spacer"></span><button class="btn ghost sm" id="mUndo" title="Undo (Ctrl+Z)"' + (M.undo.length ? '' : ' disabled') + '>↶ Undo</button><button class="btn ghost sm" id="mRedo" title="Redo (Ctrl+Y)"' + (M.redo.length ? '' : ' disabled') + '>↷</button>' +
      '<span class="small dim nowrap" id="mindStatus">' + esc(M.status || (M.mode === 'local' ? 'Saved on this device' : 'All changes saved')) + '</span>' +
      (L.APP === 'mind' ? '' : '<a class="btn sm" href="/mind/" target="_blank" rel="noopener" title="Open My Mind as its own app (installable)">📲 Get the app</a>') +
      '<button class="btn sm" id="mManage">⚙ Manage</button>' + calTag() + '<span class="tag hide-sm">🔒 Private</span></div>';
    if (isTask) html += filterBar();
    html += '<div id="mindBody"></div>';
    root.innerHTML = html;
    $$('[data-mtab]', root).forEach(function (b) { b.onclick = function () { M.tab = b.dataset.mtab; draw(); }; });
    $('#mUndo', root).onclick = undo; $('#mRedo', root).onclick = redo;
    $('#mManage', root).onclick = manageMenu;
    if (isTask) bindFilterBar();
    var body = $('#mindBody', root);
    if (isTask && !nodes().length) { body.innerHTML = emptyState(); bindEmpty(body); }
    else ({ tree: drawTree, map: drawMap, board: drawBoard, timeline: drawTimeline, calendar: drawCalendar, notes: drawNotes, graph: drawGraph })[M.tab](body);
    if (focusId) { var f = document.getElementById(focusId); if (f && f !== document.activeElement) { f.focus(); try { if (selStart != null) f.setSelectionRange(selStart, selStart); } catch (e) {} } }
  }
  function filterBar() {
    var f = M.f, tags = {}, branches = kids('');
    nodes().forEach(function (n) { tagsOfNode(n).forEach(function (t) { tags[t] = 1; }); });
    function opt(v, l, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; }
    return '<div class="toolbar mind-filters"><input class="input qadd" id="mQuick" placeholder="+ Quick add — e.g. Call vendor tomorrow !high #parts >Electronics every day" autocomplete="off">' +
      '<input class="input search" id="mq" placeholder="Search…" value="' + esc(f.q) + '">' +
      '<select class="input" id="fStatus">' + [['all', 'All status'], ['ready', 'Ready'], ['doing', 'Doing'], ['blocked', 'Blocked'], ['open', 'Not done'], ['done', 'Done']].map(function (o) { return opt(o[0], o[1], f.status); }).join('') + '</select>' +
      '<select class="input" id="fDue">' + [['any', 'Any date'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Next 7 days'], ['none', 'No date'], ['recur', 'Repeating']].map(function (o) { return opt(o[0], o[1], f.due); }).join('') + '</select>' +
      '<select class="input" id="fPri">' + [['0', 'Any priority'], ['2', 'Medium +'], ['3', 'High +'], ['4', 'Urgent']].map(function (o) { return opt(o[0], o[1], f.pri); }).join('') + '</select>' +
      (Object.keys(tags).length ? '<select class="input" id="fTag">' + opt('', 'Any tag', f.tag) + Object.keys(tags).sort().map(function (t) { return opt(t, '#' + t, f.tag); }).join('') + '</select>' : '') +
      (branches.length > 1 ? '<select class="input" id="fBranch">' + opt('', 'All branches', f.branch) + branches.map(function (b) { return opt(b.id, b.title || 'Untitled', f.branch); }).join('') + '</select>' : '') +
      (fActive() ? '<button class="btn ghost sm" id="fClear">✕ Clear filters</button>' : '') + '</div>';
  }
  function bindFilterBar() {
    var qa = $('#mQuick', root);
    qa.onkeydown = function (e) {
      if (e.key !== 'Enter' || !qa.value.trim()) return;
      checkpoint(); var n = quickAdd(qa.value); if (!n) { M.undo.pop(); return; }
      L.toast('Added "' + n.title + '" to ' + ((M.items[n.parentId] || {}).title || 'top level') + (meta(n).due ? ' · due ' + dueLabel(meta(n).due) : '') + (meta(n).recur ? ' · ' + RECUR[meta(n).recur].toLowerCase() : ''), 'ok');
      qa.value = ''; draw(); var q2 = $('#mQuick', root); if (q2) q2.focus();
    };
    var q = $('#mq', root), tmr; q.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { M.f.q = q.value; draw(); }, 200); };
    [['#fStatus', 'status'], ['#fDue', 'due'], ['#fPri', 'pri'], ['#fTag', 'tag'], ['#fBranch', 'branch']].forEach(function (p) { var el = $(p[0], root); if (el) el.onchange = function () { M.f[p[1]] = el.value; draw(); }; });
    if ($('#fClear', root)) $('#fClear', root).onclick = function () { M.f = NOFILTER(); draw(); };
  }
  function emptyState() {
    return '<div class="card mind-empty"><div style="font-size:42px">🧠</div><h2>Your mind is a blank canvas</h2><p class="muted">Start a branch, type into Quick add above, paste a whole list, or load the sample to explore.</p>' +
      '<div class="row wrap" style="justify-content:center;margin-top:16px"><button class="btn primary" id="eFirst">+ First branch</button><button class="btn" id="eImport">Paste a list / outline</button><button class="btn" id="eSample">Load sample plan</button></div>' +
      '<p class="small dim" style="margin-top:18px">Quick add understands <code>tomorrow</code> <code>fri</code> <code>2026-12-01</code> <code>in 3 days</code> · <code>!high</code> · <code>#tag</code> · <code>every day</code> · <code>&gt;Branch</code></p></div>';
  }
  function bindEmpty(el) {
    $('#eFirst', el).onclick = function () { checkpoint(); var n = addNode('', null, { title: '' }); draw(); startRename(n.id); };
    $('#eImport', el).onclick = importOutlineModal;
    $('#eSample', el).onclick = loadSample;
  }

  // ---------- Manage menu ----------
  function manageMenu(e) {
    e.stopPropagation();
    ctx(e, [
      ['📥 Paste a list / outline…', importOutlineModal], ['🧪 Load sample plan', loadSample], null,
      ['📅 Sync Google Calendar now', function () { calSync(false); }], null,
      ['⬇ Export backup (JSON)', exportJson], ['⬆ Restore from backup…', importJsonFile], ['⬇ Export outline (Markdown)', exportOutline], ['⬇ Export tasks (CSV)', exportCsv], null,
      ['🧹 Clear all tasks…', function () { clearAll('node'); }], ['🧹 Clear all notes…', function () { clearAll('note'); }], ['🗑 Clear everything…', function () { clearAll('all'); }]
    ], e.currentTarget);
  }
  function ctx(e, items, anchor) {
    closeMenu(); var m = document.createElement('div'); m.className = 'ctx-menu'; m.id = 'ctxMenu';
    m.innerHTML = items.map(function (it, i) { return it ? '<div data-i="' + i + '">' + esc(it[0]) + '</div>' : '<hr>'; }).join('');
    document.body.appendChild(m);
    var x = e.clientX, y = e.clientY;
    if (anchor) { var r = anchor.getBoundingClientRect(); x = r.right - m.offsetWidth; y = r.bottom + 6; }
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, x)) + 'px'; m.style.top = Math.max(8, Math.min(window.innerHeight - m.offsetHeight - 8, y)) + 'px';
    m.onclick = function (ev) { var d = ev.target.closest('[data-i]'); if (!d) return; closeMenu(); items[+d.dataset.i][1](); };
    setTimeout(function () { document.addEventListener('pointerdown', function out(ev) { if (!ev.target.closest('#ctxMenu')) { closeMenu(); document.removeEventListener('pointerdown', out); } }); }, 0);
  }
  function closeMenu() { var m = $('#ctxMenu'); if (m) m.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  function clearAll(kind) {
    var victims = list().filter(function (x) { return kind === 'all' || x.kind === kind; });
    if (!victims.length) return L.toast('Nothing to clear');
    var label = kind === 'node' ? victims.length + ' tasks' : kind === 'note' ? victims.length + ' notes' : 'all ' + victims.length + ' tasks and notes';
    var typed = prompt('This deletes ' + label + '. You can still Undo right after.\nType CLEAR to confirm:');
    if (!typed || typed.trim().toUpperCase() !== 'CLEAR') return L.toast('Nothing was cleared');
    checkpoint(); victims.forEach(function (x) { remove(x.id); });
    M.sel = null; M.multi = {}; M.note = null; M.mapOpt.focus = null; M.f = NOFILTER(); L.toast('Cleared ' + label + ' — ↶ Undo brings them back', 'ok'); draw();
  }
  function loadSample() {
    var S = window.LCM_MIND_SEED; if (!S) return;
    if (!confirm('Add the sample LCM plan (103 linked tasks, 9 notes)? Clear it any time from Manage.')) return;
    checkpoint(); compute();
    var key = {}, pend = [], base = kids('').length;
    function add(n, pid, i) {
      var it = newItem({ parentId: pid || '', title: n.t, body: n.b || '', status: n.s === 'done' ? 'done' : n.s === 'doing' ? 'doing' : 'todo', order: i, collapsed: pid && n.c ? 'true' : '', m: { sample: 1 } });
      if (n.k) key[n.k] = it.id; pend.push([it, n.d || []]); (n.c || []).forEach(function (c, j) { add(c, it.id, j); });
    }
    S.tree.forEach(function (n, i) { add(n, '', base + i); });
    pend.forEach(function (p) { p[0].links = p[1].map(function (k) { return key[k]; }).filter(Boolean).join(','); });
    S.notes.forEach(function (n, i) { if (!noteByTitle(n.t)) newItem({ kind: 'note', title: n.t, body: n.b, tags: n.tags || '', status: '', order: i, m: { sample: 1 } }); });
    M.view.fitted = false; draw(); L.toast('Sample plan added', 'ok');
  }
  function importOutlineModal() {
    compute();
    L.modal('<h3>Paste a list or outline</h3><p class="small muted" style="margin-top:-8px">One task per line. Indent (2 spaces or Tab) for sub-tasks. Bullets (<code>-</code> <code>*</code> <code>1.</code>) and checkboxes (<code>[x]</code>) are understood. Quick-add words (<code>tomorrow</code>, <code>!high</code>, <code>#tag</code>, <code>every day</code>) work on every line.</p>' +
      '<textarea class="input" id="ioText" style="min-height:260px;font-family:ui-monospace,monospace" placeholder="Launch prep\n  Order parts tomorrow !high\n  [x] Book test track\n  Write test plan fri\nDaily routine\n  Check emails every day\n  Review team reports every weekday"></textarea>' +
      '<label class="field" style="margin-top:12px"><span>Put under</span><select class="input" id="ioParent"><option value="">Top level (new branches)</option>' + nodes().filter(function (n) { return !isLeaf(n) || !n.parentId; }).map(function (n) { return '<option value="' + n.id + '"' + (n.id === M.sel ? ' selected' : '') + '>' + esc(n.title) + '</option>'; }).join('') + '</select></label>' +
      '<div class="row"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="ioGo">Import</button></div>', function (m) {
      $('#ioGo', m).onclick = function () {
        var txt = $('#ioText', m).value; if (!txt.trim()) return;
        checkpoint(); var stack = [{ ind: -1, id: $('#ioParent', m).value }], count = 0;
        txt.replace(/\t/g, '  ').split('\n').forEach(function (line) {
          if (!line.trim()) return;
          var ind = line.match(/^\s*/)[0].length, s = line.trim().replace(/^([-*+]|\d+[.)])\s+/, ''), done = false;
          s = s.replace(/^\[( |x|X)\]\s*/, function (a, x) { done = x !== ' '; return ''; });
          while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
          var it = quickAdd(s, stack[stack.length - 1].id || '');
          if (it) { if (done) it.status = 'done'; count++; stack.push({ ind: ind, id: it.id }); }
        });
        L.closeModal(); M.view.fitted = false; draw(); L.toast('Imported ' + count + ' items', 'ok');
      };
    });
  }
  function exportJson() { download('my-mind-backup-' + today() + '.json', JSON.stringify({ version: 2, exported: new Date().toISOString(), items: list().map(serial) }, null, 1), 'application/json'); }
  function importJsonFile() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var data = JSON.parse(rd.result), arr = data.items || data; if (!Array.isArray(arr)) throw new Error('not a My Mind backup');
          if (!confirm('Restore ' + arr.length + ' items from this backup? Items with the same id are replaced; others are kept.')) return;
          checkpoint(); arr.forEach(function (o) { if (!o.id || !o.kind) return; delete o.m; M.items[o.id] = o; meta(o); M.dirty[o.id] = 1; delete M.deleted[o.id]; });
          schedule(); draw(); L.toast('Restored ' + arr.length + ' items', 'ok');
        } catch (e) { L.toast('Could not read backup: ' + e.message, 'err'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }
  function exportOutline() {
    compute(); var out = [];
    (function walk(ns, d) { ns.forEach(function (n) { var m = meta(n); out.push(new Array(d + 1).join('  ') + '- [' + (isDone(n) ? 'x' : ' ') + '] ' + n.title + (m.due ? ' (due ' + m.due + ')' : '') + (m.recur ? ' (' + RECUR[m.recur] + ')' : '')); walk(kids(n.id), d + 1); }); })(kids(''), 0);
    download('my-mind-outline-' + today() + '.md', out.join('\n'), 'text/markdown');
  }
  function exportCsv() {
    compute();
    var rows = [['Path', 'Task', 'Status', 'Priority', 'Start', 'Due', 'Repeat', 'Estimate (h)', 'Tags', 'Depends on']];
    nodes().filter(isLeaf).forEach(function (n) { var m = meta(n); rows.push([path(n).map(function (p) { return p.title; }).join(' / '), n.title, STATE_LABEL[state(n)], PRI[+m.pri || 0], m.start || '', due(n) || '', RECUR[m.recur || ''], m.est || '', n.tags || '', deps(n).map(function (d) { return M.items[d].title; }).join('; ')]); });
    download('my-mind-tasks-' + today() + '.csv', rows.map(function (r) { return r.map(function (v) { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'text/csv');
  }

  // ---------- Inspector: one side panel shared by Tree, Map, Board, Timeline, Calendar ----------
  function inspector() {
    var n = M.items[M.sel];
    if (Object.keys(M.multi).length > 1) return multiPanel();
    if (!n || n.kind !== 'node') return agenda();
    var m = meta(n), s = state(n), p = C.prog[n.id], leaf = isLeaf(n), cl = checklist(n), dl = deps(n), ub = C.unblocks[n.id] || [];
    var users = (L.S.data.users || []).filter(function (u) { return u.active; });
    var per = m.recur === 'weekly' ? 'this week' : m.recur === 'monthly' ? 'this month' : 'today';
    return '<div class="crumbs small dim">' + (path(n).map(function (x) { return '<a href="#" data-goto="' + x.id + '">' + esc(x.title || 'Untitled') + '</a>'; }).join(' › ') || 'Top level') + '</div>' +
      '<div class="row" style="gap:6px">' + (m.icon ? '<span class="ins-icon">' + esc(m.icon) + '</span>' : '') + '<input class="input mtitle" id="iTitle" value="' + esc(n.title) + '" placeholder="Task name"></div>' +
      '<div class="row wrap" style="margin:12px 0">' +
      (leaf ? (m.recur ? '<button class="btn sm ' + (leafDone(n) ? 'success' : '') + '" id="iDoneRec">' + (leafDone(n) ? '✓ Done ' + per : 'Mark done ' + per) + '</button><span class="small muted">🔥 streak ' + streak(n) + '</span>'
        : '<div class="seg">' + [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']].map(function (k) { return '<button data-istatus="' + k[0] + '" class="' + ((n.status || 'todo') === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>')
        : '<span class="small muted">' + p.done + ' / ' + p.total + ' sub-tasks done</span>') +
      '<span class="chip c-' + s + '">' + STATE_LABEL[s] + '</span>' + (overdue(n) ? '<span class="chip c-blocked">Overdue</span>' : '') + '</div>' +
      (!leaf ? '<div class="progress" style="margin-bottom:12px"><span style="width:' + Math.round(p.done / p.total * 100) + '%;background:#22c55e"></span></div>' : '') +
      (m.recur ? '<div class="rec-dots">' + recentDots(n) + '</div>' : '') +
      '<div class="ins-grid">' +
      '<label><span>Start</span><input class="input" type="date" id="iStart" value="' + esc(m.start || '') + '"></label>' +
      '<label><span>Due / deadline</span><input class="input" type="date" id="iDue" value="' + esc(m.due || '') + '"></label>' +
      '<div class="quick-dates">' + ((m.due || m.recur) && isLeaf(n) ? '<span class="small dim" title="Mirrored as an all-day event">📅 In Google Calendar</span>' : '') + '<button data-qd="0">Today</button><button data-qd="1">Tomorrow</button><button data-qd="w">Next week</button><button data-qd="m">+1 month</button><button data-qd="x">Clear</button></div>' +
      '<label><span>Repeat</span><select class="input" id="iRecur">' + Object.keys(RECUR).map(function (k) { return '<option value="' + k + '"' + ((m.recur || '') === k ? ' selected' : '') + '>' + RECUR[k] + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Priority</span><select class="input" id="iPri">' + PRI.map(function (l, i) { return '<option value="' + i + '"' + ((+m.pri || 0) === i ? ' selected' : '') + '>' + (i ? '⚑ ' : '') + l + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Estimate (hours)</span><input class="input" type="number" min="0" step="0.5" id="iEst" value="' + esc(m.est || '') + '"></label>' +
      '<label><span>Owner</span><select class="input" id="iWho"><option value="">Me</option>' + users.map(function (u) { return '<option value="' + esc(u.email) + '"' + (m.who === u.email ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="full"><span>Tags</span><input class="input" id="iTags" value="' + esc(n.tags || '') + '" placeholder="parts, vendor, follow-up"></label></div>' +
      '<div class="small muted" style="margin-top:12px">Colour & icon</div><div class="swatches">' + COLORS.map(function (c) { return '<button data-color="' + c + '" class="' + ((m.color || '') === c ? 'on' : '') + '" style="background:' + (c || 'transparent') + '" title="' + (c || 'Default') + '">' + (c ? '' : '∅') + '</button>'; }).join('') + '</div>' +
      '<div class="icons">' + ICONS.map(function (ic) { return '<button data-icon="' + ic + '" class="' + ((m.icon || '') === ic ? 'on' : '') + '">' + (ic || '∅') + '</button>'; }).join('') + '</div>' +
      '<div class="small muted" style="margin-top:14px">Depends on (must be done first)</div>' + (dl.length ? dl.map(function (id) { return linkRow(M.items[id], true); }).join('') : '<div class="dim small">No links</div>') +
      '<div class="dep-add"><input class="input" id="iDepQ" placeholder="+ Link a task this depends on…" autocomplete="off"><div id="iDepList" class="dep-list"></div></div>' +
      '<div class="small muted" style="margin-top:12px">Unblocks</div>' + (ub.length ? ub.map(function (id) { return linkRow(M.items[id]); }).join('') : '<div class="dim small">Nothing waits on this</div>') +
      '<div class="small muted" style="margin-top:14px">Sub-notes & checklist ' + (cl.t ? '<span class="chip c-' + (cl.d === cl.t ? 'done' : 'open') + '">☑ ' + cl.d + '/' + cl.t + '</span>' : '') + '</div>' +
      '<textarea class="input" id="iBody" style="min-height:110px" placeholder="Markdown notes. - [ ] checklist items, [[Note]] links, URLs…">' + esc(n.body || '') + '</textarea>' +
      '<div class="md small ins-md" id="iMd">' + md(n.body || '') + '</div>' +
      '<div class="row wrap" style="margin-top:14px"><button class="btn sm" id="iChild">+ Sub-task</button><button class="btn sm" id="iSib">+ Sibling</button><button class="btn sm" id="iDup">Duplicate</button>' +
      (M.tab !== 'map' ? '<button class="btn sm" id="iOnMap">Show on map</button>' : '<button class="btn sm" id="iInTree">Show in tree</button>') +
      '<span class="spacer"></span><button class="btn danger sm" id="iDel">Delete</button></div>' +
      '<div class="small dim" style="margin-top:10px">Created ' + fmtD(String(n.createdAt).slice(0, 10)) + ' · edited ' + fmtAgo(n.updatedAt) + ' ago' + (m.doneAt ? ' · completed ' + fmtD(m.doneAt) : '') + '</div>';
  }
  function multiPanel() {
    var ids = Object.keys(M.multi).filter(function (id) { return M.items[id]; });
    return '<h3>' + ids.length + ' selected</h3><p class="small muted">Apply to all selected:</p><div class="row wrap"><button class="btn sm" data-bulk="done">✓ Mark done</button><button class="btn sm" data-bulk="todo">↺ Not done</button><button class="btn sm" data-bulk="today">📅 Due today</button><button class="btn sm" data-bulk="tomorrow">📅 Tomorrow</button><button class="btn sm" data-bulk="high">⚑ High</button><button class="btn sm" data-bulk="reset">📍 Reset position</button><button class="btn danger sm" data-bulk="delete">Delete</button></div>' +
      '<div class="small muted" style="margin-top:12px">Colour</div><div class="swatches">' + COLORS.map(function (c) { return '<button data-bulkcolor="' + c + '" style="background:' + (c || 'transparent') + '">' + (c ? '' : '∅') + '</button>'; }).join('') + '</div>' +
      ids.slice(0, 30).map(function (id) { return linkRow(M.items[id]); }).join('') + '<p class="small dim">Esc clears the selection.</p>';
  }
  function recentDots(n) {
    var m = meta(n), set = {}; (m.done || []).forEach(function (d) { set[d] = 1; });
    var out = '', t = today();
    for (var i = 13; i >= 0; i--) { var d = addDays(t, -i); out += '<span title="' + d + '" class="' + (set[d] ? 'on' : '') + (d === t ? ' today' : '') + '"></span>'; }
    return out + '<em class="small dim">last 14 days</em>';
  }
  function linkRow(n, removable) {
    var s = state(n);
    return '<div class="lrow" data-goto="' + n.id + '"><span class="dot" style="background:' + STATE_COLOR[s] + '"></span><span class="lt">' + esc(n.title || 'Untitled') + '</span><span class="dim small nowrap">' + esc(trunc((M.items[n.parentId] || {}).title || '', 22)) + '</span>' +
      (removable ? '<button class="btn ghost sm" data-undep="' + n.id + '" title="Remove link">×</button>' : '') + '</div>';
  }
  function byDue(a, b) { var x = due(a) || '9999', y = due(b) || '9999'; return x < y ? -1 : x > y ? 1 : 0; }
  function agenda() {
    var t = today(), leaves = nodes().filter(function (n) { return isLeaf(n) && !isDone(n); });
    var od = leaves.filter(overdue).sort(byDue), td = leaves.filter(function (n) { return due(n) === t && !meta(n).recur; }), wk = leaves.filter(function (n) { var d = due(n); return d > t && d <= addDays(t, 7) && !meta(n).recur; }).sort(byDue);
    var rec = nodes().filter(function (n) { return isLeaf(n) && meta(n).recur && (meta(n).recur !== 'weekdays' || (dow(t) > 0 && dow(t) < 6)); });
    var recDone = rec.filter(leafDone).length;
    var ready = leaves.filter(function (n) { return state(n) === 'ready' && !due(n); }).sort(function (a, b) { return (+meta(b).pri || 0) - (+meta(a).pri || 0); }).slice(0, 8);
    function sec(title, arr, cls) { return arr.length ? '<div class="small muted ag-h ' + (cls || '') + '">' + title + ' <span class="dim">' + arr.length + '</span></div>' + arr.slice(0, 12).map(agRow).join('') : ''; }
    return '<h3>Today · ' + fmtD(t) + '</h3>' +
      (rec.length ? '<div class="ag-rec"><div class="row"><b>Routine</b><span class="spacer"></span><span class="small">' + recDone + ' / ' + rec.length + ' done</span></div><div class="progress" style="margin:6px 0 8px"><span style="width:' + Math.round(recDone / rec.length * 100) + '%;background:#22c55e"></span></div>' + rec.map(agRow).join('') + '</div>' : '') +
      sec('Overdue', od, 'overdue') + sec('Due today', td) + sec('Next 7 days', wk) + sec('Ready — nothing blocking', ready) +
      (!od.length && !td.length && !wk.length && !ready.length && !rec.length ? '<div class="dim small">Nothing scheduled yet. Add dates in this panel or with Quick add (“tomorrow”, “fri”, “every day”).</div>' : '') +
      '<p class="small dim" style="margin-top:14px">Select any task to edit its dates, repeat, priority, notes and links.</p>';
  }
  function agRow(n) {
    var m = meta(n), d = due(n);
    return '<div class="lrow ag" data-goto="' + n.id + '"><input type="checkbox" data-check="' + n.id + '"' + (isDone(n) ? ' checked' : '') + '><span class="lt">' + esc(m.icon ? m.icon + ' ' : '') + esc(n.title) + '</span>' +
      (m.pri >= 3 ? '<span style="color:' + PRI_COLOR[m.pri] + '">⚑</span>' : '') + (d && !m.recur ? '<span class="small nowrap ' + (overdue(n) ? 'overdue' : 'dim') + '">' + dueLabel(d) + '</span>' : '') + (m.recur ? '<span class="dim small">↻</span>' : '') + '</div>';
  }
  function bindInspector(el, redraw) {
    el.onclick = function (e) {
      var t = e.target, a;
      if ((a = t.closest('[data-undep]'))) { e.stopPropagation(); var cur = M.items[M.sel]; checkpoint(); cur.links = deps(cur).filter(function (x) { return x !== a.dataset.undep; }).join(','); touch(cur.id); redraw(); return; }
      if (t.dataset.check || t.closest('#iDepList')) return;
      if ((a = t.closest('[data-bulk]'))) { bulk(a.dataset.bulk); return; }
      if ((a = t.closest('[data-bulkcolor]'))) { checkpoint(); Object.keys(M.multi).forEach(function (id) { var x = M.items[id]; if (!x) return; if (a.dataset.bulkcolor) meta(x).color = a.dataset.bulkcolor; else delete meta(x).color; touch(id); }); redraw(); return; }
      if ((a = t.closest('.md [data-wiki]'))) { e.preventDefault(); openWiki(a.dataset.wiki); return; }
      if ((a = t.closest('[data-goto]'))) { e.preventDefault(); select(a.dataset.goto); }
    };
    el.onchange = function (e) {
      var id = e.target.dataset.check;
      if (id) { if (!toggleDone(M.items[id])) e.target.checked = !e.target.checked; redraw(); return; }
      var ln = e.target.dataset.line, n0 = M.items[M.sel];
      if (ln != null && n0) { checkpoint(); var lines = n0.body.split('\n'); lines[+ln] = lines[+ln].replace(/\[( |x|X)\]/, e.target.checked ? '[x]' : '[ ]'); n0.body = lines.join('\n'); touch(n0.id); redraw(); }
    };
    var n = M.items[M.sel]; if (!n || n.kind !== 'node' || Object.keys(M.multi).length > 1) return;
    function on(id, ev, fn) { var x = $('#' + id, el); if (x) x[ev] = fn; }
    on('iTitle', 'onchange', function () { var v = this.value.trim(); if (v && v !== n.title) { setField(n, 'title', v); redraw(); } });
    on('iTitle', 'onkeydown', function (e) { if (e.key === 'Enter') this.blur(); });
    $$('[data-istatus]', el).forEach(function (b) {
      b.onclick = function () {
        var to = b.dataset.istatus;
        if (to === 'done') { toggleDone(n); }
        else { checkpoint(); if (n.status === 'done') setDone(n, false); n.status = to; touch(n.id); }
        redraw();
      };
    });
    on('iDoneRec', 'onclick', function () { toggleDone(n); redraw(); });
    on('iStart', 'onchange', function () { setField(n, 'start', this.value, true); redraw(); });
    on('iDue', 'onchange', function () { setField(n, 'due', this.value, true); redraw(); });
    $$('[data-qd]', el).forEach(function (b) { b.onclick = function () { var t = today(), v = { '0': t, '1': addDays(t, 1), w: addDays(periodStart('weekly', t), 7), m: addDays(t, 30), x: '' }[b.dataset.qd]; setField(n, 'due', v, true); redraw(); }; });
    on('iRecur', 'onchange', function () { setField(n, 'recur', this.value, true); redraw(); });
    on('iPri', 'onchange', function () { setField(n, 'pri', +this.value || '', true); redraw(); });
    on('iEst', 'onchange', function () { setField(n, 'est', this.value ? +this.value : '', true); redraw(); });
    on('iWho', 'onchange', function () { setField(n, 'who', this.value, true); redraw(); });
    on('iTags', 'onchange', function () { setField(n, 'tags', this.value); redraw(); });
    $$('[data-color]', el).forEach(function (b) { b.onclick = function () { setField(n, 'color', b.dataset.color, true); redraw(); }; });
    $$('[data-icon]', el).forEach(function (b) { b.onclick = function () { setField(n, 'icon', b.dataset.icon, true); redraw(); }; });
    var body = $('#iBody', el), tm;
    if (body) {
      body.onfocus = function () { checkpoint(); };
      body.oninput = function () { n.body = body.value; touch(n.id); clearTimeout(tm); tm = setTimeout(function () { var pv = $('#iMd', el); if (pv) pv.innerHTML = md(n.body); }, 200); };
    }
    on('iChild', 'onclick', function () { checkpoint(); var c = addNode(n.id, null, { title: '' }); redraw(); startRename(c.id); });
    on('iSib', 'onclick', function () { checkpoint(); var c = addNode(n.parentId, n.id, { title: '' }); redraw(); startRename(c.id); });
    on('iDup', 'onclick', function () { duplicate(n.id); });
    on('iDel', 'onclick', function () { delNodes([n.id]); });
    on('iOnMap', 'onclick', function () { M.tab = 'map'; reveal(n.id); if (M.mapOpt.focus && M.mapOpt.focus !== n.id && !isAncestor(M.mapOpt.focus, n.id)) M.mapOpt.focus = null; M.centerOn = n.id; draw(); });
    on('iInTree', 'onclick', function () { M.tab = 'tree'; reveal(n.id); draw(); scrollSel(); });
    var dq = $('#iDepQ', el), dlist = $('#iDepList', el);
    if (dq) {
      dq.oninput = function () {
        var v = dq.value.toLowerCase().trim(); if (!v) { dlist.innerHTML = ''; return; }
        var hits = nodes().filter(function (x) { return x.id !== n.id && !isAncestor(x.id, n.id) && !isAncestor(n.id, x.id) && deps(n).indexOf(x.id) < 0 && x.title.toLowerCase().indexOf(v) >= 0 && !dependsOn(x.id, n.id); }).slice(0, 8);
        dlist.innerHTML = hits.map(function (x) { return '<div class="lrow" data-pick="' + x.id + '"><span class="dot" style="background:' + STATE_COLOR[state(x)] + '"></span><span class="lt">' + esc(x.title) + '</span><span class="dim small">' + esc(trunc((M.items[x.parentId] || {}).title || '', 20)) + '</span></div>'; }).join('') || '<div class="dim small" style="padding:6px">No match (or it would create a loop)</div>';
      };
      dlist.onclick = function (e) { var r = e.target.closest('[data-pick]'); if (!r) return; addDep(n, M.items[r.dataset.pick]); redraw(); };
    }
  }
  function bulk(kind) {
    var ids = Object.keys(M.multi).filter(function (id) { return M.items[id]; }); if (!ids.length) return;
    if (kind === 'delete') return delNodes(ids);
    checkpoint(); compute();
    ids.forEach(function (id) {
      var n = M.items[id], m = meta(n);
      if (kind === 'done') setDone(n, true); else if (kind === 'todo') setDone(n, false);
      else if (kind === 'today') m.due = today(); else if (kind === 'tomorrow') m.due = addDays(today(), 1);
      else if (kind === 'high') m.pri = 3; else if (kind === 'reset') { delete m.x; delete m.y; }
      touch(id);
    });
    draw();
  }
  function reveal(id) { path(M.items[id]).forEach(function (p) { if (p.collapsed) { p.collapsed = ''; touch(p.id); } }); M.sel = id; }
  function select(id) {
    var n = M.items[id]; if (!n) return;
    if (n.kind === 'note') { M.tab = 'notes'; M.note = id; draw(); return; }
    reveal(id); M.multi = {};
    if (TASKVIEWS.indexOf(M.tab) < 0) M.tab = 'tree';
    if (fActive() && !matchLeaf(n) && isLeaf(n)) M.f = NOFILTER();
    if (M.tab === 'map') M.centerOn = id;
    draw(); scrollSel();
  }
  function scrollSel() { var r = root && root.querySelector('.mrow.sel'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' }); }
  function withPanel(mainHtml) {
    return '<div class="mind-grid' + (M.panel ? '' : ' no-panel') + '">' + mainHtml + (M.panel ? '<div class="card mind-detail" id="mDetail"><button class="btn ghost sm panel-x" id="pHide" title="Hide panel">⇥</button>' + inspector() + '</div>' : '') + '</div>';
  }
  function bindPanel(el, redraw) {
    var d = $('#mDetail', el); if (d) bindInspector(d, redraw);
    var h = $('#pHide', el); if (h) h.onclick = function () { M.panel = false; draw(); };
    var s = $('#pShow', el); if (s) s.onclick = function () { M.panel = true; draw(); };
  }
  function panelToggle() { return M.panel ? '' : '<button class="btn sm" id="pShow">⇤ Details</button>'; }

  // ---------- inline rename (tree rows and map boxes) ----------
  function startRename(id) {
    var n = M.items[id]; if (!n) return;
    var host = root.querySelector('.mrow[data-id="' + id + '"] .mt');
    if (host) {
      renameIn(host, n, false, function (next) { if (next) { checkpoint(); var c = addNode(n.parentId, n.id, { title: '' }); draw(); startRename(c.id); } else { var o = $('#mOutline', root); if (o) o.focus(); } });
      return;
    }
    var g = root.querySelector('.mn[data-id="' + id + '"]'), wrap = $('#mapWrap', root);
    if (g && wrap) {
      var r = g.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      var inp = document.createElement('input'); inp.className = 'input map-edit';
      inp.style.left = (r.left - wr.left) + 'px'; inp.style.top = (r.top - wr.top) + 'px'; inp.style.width = Math.max(200, r.width) + 'px';
      wrap.appendChild(inp);
      renameIn(inp, n, true, function (next, tab) {
        if (tab) { checkpoint(); var c = addNode(n.id, null, { title: '' }); draw(); startRename(c.id); }
        else if (next) { checkpoint(); var s2 = addNode(n.parentId, n.id, { title: '' }); draw(); startRename(s2.id); }
        else { var w = $('#mapWrap', root); if (w) w.focus({ preventScroll: true }); }
      });
    }
  }
  function renameIn(host, n, isInput, after) {
    var inp = host;
    if (!isInput) { inp = document.createElement('input'); inp.className = 'input mrename'; host.replaceWith(inp); }
    inp.value = n.title; inp.placeholder = 'Type a name · Enter = next · Tab = sub-task · Esc'; inp.focus(); inp.select();
    var done = false;
    function commit(next, tab) {
      if (done) return; done = true;
      var v = inp.value.trim();
      if (!v && !n.title) { remove(n.id); M.sel = n.parentId || null; }
      else if (v && v !== n.title) { n.title = v; touch(n.id); }
      if (isInput && inp.parentNode) inp.remove();
      draw(); if (M.items[n.id]) after(next, tab);
    }
    inp.onkeydown = function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(!!inp.value.trim(), false); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(false, !!inp.value.trim()); }
      else if (e.key === 'Escape') { inp.value = n.title; commit(false, false); }
    };
    inp.onblur = function () { commit(false, false); };
  }

  // ---------- TREE (outline) ----------
  function stats() {
    var leaves = nodes().filter(isLeaf), by = { done: 0, ready: 0, blocked: 0, doing: 0 }, od = 0;
    leaves.forEach(function (n) { var s = state(n); if (by[s] !== undefined) by[s]++; if (overdue(n)) od++; });
    return { total: leaves.length, by: by, od: od, pct: leaves.length ? Math.round(by.done / leaves.length * 100) : 0 };
  }
  function drawTree(el) {
    compute();
    var st = stats();
    var html = '<div class="kpis mind-kpis">' + [
      ['Tasks', st.total, (nodes().length - st.total) + ' groups', '#0077ff'], ['Done', st.by.done, st.pct + '% complete', '#22c55e'],
      ['Ready now', st.by.ready, 'nothing blocking', '#f5a524'], ['Doing', st.by.doing, 'in progress', '#3b95ff'], ['Blocked', st.by.blocked, st.od + ' overdue', '#ef4444']
    ].map(function (k) { return '<div class="kpi" style="--accent:' + k[3] + '"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div><div class="sub">' + k[2] + '</div></div>'; }).join('') +
      '<div class="kpi" style="--accent:#22c55e;display:flex;align-items:center;justify-content:center">' + L.ring(st.pct, 74) + '</div></div>';
    html += '<div class="toolbar"><button class="btn sm" id="tExpand">Expand all</button><button class="btn sm" id="tCollapse">Collapse all</button><button class="btn primary sm" id="tAddRoot">+ Branch</button><span class="spacer"></span>' + panelToggle() + '</div>';
    html += withPanel('<div class="card mind-outline" id="mOutline" tabindex="0">' + outline() + '</div>') +
      '<p class="small dim">Outline keys: ↑/↓ move · Space done · Enter new sibling · Tab / Shift+Tab indent · Alt+↑/↓ reorder · F2 or double-click rename · Del delete · Ctrl+Z undo</p>';
    el.innerHTML = html;
    bindTree(el);
    bindPanel(el, function () { drawTree(el); });
  }
  function outline() {
    var vis = visible(), out = '', t = today();
    function row(n, depth) {
      if (vis && !vis[n.id]) return;
      var c = kids(n.id), s = state(n), p = C.prog[n.id], m = meta(n), open = !n.collapsed || (vis && c.some(function (x) { return vis[x.id]; }));
      var dl = deps(n).length, d = due(n), cl = checklist(n);
      out += '<div class="mrow' + (M.sel === n.id ? ' sel' : '') + (vis && vis[n.id] === 1 ? ' ghost' : '') + ' st-' + s + '" data-id="' + n.id + '" style="--d:' + depth + ';--bc:' + C.branch[n.id] + '">' +
        (c.length ? '<button class="caret" data-caret="' + n.id + '">' + (open ? '▾' : '▸') + '</button>' : '<span class="caret"></span>') +
        '<input type="checkbox" data-check="' + n.id + '"' + (isDone(n) ? ' checked' : '') + '>' +
        (m.icon ? '<span>' + esc(m.icon) + '</span>' : '') + '<span class="mt">' + esc(n.title || 'Untitled') + '</span>' +
        (+m.pri ? '<span class="flag" style="color:' + PRI_COLOR[m.pri] + '" title="' + PRI[m.pri] + '">⚑</span>' : '') +
        (m.recur ? '<span class="dim small" title="' + RECUR[m.recur] + '">↻' + (leafDone(n) ? '✓' : '') + '</span>' : '') +
        (d && !isDone(n) ? '<span class="due' + (d < t ? ' od' : d === t ? ' td' : '') + '">' + dueLabel(d) + '</span>' : '') +
        (cl.t ? '<span class="dim small">☑' + cl.d + '/' + cl.t + '</span>' : '') +
        (c.length ? '<span class="mini"><span style="width:' + Math.round(p.done / p.total * 100) + '%"></span></span><span class="dim small nowrap">' + p.done + '/' + p.total + '</span>' : '') +
        (s === 'blocked' || s === 'doing' ? '<span class="chip c-' + s + '">' + STATE_LABEL[s] + '</span>' : '') +
        (dl ? '<span class="dim small" title="Depends on ' + dl + '">🔗' + dl + '</span>' : '') +
        '<button class="add" data-addchild="' + n.id + '" title="Add sub-task">+</button></div>';
      if (open) c.forEach(function (x) { row(x, depth + 1); });
    }
    kids('').forEach(function (n) { row(n, 0); });
    return out || '<div class="empty">Nothing matches these filters</div>';
  }
  function bindTree(el) {
    var redraw = function () { drawTree(el); }, focusO = function () { var o = $('#mOutline', el); if (o) o.focus({ preventScroll: true }); };
    $('#tExpand', el).onclick = function () { nodes().forEach(function (n) { if (n.collapsed) { n.collapsed = ''; touch(n.id); } }); redraw(); };
    $('#tCollapse', el).onclick = function () { nodes().forEach(function (n) { if (n.parentId && !isLeaf(n) && !n.collapsed) { n.collapsed = 'true'; touch(n.id); } }); redraw(); };
    $('#tAddRoot', el).onclick = function () { checkpoint(); var n = addNode('', null, { title: '' }); redraw(); startRename(n.id); };
    var o = $('#mOutline', el);
    o.onclick = function (e) {
      var t = e.target, id;
      if ((id = t.dataset.caret)) { var n = M.items[id]; n.collapsed = n.collapsed ? '' : 'true'; touch(id); redraw(); return; }
      if ((id = t.dataset.addchild)) { checkpoint(); var c = addNode(id, null, { title: '' }); redraw(); startRename(c.id); return; }
      if (t.dataset.check || t.tagName === 'INPUT') return;
      var r = t.closest('.mrow'); if (r) { M.sel = r.dataset.id; M.multi = {}; redraw(); focusO(); }
    };
    o.ondblclick = function (e) { var r = e.target.closest('.mrow'); if (r && e.target.classList.contains('mt')) startRename(r.dataset.id); };
    o.onchange = function (e) { var id = e.target.dataset.check; if (!id) return; if (!toggleDone(M.items[id])) e.target.checked = !e.target.checked; redraw(); focusO(); };
    o.onkeydown = function (e) {
      if (e.target !== o) return;
      var order = $$('.mrow', o).map(function (r) { return r.dataset.id; }), i = order.indexOf(M.sel), n = M.items[M.sel], ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.altKey && n) {
          var sibs = kids(n.parentId), j = sibs.indexOf(n), k = j + (e.key === 'ArrowDown' ? 1 : -1);
          if (k >= 0 && k < sibs.length) { checkpoint(); sibs.splice(j, 1); sibs.splice(k, 0, n); sibs.forEach(function (x, q) { x.order = q; touch(x.id); }); }
        } else M.sel = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || order[0];
        redraw(); focusO(); scrollSel(); return;
      }
      if (!n) return;
      if (e.key === ' ') { e.preventDefault(); toggleDone(n); redraw(); focusO(); }
      else if (e.key === 'Enter') { e.preventDefault(); checkpoint(); var c = addNode(n.parentId, n.id, { title: '' }); redraw(); startRename(c.id); }
      else if (e.key === 'Tab') { e.preventDefault(); checkpoint(); indent(n, e.shiftKey ? -1 : 1); redraw(); focusO(); }
      else if (e.key === 'F2') { e.preventDefault(); startRename(n.id); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delNodes([n.id]); }
      else if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(n.id); }
      else if (e.key === 'ArrowRight' && n.collapsed) { n.collapsed = ''; touch(n.id); redraw(); focusO(); }
      else if (e.key === 'ArrowLeft') { if (!isLeaf(n) && !n.collapsed) { n.collapsed = 'true'; touch(n.id); } else if (n.parentId) M.sel = n.parentId; redraw(); focusO(); }
    };
  }
  function indent(n, dir) {
    compute(); var sibs = kids(n.parentId), idx = sibs.indexOf(n);
    if (dir > 0) { if (idx < 1) return; var np = sibs[idx - 1]; n.parentId = np.id; n.order = kids(np.id).length; if (np.collapsed) { np.collapsed = ''; touch(np.id); } }
    else { if (!n.parentId) return; var par = M.items[n.parentId]; n.parentId = par.parentId; n.order = (+par.order || 0) + 0.5; compute(); kids(par.parentId).forEach(function (x, i) { x.order = i; touch(x.id); }); }
    delete meta(n).x; delete meta(n).y; touch(n.id);
  }
  function reparent(id, newParent) {
    var n = M.items[id]; if (!n || n.id === newParent || isAncestor(id, newParent)) return false;
    compute(); n.parentId = newParent || ''; n.order = kids(newParent).length + 1; touch(n.id);
    compute(); kids(newParent).forEach(function (x, i) { x.order = i; touch(x.id); });
    var p = M.items[newParent]; if (p && p.collapsed) { p.collapsed = ''; touch(p.id); }
    return true;
  }

  // ---------- MAP: free canvas over the same tasks ----------
  var NW = 220, GX = 290, P;
  function wrapText(s, n, maxLines) {
    var words = String(s || 'Untitled').split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = trunc(lines[maxLines - 1] + ' …', n); }
    return lines.map(function (l) { return trunc(l, n + 4); });
  }
  function boxInfo(n) {
    var m = meta(n), lines = wrapText((m.icon ? m.icon + ' ' : '') + (n.title || 'Untitled'), 25, 3), bits = [], d = due(n), cl = checklist(n);
    if (M.mapOpt.dates && d && !isDone(n)) bits.push({ t: (m.recur ? '↻ ' : '📅 ') + dueLabel(d), c: d < today() ? '#ff7b7b' : d === today() ? '#ffc35c' : '#9aa3b5' });
    else if (m.recur) bits.push({ t: '↻ ' + (leafDone(n) ? 'done' : RECUR[m.recur].toLowerCase()), c: '#9aa3b5' });
    if (+m.pri >= 2) bits.push({ t: '⚑ ' + PRI[m.pri], c: PRI_COLOR[m.pri] });
    if (cl.t) bits.push({ t: '☑ ' + cl.d + '/' + cl.t, c: '#9aa3b5' });
    if (!isLeaf(n)) { var p = C.prog[n.id]; bits.push({ t: p.done + '/' + p.total, c: '#9aa3b5' }); }
    if (n.body && !cl.t) bits.push({ t: '📝', c: '#9aa3b5' });
    return { lines: lines, meta: bits, w: NW, h: Math.max(42, 16 + lines.length * 17 + (bits.length ? 18 : 0) + 6) };
  }
  function mapVisible() {
    var vis = {}, focus = M.items[M.mapOpt.focus] ? M.mapOpt.focus : null, roots = focus ? [M.items[focus]] : kids('');
    (function walk(ns) { ns.forEach(function (n) { vis[n.id] = 1; if (!n.collapsed) walk(kids(n.id)); }); })(roots);
    return { vis: vis, roots: roots };
  }
  function autoLayout(roots, info) {
    var pos = {}, mode = M.mapOpt.layout, GAP = 14;
    function vk(n) { return n.collapsed ? [] : kids(n.id); }
    function placeSide(n, d, sign, st) {
      var c = vk(n), b = info[n.id];
      if (!c.length) { pos[n.id] = { x: sign * d * GX, y: st.y }; st.y += b.h + GAP; return; }
      c.forEach(function (x) { placeSide(x, d + 1, sign, st); });
      var f = pos[c[0].id], l = pos[c[c.length - 1].id];
      pos[n.id] = { x: sign * d * GX, y: (f.y + l.y + info[c[c.length - 1].id].h) / 2 - b.h / 2 };
    }
    function placeDown(n, d, st) {
      var c = vk(n);
      if (!c.length) { pos[n.id] = { x: st.x, y: d * 120 }; st.x += NW + 24; return; }
      c.forEach(function (x) { placeDown(x, d + 1, st); });
      pos[n.id] = { x: (pos[c[0].id].x + pos[c[c.length - 1].id].x) / 2, y: d * 120 };
    }
    function shiftTree(n, dy) { pos[n.id].y += dy; vk(n).forEach(function (x) { shiftTree(x, dy); }); }
    var st = { y: 0, x: 0 };
    roots.forEach(function (r) {
      if (mode === 'down') { placeDown(r, 0, st); st.x += 60; return; }
      if (mode === 'both') {
        var c = vk(r), right = c.filter(function (x, i) { return i % 2 === 0; }), left = c.filter(function (x, i) { return i % 2 === 1; });
        var sR = { y: st.y }, sL = { y: st.y };
        right.forEach(function (x) { placeSide(x, 1, 1, sR); });
        left.forEach(function (x) { placeSide(x, 1, -1, sL); });
        var hR = sR.y - st.y, hL = sL.y - st.y, hMax = Math.max(hR, hL, info[r.id].h);
        right.forEach(function (x) { shiftTree(x, (hMax - hR) / 2); });
        left.forEach(function (x) { shiftTree(x, (hMax - hL) / 2); });
        pos[r.id] = { x: 0, y: st.y + hMax / 2 - info[r.id].h / 2 };
        st.y += hMax + 60; return;
      }
      placeSide(r, 0, 1, st); st.y += 40;
    });
    return pos;
  }
  function mapPositions() {
    var mv = mapVisible(), info = {};
    Object.keys(mv.vis).forEach(function (id) { info[id] = boxInfo(M.items[id]); });
    var pos = autoLayout(mv.roots, info);
    Object.keys(pos).forEach(function (id) { var m = meta(M.items[id]); if (m.x != null && m.y != null) pos[id] = { x: m.x, y: m.y }; });
    return { pos: pos, info: info, vis: mv.vis };
  }
  function bounds(Q) {
    var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    Object.keys(Q.pos).forEach(function (id) { var p = Q.pos[id], i = Q.info[id]; b.x1 = Math.min(b.x1, p.x); b.y1 = Math.min(b.y1, p.y); b.x2 = Math.max(b.x2, p.x + i.w); b.y2 = Math.max(b.y2, p.y + i.h); });
    if (b.x1 === Infinity) b = { x1: 0, y1: 0, x2: 400, y2: 300 };
    return b;
  }
  function edgePath(a, ai, b, bi) {
    var ax = a.x + ai.w / 2, ay = a.y + ai.h / 2, bx = b.x + bi.w / 2, by = b.y + bi.h / 2, dx = bx - ax, dy = by - ay, x1, y1, x2, y2, horiz = Math.abs(dx) > Math.abs(dy) * 0.5;
    if (horiz) { x1 = dx > 0 ? a.x + ai.w : a.x; y1 = ay; x2 = dx > 0 ? b.x : b.x + bi.w; y2 = by; }
    else { x1 = ax; y1 = dy > 0 ? a.y + ai.h : a.y; x2 = bx; y2 = dy > 0 ? b.y : b.y + bi.h; }
    var st = M.mapOpt.edge;
    if (st === 'straight') return 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2;
    if (st === 'elbow') { if (horiz) { var mx = (x1 + x2) / 2; return 'M' + x1 + ' ' + y1 + 'H' + mx + 'V' + y2 + 'H' + x2; } var my = (y1 + y2) / 2; return 'M' + x1 + ' ' + y1 + 'V' + my + 'H' + x2 + 'V' + y2; }
    if (horiz) { var cx = (x1 + x2) / 2; return 'M' + x1 + ' ' + y1 + 'C' + cx + ' ' + y1 + ' ' + cx + ' ' + y2 + ' ' + x2 + ' ' + y2; }
    var cy = (y1 + y2) / 2; return 'M' + x1 + ' ' + y1 + 'C' + x1 + ' ' + cy + ' ' + x2 + ' ' + cy + ' ' + x2 + ' ' + y2;
  }
  function edgesSvg(Q) {
    var out = '';
    Object.keys(Q.vis).forEach(function (id) {
      var n = M.items[id]; if (!n.parentId || !Q.pos[n.parentId] || !Q.pos[id]) return;
      out += '<path d="' + edgePath(Q.pos[n.parentId], Q.info[n.parentId], Q.pos[id], Q.info[id]) + '" fill="none" stroke="' + C.branch[id] + '" stroke-opacity="0.55" stroke-width="2"/>';
    });
    return out;
  }
  function depsSvg(Q) {
    if (!M.mapOpt.deps) return '';
    var out = '';
    Object.keys(Q.vis).forEach(function (id) {
      deps(M.items[id]).forEach(function (d) {
        var a = Q.pos[d], b = Q.pos[id]; if (!a || !b) return;
        var ai = Q.info[d], bi = Q.info[id], open = !isDone(M.items[d]), up = b.y < a.y;
        var x1 = a.x + ai.w / 2, y1 = up ? a.y : a.y + ai.h, x2 = b.x + bi.w / 2, y2 = up ? b.y + bi.h : b.y, bend = Math.max(60, Math.abs(x2 - x1) * 0.25 + 40);
        out += '<path d="M' + x1 + ' ' + y1 + 'C' + (x1 + bend) + ' ' + (y1 + (up ? -50 : 50)) + ' ' + (x2 + bend) + ' ' + (y2 + (up ? 50 : -50)) + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + (open ? '#f5a524' : '#2f7a4a') + '" stroke-width="1.6" stroke-dasharray="6 5" marker-end="url(#ar' + (open ? 'o' : 'd') + ')" data-dep="' + id + '|' + d + '"><title>' + esc(M.items[d].title + ' → must finish before → ' + M.items[id].title) + ' (right-click to remove)</title></path>';
      });
    });
    return out;
  }
  function nodeSvg(n, p, i) {
    var m = meta(n), s = state(n), sel = M.sel === n.id || M.multi[n.id], col = C.branch[n.id], dim = fActive() && !matchLeaf(n);
    var F = ' font-family="Inter, system-ui, sans-serif"';
    var o = '<g class="mn' + (sel ? ' sel' : '') + '" data-id="' + n.id + '" transform="translate(' + p.x + ',' + p.y + ')" opacity="' + (dim ? 0.28 : 1) + '">' +
      '<rect width="' + i.w + '" height="' + i.h + '" rx="11" fill="#0d1016"/>' +
      '<rect class="mn-box" width="' + i.w + '" height="' + i.h + '" rx="11" fill="' + (m.color || '#11141b') + '" fill-opacity="' + (m.color ? 0.2 : 1) + '" stroke="' + (sel ? '#3b95ff' : (m.color || col)) + '" stroke-width="' + (sel ? 2.5 : 1.4) + '" stroke-opacity="' + (sel ? 1 : 0.85) + '"/>' +
      '<rect x="0" y="0" width="5" height="' + i.h + '" rx="2" fill="' + col + '"/>' +
      '<g data-act="check" style="cursor:pointer"><circle cx="18" cy="20" r="8" fill="' + (s === 'done' ? '#22c55e' : '#0d1016') + '" stroke="' + STATE_COLOR[s] + '" stroke-width="2"/>' + (s === 'done' ? '<path d="M14 20l3 3 5-6" fill="none" stroke="#04220f" stroke-width="2.2"/>' : '') + '<title>Mark done</title></g>' +
      i.lines.map(function (ln, k) { return '<text x="34" y="' + (25 + k * 17) + '" fill="' + (s === 'done' ? '#7d8597' : '#eef1f6') + '" font-size="13.5" font-weight="' + (C.depth[n.id] === 0 ? 700 : 500) + '"' + F + (s === 'done' ? ' text-decoration="line-through"' : '') + '>' + esc(ln) + '</text>'; }).join('');
    if (i.meta.length) { var x = 34, y = 25 + i.lines.length * 17 + 2; i.meta.forEach(function (b) { o += '<text x="' + x + '" y="' + y + '" fill="' + b.c + '" font-size="11"' + F + '>' + esc(b.t) + '</text>'; x += b.t.length * 6.2 + 10; }); }
    if (!isLeaf(n)) {
      var pr = C.prog[n.id];
      o += '<rect x="6" y="' + (i.h - 4) + '" width="' + ((i.w - 12) * pr.done / pr.total) + '" height="3" rx="1.5" fill="#22c55e"/>';
      o += '<g data-act="collapse" style="cursor:pointer"><circle cx="' + i.w + '" cy="' + i.h / 2 + '" r="9" fill="#0d1016" stroke="' + col + '" stroke-width="1.5"/><text x="' + i.w + '" y="' + (i.h / 2 + 4) + '" text-anchor="middle" fill="#cfd5df" font-size="' + (n.collapsed ? 9 : 13) + '"' + F + '>' + (n.collapsed ? kids(n.id).length : '−') + '</text><title>' + (n.collapsed ? 'Expand' : 'Collapse') + '</title></g>';
    }
    if (s === 'blocked') o += '<text x="' + (i.w - 12) + '" y="15" text-anchor="end" font-size="10" fill="#ff7b7b"' + F + '>blocked</text>';
    o += '<g data-act="link" class="lh" style="cursor:crosshair"><circle cx="' + (i.w - 12) + '" cy="' + (i.h - 12) + '" r="7" fill="#0b2140" stroke="#3b95ff" stroke-width="1.5"/><text x="' + (i.w - 12) + '" y="' + (i.h - 8.5) + '" text-anchor="middle" fill="#9cc8ff" font-size="10">↗</text><title>Drag onto another box: that task then waits for this one</title></g>';
    return o + '</g>';
  }
  function mapContent(Q) {
    return '<g>' + edgesSvg(Q) + '</g><g>' + depsSvg(Q) + '</g><g>' + Object.keys(Q.vis).map(function (id) { return Q.pos[id] ? nodeSvg(M.items[id], Q.pos[id], Q.info[id]) : ''; }).join('') + '</g>';
  }
  var DEFS = '<defs><marker id="aro" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#f5a524"/></marker><marker id="ard" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#2f7a4a"/></marker></defs>';
  function drawMap(el) {
    compute(); P = mapPositions();
    var o = M.mapOpt, focus = M.items[o.focus];
    if (o.focus && !focus) o.focus = null;
    var tb = '<div class="toolbar map-tools">' +
      '<button class="btn primary sm" id="mpAdd" title="New box (or double-click the canvas)">+ Box</button>' +
      '<button class="btn sm" id="mpChild" title="Add a sub-task to the selected box (Tab)">+ Child</button>' +
      '<select class="input" id="mpLayout" title="Automatic layout">' + [['right', 'Layout: Tree →'], ['both', 'Layout: Mind map ⇆'], ['down', 'Layout: Org chart ↓']].map(function (x) { return '<option value="' + x[0] + '"' + (o.layout === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm" id="mpArrange" title="Put every box back into the automatic layout">Auto-arrange</button>' +
      '<select class="input" id="mpEdge">' + [['curved', 'Lines: Curved'], ['elbow', 'Lines: Elbow'], ['straight', 'Lines: Straight']].map(function (x) { return '<option value="' + x[0] + '"' + (o.edge === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<label class="row small"><input type="checkbox" id="mpDeps"' + (o.deps ? ' checked' : '') + '> Links</label>' +
      '<label class="row small"><input type="checkbox" id="mpDates"' + (o.dates ? ' checked' : '') + '> Dates</label>' +
      '<label class="row small"><input type="checkbox" id="mpMini"' + (o.minimap ? ' checked' : '') + '> Minimap</label>' +
      (focus ? '<span class="tag">Focus: ' + esc(trunc(focus.title, 24)) + '</span><button class="btn sm" id="mpUnfocus">Show all</button>' : '<button class="btn sm" id="mpFocus" title="Show only the selected branch">Focus branch</button>') +
      '<span class="spacer"></span><button class="btn sm" id="mpOut" title="Zoom out (−)">−</button><span class="small dim" id="mpZoom" style="min-width:40px;text-align:center">' + Math.round(M.view.k * 100) + '%</span><button class="btn sm" id="mpIn" title="Zoom in (+)">+</button><button class="btn sm" id="mpFit">Fit</button>' +
      '<button class="btn sm" id="mpPng">⬇ PNG</button><button class="btn sm" id="mpSvg">⬇ SVG</button>' + panelToggle() + '</div>';
    var main = '<div class="card mind-map" id="mapWrap" tabindex="0"><svg id="mapSvg" width="100%" height="100%">' + DEFS + '<g id="mapVP">' + mapContent(P) + '</g><g id="mapOverlay"></g></svg>' +
      (o.minimap ? '<svg id="miniMap" width="180" height="120"></svg>' : '') +
      '<div class="map-legend">' + ['done', 'doing', 'ready', 'blocked', 'open'].map(function (k) { return '<span><i style="background:' + STATE_COLOR[k] + '"></i>' + STATE_LABEL[k] + '</span>'; }).join('') + '<span><i style="background:#f5a524;height:2px"></i>Must finish first</span></div></div>';
    el.innerHTML = tb + withPanel(main) +
      '<p class="small dim">Drag boxes anywhere (sub-tasks follow; hold Alt to move one alone) · drop a box onto another to make it a sub-task · drag ↗ onto a box to link "must finish first" · double-click canvas = new box · double-click box = rename · Shift+drag = select many · right-click for more · keys: Tab child · Enter sibling · Space done · Del · F2 · arrows · Alt+arrows nudge · Ctrl+Z/Y · Ctrl+D duplicate · +/− zoom</p>';
    bindMap(el);
    bindPanel(el, function () { drawMap(el); });
  }
  function applyVP() {
    var vp = $('#mapVP', root); if (vp) vp.setAttribute('transform', 'translate(' + M.view.tx + ',' + M.view.ty + ') scale(' + M.view.k + ')');
    var z = $('#mpZoom', root); if (z) z.textContent = Math.round(M.view.k * 100) + '%';
    drawMini();
  }
  function fitView(onlyWidth) {
    var svg = $('#mapSvg', root); if (!svg) return; var b = bounds(P), W = svg.clientWidth || 900, H = svg.clientHeight || 600;
    var k = Math.min(1.1, (W - 60) / (b.x2 - b.x1 || 1), onlyWidth ? 1.1 : (H - 60) / (b.y2 - b.y1 || 1)); k = Math.max(onlyWidth ? 0.5 : 0.12, k);
    M.view.k = k; M.view.tx = 30 - b.x1 * k + Math.max(0, (W - 60 - (b.x2 - b.x1) * k) / 2); M.view.ty = 30 - b.y1 * k + (onlyWidth ? 0 : Math.max(0, (H - 60 - (b.y2 - b.y1) * k) / 2)); applyVP();
  }
  function centerOn(id) { var svg = $('#mapSvg', root), p = P.pos[id], i = P.info[id]; if (!svg || !p) return; M.view.tx = svg.clientWidth / 2 - (p.x + i.w / 2) * M.view.k; M.view.ty = svg.clientHeight / 2 - (p.y + i.h / 2) * M.view.k; applyVP(); }
  function drawMini() {
    var mm = $('#miniMap', root), svg = $('#mapSvg', root); if (!mm || !svg || !P) return;
    var b = bounds(P), pad = 40, w = b.x2 - b.x1 + pad * 2, h = b.y2 - b.y1 + pad * 2, s = Math.min(180 / w, 120 / h);
    var rects = Object.keys(P.pos).map(function (id) { var p = P.pos[id], i = P.info[id]; return '<rect x="' + ((p.x - b.x1 + pad) * s) + '" y="' + ((p.y - b.y1 + pad) * s) + '" width="' + Math.max(2, i.w * s) + '" height="' + Math.max(1.5, i.h * s) + '" fill="' + STATE_COLOR[state(M.items[id])] + '" opacity="0.85"/>'; }).join('');
    var vx = (-M.view.tx / M.view.k - b.x1 + pad) * s, vy = (-M.view.ty / M.view.k - b.y1 + pad) * s, vw = svg.clientWidth / M.view.k * s, vh = svg.clientHeight / M.view.k * s;
    mm.innerHTML = '<rect width="180" height="120" fill="#07080b" opacity="0.94"/>' + rects + '<rect x="' + vx + '" y="' + vy + '" width="' + vw + '" height="' + vh + '" fill="rgba(59,149,255,.12)" stroke="#3b95ff"/>';
    mm.onpointerdown = function (e) { e.stopPropagation(); var r = mm.getBoundingClientRect(), wx = (e.clientX - r.left) / s + b.x1 - pad, wy = (e.clientY - r.top) / s + b.y1 - pad; M.view.tx = svg.clientWidth / 2 - wx * M.view.k; M.view.ty = svg.clientHeight / 2 - wy * M.view.k; applyVP(); };
  }
  function toWorld(e) { var r = $('#mapSvg', root).getBoundingClientRect(); return { x: (e.clientX - r.left - M.view.tx) / M.view.k, y: (e.clientY - r.top - M.view.ty) / M.view.k }; }
  function hitNode(w, exclude) {
    var hit = null;
    Object.keys(P.pos).forEach(function (id) { if (exclude && exclude[id]) return; var p = P.pos[id], i = P.info[id]; if (w.x >= p.x && w.x <= p.x + i.w && w.y >= p.y && w.y <= p.y + i.h) hit = id; });
    return hit;
  }
  function centerWorld() { var svg = $('#mapSvg', root); return { x: (svg.clientWidth / 2 - M.view.tx) / M.view.k, y: (svg.clientHeight / 2 - M.view.ty) / M.view.k }; }
  function anyManual() { return nodes().some(function (n) { return meta(n).x != null; }); }
  function clearManual() { checkpoint(); nodes().forEach(function (n) { var m = meta(n); if (m.x != null || m.y != null) { delete m.x; delete m.y; touch(n.id); } }); }
  function bindMap(el) {
    var svg = $('#mapSvg', el), wrap = $('#mapWrap', el), ov = $('#mapOverlay', el), o = M.mapOpt, redraw = function () { drawMap(el); };
    if (!M.view.fitted) { M.view.fitted = true; fitView(Object.keys(P.pos).length > 30); } else applyVP();
    if (M.centerOn) { centerOn(M.centerOn); M.centerOn = null; }
    function zoomAt(mx, my, f) { var k2 = Math.max(0.12, Math.min(2.5, M.view.k * f)); M.view.tx = mx - (mx - M.view.tx) * k2 / M.view.k; M.view.ty = my - (my - M.view.ty) * k2 / M.view.k; M.view.k = k2; applyVP(); }
    function newBoxAt(w) { checkpoint(); var n = newItem({ title: '', order: kids('').length, m: { x: Math.round(w.x), y: Math.round(w.y) } }); M.sel = n.id; M.multi = {}; redraw(); startRename(n.id); }
    $('#mpAdd', el).onclick = function () { var c = centerWorld(); newBoxAt({ x: c.x - NW / 2, y: c.y - 20 }); };
    $('#mpChild', el).onclick = function () { if (!M.items[M.sel]) return L.toast('Select a box first'); checkpoint(); var n = addNode(M.sel, null, { title: '' }); redraw(); startRename(n.id); };
    $('#mpLayout', el).onchange = function () { o.layout = this.value; if (anyManual() && confirm('Re-arrange all boxes with this layout? Your manual positions are reset (Undo brings them back).')) clearManual(); M.view.fitted = false; redraw(); };
    $('#mpArrange', el).onclick = function () { clearManual(); M.view.fitted = false; redraw(); };
    $('#mpEdge', el).onchange = function () { o.edge = this.value; redraw(); };
    $('#mpDeps', el).onchange = function () { o.deps = this.checked; redraw(); };
    $('#mpDates', el).onchange = function () { o.dates = this.checked; redraw(); };
    $('#mpMini', el).onchange = function () { o.minimap = this.checked; redraw(); };
    if ($('#mpFocus', el)) $('#mpFocus', el).onclick = function () { var n = M.items[M.sel]; if (!n) return L.toast('Select a branch first'); compute(); while (n.parentId && isLeaf(n)) n = M.items[n.parentId]; o.focus = n.id; M.view.fitted = false; redraw(); };
    if ($('#mpUnfocus', el)) $('#mpUnfocus', el).onclick = function () { o.focus = null; M.view.fitted = false; redraw(); };
    $('#mpIn', el).onclick = function () { zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1.2); };
    $('#mpOut', el).onclick = function () { zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1 / 1.2); };
    $('#mpFit', el).onclick = function () { fitView(false); };
    $('#mpPng', el).onclick = function () { exportMap('png'); };
    $('#mpSvg', el).onclick = function () { exportMap('svg'); };
    // wheel: zoom with mouse wheel / pinch; two-finger trackpad scroll pans
    svg.addEventListener('wheel', function (e) {
      e.preventDefault(); var r = svg.getBoundingClientRect();
      var mouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 40 && Math.abs(e.deltaX) < 1 && e.deltaY % 1 === 0);
      if (e.ctrlKey || e.metaKey || (mouseWheel && !e.shiftKey)) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      else { M.view.tx -= e.shiftKey ? e.deltaY : e.deltaX; M.view.ty -= e.shiftKey ? 0 : e.deltaY; applyVP(); }
    }, { passive: false });

    var drag = null;
    svg.onpointerdown = function (e) {
      if (e.button === 2) return;
      wrap.focus({ preventScroll: true });
      var t = e.target, g = t.closest('.mn'), id = g && g.dataset.id, w = toWorld(e);
      if (g && t.closest('[data-act="collapse"]')) { var n = M.items[id]; n.collapsed = n.collapsed ? '' : 'true'; touch(id); redraw(); return; }
      if (g && t.closest('[data-act="check"]')) { toggleDone(M.items[id]); redraw(); return; }
      svg.setPointerCapture(e.pointerId);
      if (g && t.closest('[data-act="link"]')) { drag = { type: 'link', from: id }; return; }
      if (g) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) { if (M.sel && M.sel !== id) M.multi[M.sel] = 1; if (M.multi[id]) delete M.multi[id]; else M.multi[id] = 1; M.sel = id; redraw(); return; }
        if (!M.multi[id]) M.multi = {};
        var changed = M.sel !== id; M.sel = id;
        drag = { type: 'move', id: id, w0: w, moved: false, alt: e.altKey, changed: changed };
        $$('.mn', svg).forEach(function (x) { x.classList.toggle('sel', x.dataset.id === id || !!M.multi[x.dataset.id]); });
        return;
      }
      if (e.shiftKey) { drag = { type: 'box', w0: w }; return; }
      drag = { type: 'pan', sx: e.clientX, sy: e.clientY, tx: M.view.tx, ty: M.view.ty, moved: false };
    };
    svg.onpointermove = function (e) {
      if (!drag) return;
      var w = toWorld(e);
      if (drag.type === 'pan') { if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true; M.view.tx = drag.tx + e.clientX - drag.sx; M.view.ty = drag.ty + e.clientY - drag.sy; applyVP(); return; }
      if (drag.type === 'move') {
        var dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
        if (!drag.moved) {
          if (Math.abs(dx) + Math.abs(dy) < 4 / M.view.k) return;
          drag.moved = true; checkpoint();
          var heads = Object.keys(M.multi).length ? Object.keys(M.multi).filter(function (h) { return P.pos[h]; }) : [drag.id], set = {};
          heads.forEach(function (h) { set[h] = 1; if (!drag.alt) subtree(h).forEach(function (s) { if (P.pos[s]) set[s] = 1; }); });
          drag.set = set; drag.heads = heads; drag.orig = {}; Object.keys(set).forEach(function (s) { drag.orig[s] = { x: P.pos[s].x, y: P.pos[s].y }; });
        }
        Object.keys(drag.set).forEach(function (s) { P.pos[s] = { x: drag.orig[s].x + dx, y: drag.orig[s].y + dy }; });
        drag.target = drag.heads.length === 1 ? hitNode(w, drag.set) : null;
        if (!drag.raf) drag.raf = requestAnimationFrame(function () {
          if (!drag) return; drag.raf = null;
          var vp = $('#mapVP', root); if (vp) vp.innerHTML = mapContent(P); drawMini();
          if (drag.target) { var tg = svg.querySelector('.mn[data-id="' + drag.target + '"]'); if (tg) tg.classList.add('drop'); }
        });
        return;
      }
      if (drag.type === 'link') {
        var a = P.pos[drag.from], ai = P.info[drag.from]; drag.target = hitNode(w); if (drag.target === drag.from) drag.target = null;
        ov.setAttribute('transform', 'translate(' + M.view.tx + ',' + M.view.ty + ') scale(' + M.view.k + ')');
        ov.innerHTML = '<path d="M' + (a.x + ai.w - 12) + ' ' + (a.y + ai.h - 12) + 'L' + w.x + ' ' + w.y + '" stroke="#f5a524" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#aro)"/>' +
          (drag.target ? '<rect x="' + (P.pos[drag.target].x - 4) + '" y="' + (P.pos[drag.target].y - 4) + '" width="' + (P.info[drag.target].w + 8) + '" height="' + (P.info[drag.target].h + 8) + '" rx="14" fill="none" stroke="#f5a524" stroke-width="2"/>' : '');
        return;
      }
      if (drag.type === 'box') {
        drag.w1 = w; var x = Math.min(w.x, drag.w0.x), y = Math.min(w.y, drag.w0.y);
        ov.setAttribute('transform', 'translate(' + M.view.tx + ',' + M.view.ty + ') scale(' + M.view.k + ')');
        ov.innerHTML = '<rect x="' + x + '" y="' + y + '" width="' + Math.abs(w.x - drag.w0.x) + '" height="' + Math.abs(w.y - drag.w0.y) + '" fill="rgba(59,149,255,.1)" stroke="#3b95ff" stroke-dasharray="4 3"/>';
      }
    };
    svg.onpointerup = function () {
      var d = drag; drag = null; ov.innerHTML = ''; if (!d) return;
      if (d.type === 'pan') { if (!d.moved && (M.sel || Object.keys(M.multi).length)) { clearTimeout(M.deselT); M.deselT = setTimeout(function () { M.sel = null; M.multi = {}; redraw(); }, 280); } return; }
      if (d.type === 'move') {
        if (!d.moved) { if (d.changed || M.panel) redraw(); return; }
        if (d.target) {
          var head = d.heads[0], tgt = P.pos[d.target], ox = d.orig[head].x, oy = d.orig[head].y, kidsN = kids(d.target).length;
          if (reparent(head, d.target)) {
            var nx = tgt.x + GX, ny = tgt.y + kidsN * 64, keepFree = meta(M.items[d.target]).x != null || meta(M.items[head]).x != null;
            Object.keys(d.set).forEach(function (s) { var m = meta(M.items[s]); if (keepFree) { m.x = Math.round(d.orig[s].x - ox + nx); m.y = Math.round(d.orig[s].y - oy + ny); } else { delete m.x; delete m.y; } touch(s); });
            L.toast('Moved under "' + M.items[d.target].title + '" — Undo to revert', 'ok');
          }
        } else {
          Object.keys(d.set).forEach(function (s) { var m = meta(M.items[s]); m.x = Math.round(P.pos[s].x); m.y = Math.round(P.pos[s].y); touch(s); });
        }
        redraw(); return;
      }
      if (d.type === 'link') { if (d.target && addDep(M.items[d.target], M.items[d.from])) L.toast('"' + M.items[d.target].title + '" now waits for "' + M.items[d.from].title + '"', 'ok'); redraw(); return; }
      if (d.type === 'box' && d.w1) {
        var x1 = Math.min(d.w0.x, d.w1.x), x2 = Math.max(d.w0.x, d.w1.x), y1 = Math.min(d.w0.y, d.w1.y), y2 = Math.max(d.w0.y, d.w1.y);
        M.multi = {}; Object.keys(P.pos).forEach(function (id) { var p = P.pos[id], i = P.info[id]; if (p.x < x2 && p.x + i.w > x1 && p.y < y2 && p.y + i.h > y1) M.multi[id] = 1; });
        M.sel = Object.keys(M.multi)[0] || null; redraw();
      }
    };
    svg.ondblclick = function (e) {
      clearTimeout(M.deselT);
      var g = e.target.closest('.mn');
      if (g) { if (!e.target.closest('[data-act]')) startRename(g.dataset.id); return; }
      var w = toWorld(e); newBoxAt({ x: w.x - NW / 2, y: w.y - 20 });
    };
    svg.oncontextmenu = function (e) {
      e.preventDefault(); var g = e.target.closest('.mn'), dp = e.target.closest('[data-dep]');
      if (dp) { var pr = dp.dataset.dep.split('|'); ctx(e, [['✂ Remove this link', function () { var n = M.items[pr[0]]; checkpoint(); n.links = deps(n).filter(function (x) { return x !== pr[1]; }).join(','); touch(n.id); redraw(); }]]); return; }
      if (!g) { var w = toWorld(e); ctx(e, [['+ New box here', function () { newBoxAt(w); }], ['⤢ Fit to screen', function () { fitView(false); }], ['▦ Auto-arrange everything', function () { clearManual(); M.view.fitted = false; redraw(); }], ['⬇ Export PNG', function () { exportMap('png'); }]]); return; }
      var id = g.dataset.id, n = M.items[id]; if (!M.multi[id]) { M.sel = id; M.multi = {}; }
      var many = Object.keys(M.multi).length > 1 ? Object.keys(M.multi) : [id];
      ctx(e, [['✏️ Rename', function () { startRename(id); }], ['＋ Add sub-task', function () { checkpoint(); var c = addNode(id, null, { title: '' }); redraw(); startRename(c.id); }], ['＋ Add sibling', function () { checkpoint(); var c = addNode(n.parentId, id, { title: '' }); redraw(); startRename(c.id); }], null,
        [isDone(n) ? '↺ Mark not done' : '✓ Mark done', function () { toggleDone(n); redraw(); }], ['▶ Mark doing', function () { checkpoint(); n.status = 'doing'; touch(id); redraw(); }],
        ['📅 Due today', function () { setField(n, 'due', today(), true); redraw(); }], ['📅 Due tomorrow', function () { setField(n, 'due', addDays(today(), 1), true); redraw(); }],
        ['⚑ Priority high', function () { setField(n, 'pri', 3, true); redraw(); }], ['↻ Repeat every day', function () { setField(n, 'recur', 'daily', true); redraw(); }], null,
        [n.collapsed ? '▸ Expand branch' : '▾ Collapse branch', function () { n.collapsed = n.collapsed ? '' : 'true'; touch(id); redraw(); }], ['🎯 Focus on this branch', function () { o.focus = id; M.view.fitted = false; redraw(); }],
        ['🌳 Show in tree', function () { M.tab = 'tree'; reveal(id); draw(); scrollSel(); }], ['⧉ Duplicate', function () { duplicate(id); }],
        ['📍 Reset position', function () { checkpoint(); [id].concat(subtree(id)).forEach(function (s) { delete meta(M.items[s]).x; delete meta(M.items[s]).y; touch(s); }); redraw(); }], null,
        ['🗑 Delete' + (many.length > 1 ? ' ' + many.length + ' boxes' : ''), function () { delNodes(many); }]]);
      redraw();
    };
    wrap.onkeydown = function (e) {
      if (e.target !== wrap) return;
      var n = M.items[M.sel], k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); M.multi = {}; Object.keys(P.pos).forEach(function (id) { M.multi[id] = 1; }); redraw(); return; }
      if (k === '+' || k === '=') { zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1.2); return; }
      if (k === '-') { zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1 / 1.2); return; }
      if (k === 'Escape') { M.sel = null; M.multi = {}; redraw(); return; }
      if (!n) return;
      if (k === 'Tab') { e.preventDefault(); checkpoint(); var c = addNode(n.id, null, { title: '' }); redraw(); startRename(c.id); }
      else if (k === 'Enter') { e.preventDefault(); checkpoint(); var s2 = addNode(n.parentId, n.id, { title: '' }); redraw(); startRename(s2.id); }
      else if (k === 'F2') { e.preventDefault(); startRename(n.id); }
      else if (k === ' ') { e.preventDefault(); toggleDone(n); redraw(); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); delNodes(Object.keys(M.multi).length > 1 ? Object.keys(M.multi) : [n.id]); }
      else if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); duplicate(n.id); }
      else if (e.altKey && k.indexOf('Arrow') === 0) {
        e.preventDefault(); checkpoint();
        var ddx = k === 'ArrowLeft' ? -10 : k === 'ArrowRight' ? 10 : 0, ddy = k === 'ArrowUp' ? -10 : k === 'ArrowDown' ? 10 : 0;
        (Object.keys(M.multi).length ? Object.keys(M.multi) : [n.id]).forEach(function (id) { if (!P.pos[id]) return; var m = meta(M.items[id]); m.x = Math.round(P.pos[id].x + ddx); m.y = Math.round(P.pos[id].y + ddy); touch(id); });
        redraw(); $('#mapWrap', root).focus({ preventScroll: true });
      } else if (k.indexOf('Arrow') === 0) {
        e.preventDefault(); var cur = P.pos[n.id]; if (!cur) return; var best = null, bd = Infinity;
        Object.keys(P.pos).forEach(function (id) {
          if (id === n.id) return; var p = P.pos[id], dx = p.x - cur.x, dy = p.y - cur.y;
          var ok = k === 'ArrowRight' ? dx > 20 : k === 'ArrowLeft' ? dx < -20 : k === 'ArrowDown' ? dy > 10 : dy < -10; if (!ok) return;
          var dist = (k === 'ArrowRight' || k === 'ArrowLeft') ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
          if (dist < bd) { bd = dist; best = id; }
        });
        if (best) {
          M.sel = best; M.multi = {}; redraw();
          var sv = $('#mapSvg', root), p2 = P.pos[best];
          if (sv && p2) { var sx = p2.x * M.view.k + M.view.tx, sy = p2.y * M.view.k + M.view.ty; if (sx < 20 || sy < 20 || sx > sv.clientWidth - 240 || sy > sv.clientHeight - 60) centerOn(best); }
          $('#mapWrap', root).focus({ preventScroll: true });
        }
      }
    };
  }
  function exportMap(kind) {
    var b = bounds(P), pad = 40, w = b.x2 - b.x1 + pad * 2, h = b.y2 - b.y1 + pad * 2;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="' + (b.x1 - pad) + ' ' + (b.y1 - pad) + ' ' + w + ' ' + h + '">' + DEFS + '<rect x="' + (b.x1 - pad) + '" y="' + (b.y1 - pad) + '" width="' + w + '" height="' + h + '" fill="#07080b"/>' + mapContent(P).replace(/<g data-act="link"[\s\S]*?<\/g>/g, '') + '</svg>';
    if (kind === 'svg') return download('my-mind-map-' + today() + '.svg', svg, 'image/svg+xml');
    var img = new Image(), scale = Math.min(2, 8000 / Math.max(w, h));
    img.onload = function () { var c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; var g = c.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0); download('my-mind-map-' + today() + '.png', c.toDataURL('image/png')); };
    img.onerror = function () { L.toast('PNG export failed — try SVG', 'err'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------- BOARD (kanban) ----------
  function drawBoard(el) {
    compute();
    var leaves = filteredLeaves(), cols = [['todo', 'To do', '#8b93a7'], ['doing', 'Doing', '#0077ff'], ['done', 'Done', '#22c55e']];
    function colOf(n) { return isDone(n) ? 'done' : n.status === 'doing' ? 'doing' : 'todo'; }
    var main = '<div class="mboard">' + cols.map(function (c) {
      var cards = leaves.filter(function (n) { return colOf(n) === c[0]; }).sort(function (a, b) { return ((+meta(b).pri || 0) - (+meta(a).pri || 0)) || byDue(a, b); });
      return '<div class="mcol" data-col="' + c[0] + '"><div class="col-head"><span class="dot" style="background:' + c[2] + '"></span>' + c[1] + ' <span class="dim">' + cards.length + '</span></div>' +
        cards.slice(0, 300).map(function (n) {
          var m = meta(n), d = due(n), s = state(n), cl = checklist(n);
          return '<div class="mcard' + (M.sel === n.id ? ' sel' : '') + '" draggable="true" data-card="' + n.id + '" style="--bc:' + C.branch[n.id] + '"><div class="small dim">' + esc(trunc(path(n).map(function (p) { return p.title; }).join(' › '), 42)) + '</div>' +
            '<div class="mc-t">' + esc(m.icon ? m.icon + ' ' : '') + esc(n.title) + '</div><div class="row wrap" style="gap:6px">' +
            (s === 'blocked' ? '<span class="chip c-blocked">Blocked</span>' : '') + (+m.pri ? '<span class="small" style="color:' + PRI_COLOR[m.pri] + '">⚑ ' + PRI[m.pri] + '</span>' : '') +
            (d && !isDone(n) ? '<span class="due' + (d < today() ? ' od' : d === today() ? ' td' : '') + '">' + dueLabel(d) + '</span>' : '') + (m.recur ? '<span class="dim small">↻</span>' : '') +
            (cl.t ? '<span class="dim small">☑' + cl.d + '/' + cl.t + '</span>' : '') + (deps(n).length ? '<span class="dim small">🔗' + deps(n).length + '</span>' : '') + '</div></div>';
        }).join('') + '</div>';
    }).join('') + '</div>';
    el.innerHTML = '<div class="toolbar"><span class="small muted">Drag cards between columns. Shows tasks (not groups) that match the filters.</span><span class="spacer"></span>' + panelToggle() + '</div>' + withPanel(main);
    var dragId = null;
    $$('.mcard', el).forEach(function (c) {
      c.ondragstart = function (e) { dragId = c.dataset.card; e.dataTransfer.setData('text/plain', dragId); c.classList.add('dragging'); };
      c.ondragend = function () { c.classList.remove('dragging'); };
      c.onclick = function () { M.sel = c.dataset.card; M.multi = {}; drawBoard(el); };
    });
    $$('.mcol', el).forEach(function (col) {
      col.ondragover = function (e) { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = function () { col.classList.remove('drop'); };
      col.ondrop = function (e) {
        e.preventDefault(); col.classList.remove('drop'); var n = M.items[dragId || e.dataTransfer.getData('text/plain')]; if (!n) return;
        var to = col.dataset.col, was = colOf(n); if (to === was) return;
        if (to === 'done') { if (!toggleDone(n)) return; }
        else { checkpoint(); if (was === 'done') setDone(n, false); n.status = to; touch(n.id); }
        drawBoard(el);
      };
    });
    bindPanel(el, function () { drawBoard(el); });
  }

  // ---------- TIMELINE (Gantt) ----------
  function drawTimeline(el) {
    compute();
    var t = today(), px = M.tl.px; if (!M.tl.start) M.tl.start = addDays(t, -7);
    var avail = (root.clientWidth || 1100) - (M.panel ? 400 : 20) - 260;
    var days = Math.max(14, Math.floor(avail / px)), start = M.tl.start, end = addDays(start, days - 1);
    var leaves = filteredLeaves(), dated = leaves.filter(function (n) { return meta(n).start || due(n); }), undated = leaves.filter(function (n) { return !meta(n).start && !due(n); });
    var groups = {}, gOrder = []; dated.forEach(function (n) { var top = path(n)[0] || n; if (!groups[top.id]) { groups[top.id] = []; gOrder.push(top.id); } groups[top.id].push(n); });
    var head = '';
    for (var i = 0; i < days; i++) { var d = addDays(start, i), wd = dow(d); head += '<div class="tl-day' + (wd === 0 || wd === 6 ? ' we' : '') + (d === t ? ' now' : '') + '" style="width:' + px + 'px">' + (px >= 22 || i % 2 === 0 ? (+d.slice(8)) : '') + '<span>' + 'SMTWTFS'[wd] + '</span></div>'; }
    var rows = '';
    gOrder.forEach(function (gid) {
      var g = M.items[gid], arr = groups[gid].sort(function (a, b) { return (meta(a).start || due(a)) < (meta(b).start || due(b)) ? -1 : 1; });
      rows += '<div class="tl-row tl-group"><div class="tl-label"><span class="dot" style="background:' + C.branch[gid] + '"></span><b>' + esc(trunc(g.title, 30)) + '</b> <span class="dim small">' + arr.length + '</span></div><div class="tl-track"></div></div>';
      arr.forEach(function (n) {
        var m = meta(n), s0 = m.start || due(n), e0 = due(n) || m.start; if (e0 < s0) { var x = s0; s0 = e0; e0 = x; }
        var left = dayDiff(s0, start) * px, width = (dayDiff(e0, s0) + 1) * px, s = state(n);
        rows += '<div class="tl-row' + (M.sel === n.id ? ' sel' : '') + '"><div class="tl-label" data-tsel="' + n.id + '"><input type="checkbox" data-check="' + n.id + '"' + (isDone(n) ? ' checked' : '') + '> <span class="lt">' + esc(n.title) + '</span></div><div class="tl-track">' +
          (e0 >= start && s0 <= end ? '<div class="tl-bar" data-bar="' + n.id + '" style="left:' + left + 'px;width:' + width + 'px;background:' + STATE_COLOR[s] + (overdue(n) ? ';box-shadow:0 0 0 2px #ef4444' : '') + '" title="' + esc(n.title + ' · ' + fmtD(s0) + ' → ' + fmtD(e0)) + '"><span class="tl-h l"></span><span class="tl-t">' + esc(trunc(n.title, Math.max(3, Math.floor(width / 7)))) + '</span><span class="tl-h r"></span></div>'
            : '<span class="small dim" style="position:absolute;left:6px;top:9px">' + (e0 < start ? '← ' : '→ ') + fmtD(s0) + '</span>') + '</div></div>';
      });
    });
    var todayX = dayDiff(t, start) * px;
    var main = '<div><div class="card tl-wrap"><div class="tl-inner" style="width:' + (260 + days * px) + 'px"><div class="tl-row tl-headrow"><div class="tl-label dim small">' + fmtD(start) + ' – ' + fmtD(end) + '</div><div class="tl-track tl-days">' + head + '</div></div>' +
      (rows || '<div class="empty">No dated tasks here yet. Drag an unscheduled task onto a day below, set dates in the side panel, or use Quick add (“tomorrow”, “fri”, “in 3 days”).</div>') +
      (todayX >= 0 && todayX < days * px ? '<div class="tl-today" style="left:' + (260 + todayX + px / 2) + 'px"></div>' : '') + '</div></div>' +
      (undated.length ? '<div class="card" style="margin-top:12px"><h3>Unscheduled <span class="dim small">' + undated.length + '</span></h3><div class="unsched">' + undated.slice(0, 80).map(function (n) { return '<span class="chip-task" data-tsel="' + n.id + '" draggable="true">' + esc(trunc(n.title, 34)) + '</span>'; }).join('') + '</div><p class="small dim">Drag a task onto a day in the timeline to give it a deadline.</p></div>' : '') + '</div>';
    el.innerHTML = '<div class="toolbar"><button class="btn sm" id="tlPrev">←</button><button class="btn sm" id="tlToday">Today</button><button class="btn sm" id="tlNext">→</button>' +
      '<div class="seg">' + [[16, 'Months'], [28, 'Weeks'], [46, 'Days']].map(function (z) { return '<button data-px="' + z[0] + '" class="' + (px === z[0] ? 'on' : '') + '">' + z[1] + '</button>'; }).join('') + '</div><span class="small muted">Drag a bar to move it · drag its ends to change start / deadline</span><span class="spacer"></span>' + panelToggle() + '</div>' + withPanel(main);
    $('#tlPrev', el).onclick = function () { M.tl.start = addDays(start, -Math.round(days / 2)); drawTimeline(el); };
    $('#tlNext', el).onclick = function () { M.tl.start = addDays(start, Math.round(days / 2)); drawTimeline(el); };
    $('#tlToday', el).onclick = function () { M.tl.start = addDays(t, -7); drawTimeline(el); };
    $$('[data-px]', el).forEach(function (b) { b.onclick = function () { M.tl.px = +b.dataset.px; drawTimeline(el); }; });
    var body = $('.mind-grid', el);
    body.addEventListener('click', function (e) { if (e.target.dataset.check || e.target.closest('#mDetail')) return; var g = e.target.closest('[data-tsel]'); if (g) { M.sel = g.dataset.tsel; M.multi = {}; drawTimeline(el); } });
    $('.tl-wrap', el).onchange = function (e) { var id = e.target.dataset.check; if (id) { if (!toggleDone(M.items[id])) e.target.checked = !e.target.checked; drawTimeline(el); } };
    $$('.tl-bar', el).forEach(function (bar) {
      bar.onpointerdown = function (e) {
        e.preventDefault(); bar.setPointerCapture(e.pointerId);
        var n = M.items[bar.dataset.bar], m = meta(n), mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
        var s0 = m.start || due(n), e0 = due(n) || m.start, x0 = e.clientX, l0 = parseFloat(bar.style.left), w0 = parseFloat(bar.style.width);
        bar.onpointermove = function (ev) {
          var dd = Math.round((ev.clientX - x0) / px);
          if (mode === 'move') bar.style.left = (l0 + dd * px) + 'px';
          else if (mode === 'r') bar.style.width = Math.max(px, w0 + dd * px) + 'px';
          else { bar.style.left = Math.min(l0 + w0 - px, l0 + dd * px) + 'px'; bar.style.width = Math.max(px, w0 - dd * px) + 'px'; }
        };
        bar.onpointerup = function (ev) {
          bar.onpointermove = bar.onpointerup = null;
          var dd = Math.round((ev.clientX - x0) / px);
          if (!dd) { M.sel = n.id; M.multi = {}; drawTimeline(el); return; }
          checkpoint();
          if (mode === 'move') { if (m.start) m.start = addDays(s0, dd); if (m.due || !m.start) m.due = addDays(e0, dd); }
          else if (mode === 'r') { if (!m.start && s0 === e0) m.start = s0; m.due = addDays(e0, dd); if (m.due < (m.start || s0)) m.due = m.start || s0; }
          else { var ns = addDays(s0, dd); if (ns > e0) ns = e0; m.start = ns; if (!m.due) m.due = e0; }
          touch(n.id); M.sel = n.id; drawTimeline(el);
        };
      };
    });
    $$('.chip-task', el).forEach(function (c) { c.ondragstart = function (e) { e.dataTransfer.setData('text/plain', c.dataset.tsel); }; });
    var inner = $('.tl-inner', el);
    inner.ondragover = function (e) { e.preventDefault(); };
    inner.ondrop = function (e) {
      e.preventDefault(); var id = e.dataTransfer.getData('text/plain'), n = M.items[id]; if (!n) return;
      var x = e.clientX - inner.getBoundingClientRect().left - 260; if (x < 0) return;
      checkpoint(); meta(n).due = addDays(start, Math.floor(x / px)); touch(id); M.sel = id; drawTimeline(el);
    };
    bindPanel(el, function () { drawTimeline(el); });
  }

  // ---------- CALENDAR ----------
  function drawCalendar(el) {
    compute();
    var t = today(); if (!M.cal) M.cal = t.slice(0, 7);
    var first = M.cal + '-01', gridStart = addDays(first, -((dow(first) + 6) % 7));
    var leaves = filteredLeaves(), byDay = {};
    leaves.forEach(function (n) { var d = meta(n).recur ? null : due(n); if (d) (byDay[d] = byDay[d] || []).push(n); });
    var recur = leaves.filter(function (n) { return meta(n).recur; });
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = addDays(gridStart, i), inM = d.slice(0, 7) === M.cal, items = (byDay[d] || []).sort(function (a, b) { return (+meta(b).pri || 0) - (+meta(a).pri || 0); });
      cells += '<div class="cal-cell' + (inM ? '' : ' out') + (d === t ? ' now' : '') + '" data-day="' + d + '"><div class="cal-d">' + (+d.slice(8)) + (d === t && recur.length ? '<span class="chip c-' + (recur.every(leafDone) ? 'done' : 'ready') + '" style="margin-left:auto">↻ ' + recur.filter(leafDone).length + '/' + recur.length + '</span>' : '') + '</div>' +
        items.slice(0, 5).map(function (n) { return '<div class="cal-item st-' + state(n) + (M.sel === n.id ? ' sel' : '') + '" draggable="true" data-csel="' + n.id + '" style="--bc:' + C.branch[n.id] + '">' + (isDone(n) ? '✓ ' : '') + esc(trunc(n.title, 26)) + '</div>'; }).join('') +
        (items.length > 5 ? '<div class="small dim">+' + (items.length - 5) + ' more</div>' : '') + '</div>';
    }
    var label = new Date(first + 'T12:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var main = '<div class="card cal"><div class="cal-head">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (x) { return '<div>' + x + '</div>'; }).join('') + '</div><div class="cal-grid">' + cells + '</div></div>';
    el.innerHTML = '<div class="toolbar"><button class="btn sm" id="cPrev">←</button><b style="min-width:150px;text-align:center">' + label + '</b><button class="btn sm" id="cNext">→</button><button class="btn sm" id="cToday">Today</button><span class="small muted">Drag tasks to another day · double-click a day to add a task due then</span><span class="spacer"></span>' + panelToggle() + '</div>' + withPanel(main);
    function shift(k) { var d = new Date(M.cal + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); M.cal = d.toISOString().slice(0, 7); drawCalendar(el); }
    $('#cPrev', el).onclick = function () { shift(-1); }; $('#cNext', el).onclick = function () { shift(1); }; $('#cToday', el).onclick = function () { M.cal = t.slice(0, 7); drawCalendar(el); };
    var cal = $('.cal', el);
    cal.onclick = function (e) { var g = e.target.closest('[data-csel]'); if (g) { M.sel = g.dataset.csel; M.multi = {}; drawCalendar(el); } };
    cal.ondblclick = function (e) {
      var c = e.target.closest('[data-day]'); if (!c || e.target.closest('[data-csel]')) return;
      var title = prompt('New task due ' + fmtD(c.dataset.day) + ':'); if (!title || !title.trim()) return;
      checkpoint(); var n = quickAdd(title); if (n) { if (!meta(n).due) meta(n).due = c.dataset.day; touch(n.id); M.sel = n.id; } drawCalendar(el);
    };
    $$('.cal-item', el).forEach(function (it) { it.ondragstart = function (e) { e.dataTransfer.setData('text/plain', it.dataset.csel); }; });
    $$('.cal-cell', el).forEach(function (c) {
      c.ondragover = function (e) { e.preventDefault(); c.classList.add('drop'); };
      c.ondragleave = function () { c.classList.remove('drop'); };
      c.ondrop = function (e) { e.preventDefault(); c.classList.remove('drop'); var n = M.items[e.dataTransfer.getData('text/plain')]; if (!n) return; checkpoint(); meta(n).due = c.dataset.day; touch(n.id); M.sel = n.id; drawCalendar(el); };
    });
    bindPanel(el, function () { drawCalendar(el); });
  }

  // ---------- NOTES (Obsidian-style) ----------
  function noteByTitle(t) { t = String(t).trim().toLowerCase(); return notes().filter(function (n) { return n.title.trim().toLowerCase() === t; })[0]; }
  function wikilinks(body) { var out = [], re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, m; while ((m = re.exec(body || ''))) out.push(m[1].trim()); return out; }
  function tagsOf(n) { var set = {}; String(n.tags || '').split(/[\s,]+/).filter(Boolean).forEach(function (t) { set[t.replace(/^#/, '').toLowerCase()] = 1; }); var re = /(^|\s)#([A-Za-z][\w\-/]*)/g, m; while ((m = re.exec(n.body || ''))) set[m[2].toLowerCase()] = 1; return Object.keys(set); }
  function backlinks(note) { var t = note.title.toLowerCase(); return list().filter(function (x) { return x.id !== note.id && wikilinks(x.body).some(function (w) { return w.toLowerCase() === t; }); }); }
  function newNote(title, body) { return newItem({ kind: 'note', title: title || 'Untitled', body: body != null ? body : '# ' + (title || 'Untitled') + '\n\n', status: '' }); }
  function openWiki(title) {
    var n = noteByTitle(title); if (n) { M.note = n.id; M.tab = 'notes'; draw(); return; }
    var task = nodes().filter(function (x) { return x.title.toLowerCase() === title.toLowerCase(); })[0];
    if (task) { select(task.id); return; }
    checkpoint(); n = newNote(title); M.note = n.id; M.tab = 'notes'; M.editMode = 'edit'; draw(); L.toast('Created note "' + title + '"', 'ok');
  }
  function md(src) {
    var lines = String(src || '').replace(/\r/g, '').split('\n'), out = [], inCode = false, lst = null, para = [];
    function inline(s) {
      s = esc(s);
      return s.replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, t, a) { var ex = noteByTitle(t) || nodes().some(function (x) { return x.title.toLowerCase() === t.trim().toLowerCase(); }); return '<a href="#" class="wl' + (ex ? '' : ' new') + '" data-wiki="' + t.trim() + '">' + (a || t) + '</a>'; })
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
        .replace(/(^|\s)#([A-Za-z][\w\-/]*)/g, '$1<a href="#" class="tagl" data-tag="$2">#$2</a>');
    }
    function fp() { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } }
    function cl() { if (lst) { out.push('</' + lst + '>'); lst = null; } }
    lines.forEach(function (ln, i) {
      if (/^```/.test(ln)) { fp(); cl(); out.push(inCode ? '</code></pre>' : '<pre><code>'); inCode = !inCode; return; }
      if (inCode) { out.push(esc(ln) + '\n'); return; }
      var m;
      if ((m = /^(#{1,6})\s+(.*)/.exec(ln))) { fp(); cl(); out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); return; }
      if (/^\s*(---|\*\*\*)\s*$/.test(ln)) { fp(); cl(); out.push('<hr>'); return; }
      if ((m = /^>\s?(.*)/.exec(ln))) { fp(); cl(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
      if (/^\|.*\|\s*$/.test(ln)) {
        fp(); cl(); if (/^\|[\s\-:|]+\|\s*$/.test(ln)) return;
        var cells = ln.trim().slice(1, -1).split('|').map(function (c) { return '<td>' + inline(c.trim()) + '</td>'; }).join(''), prev = out[out.length - 1];
        if (prev && prev.slice(-8) === '</table>') out[out.length - 1] = prev.slice(0, -8) + '<tr>' + cells + '</tr></table>'; else out.push('<table class="mdt"><tr>' + cells + '</tr></table>');
        return;
      }
      if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)/.exec(ln))) { fp(); if (lst !== 'ul') { cl(); out.push('<ul class="tasks">'); lst = 'ul'; } out.push('<li><input type="checkbox" data-line="' + i + '"' + (m[1] !== ' ' ? ' checked' : '') + '> <span' + (m[1] !== ' ' ? ' class="dim"' : '') + '>' + inline(m[2]) + '</span></li>'); return; }
      if ((m = /^\s*[-*]\s+(.*)/.exec(ln))) { fp(); if (lst !== 'ul') { cl(); out.push('<ul>'); lst = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = /^\s*\d+\.\s+(.*)/.exec(ln))) { fp(); if (lst !== 'ol') { cl(); out.push('<ol>'); lst = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (!ln.trim()) { fp(); cl(); return; }
      cl(); para.push(ln);
    });
    fp(); cl(); if (inCode) out.push('</code></pre>');
    return out.join('');
  }
  function drawNotes(el) {
    compute();
    var all = notes().sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
    if (!M.items[M.note] || M.items[M.note].kind !== 'note') M.note = (noteByTitle('Home') || all[0] || {}).id || null;
    var tf = M.tagFilter, q = M.nq.toLowerCase();
    var shown = all.filter(function (n) { return (!q || (n.title + ' ' + n.body).toLowerCase().indexOf(q) >= 0) && (!tf || tagsOf(n).indexOf(tf) >= 0); });
    var tc = {}; all.forEach(function (n) { tagsOf(n).forEach(function (t) { tc[t] = (tc[t] || 0) + 1; }); });
    var n = M.items[M.note];
    var html = '<div class="notes-grid"><aside class="card notes-side"><div class="row"><button class="btn primary sm" id="nNew">+ New</button><button class="btn sm" id="nToday">Today</button></div>' +
      '<input class="input" id="nq" placeholder="Search notes…" value="' + esc(M.nq) + '" style="margin:10px 0">' +
      (tf ? '<div class="small" style="margin-bottom:8px">Tag <span class="tag">#' + esc(tf) + '</span> <a href="#" id="nClearTag">clear</a></div>' : '') +
      '<div class="note-list">' + (shown.map(function (x) { return '<div class="nitem' + (x.id === M.note ? ' on' : '') + '" data-note="' + x.id + '"><div class="nt">' + esc(x.title) + '</div><div class="dim small">' + fmtAgo(x.updatedAt) + ' · ' + backlinks(x).length + ' backlinks</div></div>'; }).join('') || '<div class="dim small">No notes yet</div>') + '</div>' +
      '<div class="small muted" style="margin-top:14px">Tags</div><div class="tagcloud">' + Object.keys(tc).sort().map(function (t) { return '<a href="#" class="tagl" data-tag="' + esc(t) + '">#' + esc(t) + ' <span class="dim">' + tc[t] + '</span></a>'; }).join(' ') + '</div></aside>';
    if (!n) { html += '<div class="card empty">No notes yet — click <b>+ New</b> or <b>Today</b>.</div></div>'; el.innerHTML = html; bindNotes(el); return; }
    var bl = backlinks(n), outl = wikilinks(n.body), tg = tagsOf(n);
    html += '<section class="card note-main"><div class="row"><input class="input ntitle" id="nTitle" value="' + esc(n.title) + '"><div class="seg">' +
      [['edit', 'Edit'], ['split', 'Split'], ['preview', 'Read']].map(function (m) { return '<button data-nmode="' + m[0] + '" class="' + (M.editMode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn ghost sm" id="nDel" title="Delete note">🗑</button></div>' +
      '<div class="note-panes mode-' + M.editMode + '"><textarea class="input note-ed" id="nBody" spellcheck="true" placeholder="Write in Markdown. Link with [[Note or task name]], tag with #tag, checkboxes with - [ ]">' + esc(n.body) + '</textarea>' +
      '<div class="md note-pv" id="nPrev">' + md(n.body) + '</div></div>' +
      '<div class="small dim" style="margin-top:6px">Type <code>[[</code> to link a note or a task · <code>- [ ]</code> checkbox · Ctrl+S saves now</div></section>' +
      '<aside class="card notes-meta"><h3>Backlinks <span class="dim small">' + bl.length + '</span></h3>' + (bl.length ? bl.map(function (x) { return '<div class="lrow" data-open="' + x.id + '"><span class="dot" style="background:' + (x.kind === 'note' ? '#a78bfa' : STATE_COLOR[state(x)]) + '"></span><span class="lt">' + esc(x.title) + '</span><span class="dim small">' + (x.kind === 'note' ? 'note' : 'task') + '</span></div>'; }).join('') : '<div class="dim small">Nothing links here yet</div>') +
      '<h3 style="margin-top:16px">Outgoing</h3>' + (outl.length ? outl.map(function (t) { var ex = noteByTitle(t); return '<div class="lrow" data-wiki="' + esc(t) + '"><span class="dot" style="background:' + (ex ? '#a78bfa' : '#555') + '"></span><span class="lt">' + esc(t) + '</span>' + (ex ? '' : '<span class="dim small">create</span>') + '</div>'; }).join('') : '<div class="dim small">No [[links]]</div>') +
      '<h3 style="margin-top:16px">Tags</h3><div class="tagcloud">' + (tg.map(function (t) { return '<a href="#" class="tagl" data-tag="' + esc(t) + '">#' + esc(t) + '</a>'; }).join(' ') || '<span class="dim small">None</span>') + '</div>' +
      '<div class="small dim" style="margin-top:16px">Created ' + fmtD(String(n.createdAt).slice(0, 10)) + ' · edited ' + fmtAgo(n.updatedAt) + ' ago</div></aside></div>';
    el.innerHTML = html; bindNotes(el);
  }
  function bindNotes(el) {
    var n = M.items[M.note];
    $('#nNew', el).onclick = function () { checkpoint(); var x = newNote('Untitled ' + fmtD(today())); M.note = x.id; M.editMode = 'edit'; drawNotes(el); var t = $('#nTitle', el); t.focus(); t.select(); };
    $('#nToday', el).onclick = function () { var d = today(), x = noteByTitle(d); if (!x) { checkpoint(); x = newNote(d, '# ' + d + '\n\n## Top 3\n- [ ] \n- [ ] \n- [ ] \n\n## Notes\n\n## Wins\n\n#daily'); } M.note = x.id; drawNotes(el); };
    var q = $('#nq', el); q.oninput = function () { M.nq = q.value; var pos = q.selectionStart; drawNotes(el); var q2 = $('#nq', el); q2.focus(); q2.setSelectionRange(pos, pos); };
    if ($('#nClearTag', el)) $('#nClearTag', el).onclick = function (e) { e.preventDefault(); M.tagFilter = null; drawNotes(el); };
    el.onclick = function (e) {
      var t = e.target, a;
      if ((a = t.closest('[data-note]'))) { M.note = a.dataset.note; drawNotes(el); return; }
      if ((a = t.closest('[data-wiki]'))) { e.preventDefault(); openWiki(a.dataset.wiki); return; }
      if ((a = t.closest('[data-tag]'))) { e.preventDefault(); M.tagFilter = a.dataset.tag.toLowerCase(); drawNotes(el); return; }
      if ((a = t.closest('[data-open]'))) { select(a.dataset.open); }
    };
    if (!n) return;
    $$('[data-nmode]', el).forEach(function (b) { b.onclick = function () { M.editMode = b.dataset.nmode; drawNotes(el); }; });
    var title = $('#nTitle', el);
    title.onchange = function () {
      var old = n.title, v = title.value.trim(); if (!v || v === old) return;
      if (noteByTitle(v) && noteByTitle(v).id !== n.id) { L.toast('A note with that name already exists', 'err'); title.value = old; return; }
      checkpoint();
      var re = new RegExp('\\[\\[' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\]\\]|\\||#)', 'gi');
      list().forEach(function (x) { if (re.test(x.body || '')) { x.body = x.body.replace(re, '[[' + v + '$1'); touch(x.id); } re.lastIndex = 0; });
      if (n.body.split('\n')[0] === '# ' + old) n.body = '# ' + v + n.body.slice(2 + old.length);
      n.title = v; touch(n.id); drawNotes(el);
    };
    var ed = $('#nBody', el), pv = $('#nPrev', el), tm;
    ed.onfocus = function () { checkpoint(); };
    ed.oninput = function () { n.body = ed.value; touch(n.id); clearTimeout(tm); tm = setTimeout(function () { pv.innerHTML = md(n.body); }, 150); autocomplete(ed); };
    ed.onkeydown = function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); clearTimeout(M.saveTimer); flush(); }
      var ac = $('#wikiAc');
      if (ac && (e.key === 'Enter' || e.key === 'Tab')) { var f = ac.querySelector('[data-ac]'); if (f) { e.preventDefault(); f.click(); } }
      if (e.key === 'Escape' && ac) ac.remove();
    };
    ed.onblur = function () { setTimeout(function () { var ac = $('#wikiAc'); if (ac) ac.remove(); }, 200); };
    pv.addEventListener('change', function (e) { var ln = e.target.dataset.line; if (ln == null) return; var lines = n.body.split('\n'); lines[+ln] = lines[+ln].replace(/\[( |x|X)\]/, e.target.checked ? '[x]' : '[ ]'); n.body = lines.join('\n'); ed.value = n.body; touch(n.id); pv.innerHTML = md(n.body); });
    $('#nDel', el).onclick = function () { var bl = backlinks(n).length; if (!confirm('Delete note "' + n.title + '"?' + (bl ? ' ' + bl + ' item(s) link to it.' : ''))) return; checkpoint(); remove(n.id); M.note = null; drawNotes(el); };
  }
  function autocomplete(ed) {
    var old = $('#wikiAc'); if (old) old.remove();
    var before = ed.value.slice(0, ed.selectionStart), m = /\[\[([^\]\n]*)$/.exec(before); if (!m) return;
    var q = m[1].toLowerCase();
    var opts = notes().map(function (x) { return [x.title, 'note']; }).concat(nodes().map(function (x) { return [x.title, 'task']; })).filter(function (o) { return o[0] && o[0].toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    if (q && !opts.some(function (o) { return o[0].toLowerCase() === q; })) opts.push([m[1], 'new note']);
    if (!opts.length) return;
    var box = document.createElement('div'); box.id = 'wikiAc'; box.className = 'wiki-ac';
    box.innerHTML = opts.map(function (o) { return '<div data-ac="' + esc(o[0]) + '"><span>' + esc(o[0]) + '</span><span class="dim small">' + o[1] + '</span></div>'; }).join('');
    var r = ed.getBoundingClientRect(); box.style.left = (r.left + 16) + 'px'; box.style.top = Math.min(window.innerHeight - 260, r.top + 40) + 'px';
    document.body.appendChild(box);
    box.onmousedown = function (e) { e.preventDefault(); };
    box.onclick = function (e) { var a = e.target.closest('[data-ac]'); if (!a) return; var pos = ed.selectionStart, start = before.length - m[1].length, after = ed.value.slice(pos).replace(/^\]\]/, ''); ed.value = ed.value.slice(0, start) + a.dataset.ac + ']]' + after; var np = start + a.dataset.ac.length + 2; ed.setSelectionRange(np, np); ed.focus(); box.remove(); ed.oninput(); };
  }

  // ---------- GRAPH ----------
  function drawGraph(el) {
    compute();
    var ns = notes(), idx = {}, gn = [], ge = [];
    ns.forEach(function (n) { idx[n.title.toLowerCase()] = gn.length; gn.push({ id: n.id, label: n.title, kind: 'note', deg: 0 }); });
    ns.forEach(function (n) { wikilinks(n.body).forEach(function (w) { var j = idx[w.toLowerCase()]; if (j != null && gn[j].id !== n.id) ge.push([idx[n.title.toLowerCase()], j]); }); });
    nodes().forEach(function (x) { var ws = wikilinks(x.body).map(function (w) { return idx[w.toLowerCase()]; }).filter(function (j) { return j != null; }); if (ws.length) { var k = gn.length; gn.push({ id: x.id, label: x.title, kind: 'task', st: state(x), deg: 0 }); ws.forEach(function (j) { ge.push([k, j]); }); } });
    if (M.graphTags) { var ti = {}; ns.forEach(function (n) { tagsOf(n).forEach(function (t) { if (ti[t] == null) { ti[t] = gn.length; gn.push({ id: 'tag:' + t, label: '#' + t, kind: 'tag', deg: 0 }); } ge.push([idx[n.title.toLowerCase()], ti[t]]); }); }); }
    if (!gn.length) { el.innerHTML = '<div class="card empty">No notes yet. Notes linked with [[double brackets]] appear here as a graph.</div>'; return; }
    ge.forEach(function (e) { gn[e[0]].deg++; gn[e[1]].deg++; });
    var W = 1000, H = 640;
    gn.forEach(function (n, i) { var a = i / gn.length * Math.PI * 2; n.x = W / 2 + Math.cos(a) * 220 + Math.random() * 20; n.y = H / 2 + Math.sin(a) * 220 + Math.random() * 20; n.vx = n.vy = 0; });
    for (var it = 0; it < 300; it++) {
      for (var i = 0; i < gn.length; i++) for (var j = i + 1; j < gn.length; j++) { var a = gn[i], b = gn[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), f = 2600 / d2; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; }
      ge.forEach(function (e) { var a = gn[e[0]], b = gn[e[1]], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 110) * 0.02; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; });
      gn.forEach(function (n) { n.vx += (W / 2 - n.x) * 0.004; n.vy += (H / 2 - n.y) * 0.004; n.x += n.vx * 0.5; n.y += n.vy * 0.5; n.vx *= 0.6; n.vy *= 0.6; });
    }
    var cur = M.note;
    el.innerHTML = '<div class="toolbar"><span class="small muted">' + ns.length + ' notes · ' + ge.length + ' links. Click a dot to open it.</span><span class="spacer"></span><label class="row small"><input type="checkbox" id="gTags"' + (M.graphTags ? ' checked' : '') + '> Show tags</label></div>' +
      '<div class="card graph-card"><svg id="gSvg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="640">' +
      ge.map(function (e) { var a = gn[e[0]], b = gn[e[1]]; return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="g-edge' + (a.id === cur || b.id === cur ? ' hot' : '') + '"/>'; }).join('') +
      gn.map(function (n) { var r = n.kind === 'note' ? 6 + Math.min(10, n.deg * 1.6) : n.kind === 'tag' ? 5 : 4, fill = n.kind === 'note' ? (n.id === cur ? '#0077ff' : '#a78bfa') : n.kind === 'tag' ? '#14b8a6' : STATE_COLOR[n.st]; return '<g class="g-node" data-gid="' + esc(n.id) + '"><circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="' + fill + '"/><text x="' + n.x + '" y="' + (n.y + r + 13) + '" text-anchor="middle" class="g-label' + (n.kind === 'note' ? '' : ' small') + '">' + esc(trunc(n.label, 26)) + '</text></g>'; }).join('') + '</svg>' +
      '<div class="legend" style="padding:0 12px 10px"><span><i style="background:#a78bfa"></i>Note</span><span><i style="background:#0077ff"></i>Current note</span><span><i style="background:#14b8a6"></i>Tag</span><span><i style="background:#f5a524"></i>Task linking a note</span></div></div>';
    $('#gTags', el).onchange = function () { M.graphTags = this.checked; drawGraph(el); };
    $('#gSvg', el).onclick = function (e) { var g = e.target.closest('[data-gid]'); if (!g) return; var id = g.dataset.gid; if (id.indexOf('tag:') === 0) { M.tagFilter = id.slice(4); M.tab = 'notes'; draw(); } else select(id); };
  }

  // Undo / redo from anywhere in My Mind (outside text fields)
  document.addEventListener('keydown', function (e) {
    if (!root || !document.body.contains(root) || !L || L.S.view !== 'mind') return;
    var a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (a && (a.id === 'mapWrap' || a.id === 'mOutline')) return;
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'Escape' && Object.keys(M.multi).length) { M.multi = {}; draw(); }
  });

  // App shortcuts (/mind/#map, #calendar, #notes …) also work while the app is already open
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').slice(1);
    if (!h || !VIEWS.some(function (v) { return v[0] === h; })) return;
    M.tab = h; history.replaceState(null, '', location.pathname + location.search);
    if (M.loaded && root && document.body.contains(root)) draw();
  });

  window.LCMMind = { view: view, flush: flush, isBusy: function () { return Object.keys(M.dirty).length > 0; } };
})();
