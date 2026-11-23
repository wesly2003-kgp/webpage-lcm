/* LCM Work Portal — "My Mind": private mind tree (tasks with links) + Obsidian-style notes + graph. */
(function () {
  'use strict';
  var L; // app helpers (window.LCM), set on first view
  var M = {
    items: {}, loaded: false, loading: false, mode: 'remote', error: '',
    tab: 'tree', sel: null, note: null, filter: 'all', q: '', nq: '',
    dirty: {}, deleted: {}, saveTimer: null, saving: false, status: '',
    map: { x: 40, y: 0, k: 1, focus: null, deps: true }, editMode: 'split', graphTags: false
  };
  var STATUS = { todo: 'To do', doing: 'Doing', done: 'Done' };

  // ---------- helpers ----------
  function esc(s) { return L.esc(s); }
  function uid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nodes() { return Object.keys(M.items).map(function (k) { return M.items[k]; }).filter(function (x) { return x.kind === 'node'; }); }
  function notes() { return Object.keys(M.items).map(function (k) { return M.items[k]; }).filter(function (x) { return x.kind === 'note'; }); }
  function kids(id) { return nodes().filter(function (n) { return (n.parentId || '') === (id || ''); }).sort(function (a, b) { return (+a.order || 0) - (+b.order || 0); }); }
  function deps(n) { return String(n.links || '').split(',').filter(function (id) { return id && M.items[id] && M.items[id].kind === 'node'; }); }
  function localKey() { return 'lcm_mind_local_' + L.S.data.me.email; }
  function fmtAgo(s) { var m = Math.round((Date.now() - Date.parse(s)) / 6e4); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }

  // Computed tree facts (recomputed on each render; 100s of nodes is cheap)
  var C;
  function compute() {
    var ch = {}, all = nodes();
    all.forEach(function (n) { (ch[n.parentId || ''] = ch[n.parentId || ''] || []).push(n); });
    Object.keys(ch).forEach(function (k) { ch[k].sort(function (a, b) { return (+a.order || 0) - (+b.order || 0); }); });
    var prog = {};
    function walk(n) {
      var c = ch[n.id] || [];
      if (!c.length) { prog[n.id] = { done: n.status === 'done' ? 1 : 0, total: 1 }; return prog[n.id]; }
      var d = 0, t = 0; c.forEach(function (x) { var p = walk(x); d += p.done; t += p.total; });
      prog[n.id] = { done: d, total: t }; return prog[n.id];
    }
    (ch[''] || []).forEach(walk);
    var unblocks = {};
    all.forEach(function (n) { deps(n).forEach(function (d) { (unblocks[d] = unblocks[d] || []).push(n.id); }); });
    C = { ch: ch, prog: prog, unblocks: unblocks };
  }
  function isLeaf(n) { return !(C.ch[n.id] || []).length; }
  function isDone(n) { var p = C.prog[n.id]; return p ? p.done === p.total : n.status === 'done'; }
  function openDeps(n) { return deps(n).filter(function (d) { return !isDone(M.items[d]); }); }
  function state(n) {
    if (isDone(n)) return 'done';
    if (openDeps(n).length) return 'blocked';
    if (n.status === 'doing') return 'doing';
    return isLeaf(n) ? 'ready' : 'open';
  }
  var STATE_LABEL = { done: 'Done', blocked: 'Blocked', doing: 'Doing', ready: 'Ready', open: 'Open' };
  var STATE_COLOR = { done: '#22c55e', blocked: '#ef4444', doing: '#0077ff', ready: '#f5a524', open: '#8b93a7' };
  function path(n) { var p = []; var cur = n; var guard = 0; while (cur && cur.parentId && guard++ < 50) { cur = M.items[cur.parentId]; if (cur) p.unshift(cur); } return p; }

  // ---------- storage ----------
  function load() {
    if (M.loading) return; M.loading = true; M.error = '';
    L.api('mindLoad').then(function (r) {
      M.mode = 'remote'; set(r.items || []);
      var local = readLocal();
      if (!r.items.length && local.length) { set(local); markAll(); flush(true); }
      else if (!r.items.length) { seed(); }
    }).catch(function (e) {
      if (/Unknown action/i.test(e.message)) { M.mode = 'local'; var local = readLocal(); if (local.length) set(local); else seed(); }
      else { M.error = e.message; }
    }).then(function () { M.loaded = true; M.loading = false; draw(); });
  }
  function set(list) { M.items = {}; list.forEach(function (x) { M.items[x.id] = x; }); }
  function readLocal() { try { return JSON.parse(localStorage.getItem(localKey()) || '[]'); } catch (e) { return []; } }
  function markAll() { Object.keys(M.items).forEach(function (k) { M.dirty[k] = 1; }); }
  function touch(id) { if (M.items[id]) M.items[id].updatedAt = new Date().toISOString(); M.dirty[id] = 1; schedule(); }
  function remove(id) { delete M.items[id]; delete M.dirty[id]; M.deleted[id] = 1; schedule(); }
  function schedule() { M.status = 'Unsaved…'; setStatus(); clearTimeout(M.saveTimer); M.saveTimer = setTimeout(flush, 900); }
  function flush(force) {
    var ups = Object.keys(M.dirty).map(function (k) { return M.items[k]; }).filter(Boolean);
    var dels = Object.keys(M.deleted);
    if (!ups.length && !dels.length) return Promise.resolve();
    if (M.mode === 'local') {
      try { localStorage.setItem(localKey(), JSON.stringify(Object.keys(M.items).map(function (k) { return M.items[k]; }))); } catch (e) {}
      M.dirty = {}; M.deleted = {}; M.status = 'Saved on this device'; setStatus(); return Promise.resolve();
    }
    if (M.saving && !force) { schedule(); return Promise.resolve(); }
    M.saving = true; M.dirty = {}; M.deleted = {}; M.status = 'Saving…'; setStatus();
    return L.api('mindSync', { upserts: ups, deletes: dels }).then(function () {
      M.saving = false; M.status = 'Saved ✓'; setStatus();
      try { localStorage.removeItem(localKey()); } catch (e) {}
    }).catch(function (e) {
      M.saving = false;
      ups.forEach(function (u) { M.dirty[u.id] = 1; }); dels.forEach(function (d) { M.deleted[d] = 1; });
      M.status = 'Not saved — retrying'; setStatus(); L.toast('My Mind: ' + e.message, 'err');
      clearTimeout(M.saveTimer); M.saveTimer = setTimeout(flush, 5000);
    });
  }
  function setStatus() { var el = document.getElementById('mindStatus'); if (el) el.textContent = M.status; }
  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(M.dirty).length || Object.keys(M.deleted).length) {
      if (M.mode === 'remote' && L && L.API_URL && navigator.sendBeacon) {
        var ups = Object.keys(M.dirty).map(function (k) { return M.items[k]; }).filter(Boolean);
        navigator.sendBeacon(L.API_URL, new Blob([JSON.stringify({ action: 'mindSync', token: L.S.token, payload: { upserts: ups, deletes: Object.keys(M.deleted) } })], { type: 'text/plain' }));
      } else { flush(); }
    }
  });

  function seed() {
    var S = window.LCM_MIND_SEED; if (!S) return;
    var keyToId = {}, pending = [], now = new Date().toISOString();
    function add(n, parent, i) {
      var id = uid() + i; keyToId[n.k || id] = id;
      var it = { id: id, kind: 'node', parentId: parent || '', title: n.t, body: n.b || '', status: n.s === 'done' ? 'done' : n.s === 'doing' ? 'doing' : 'todo',
        links: '', tags: '', order: i, collapsed: '', createdAt: now, updatedAt: now };
      M.items[id] = it; pending.push([it, n.d || []]);
      (n.c || []).forEach(function (c, j) { add(c, id, j); });
    }
    S.tree.forEach(function (n, i) { add(n, '', i); });
    pending.forEach(function (p) { p[0].links = p[1].map(function (k) { return keyToId[k]; }).filter(Boolean).join(','); });
    // Top-level branches start expanded, their children collapsed for a tidy first view
    S.notes.forEach(function (n, i) { var id = uid() + 'n' + i; M.items[id] = { id: id, kind: 'note', parentId: '', title: n.t, body: n.b, status: '', links: '', tags: n.tags || '', order: i, collapsed: '', createdAt: now, updatedAt: now }; });
    markAll(); flush(true);
    L.toast('My Mind is ready — starter plan with ' + nodes().length + ' items and ' + notes().length + ' notes loaded', 'ok');
  }

  // ---------- view shell ----------
  var root;
  function view(c, app) {
    L = app; root = c;
    if (!M.loaded) { c.innerHTML = '<div class="card empty">Opening your mind…</div>'; load(); return; }
    draw();
  }
  function draw() {
    if (!root || !document.body.contains(root)) return;
    if (M.error) { root.innerHTML = '<div class="card empty">Could not load My Mind: ' + esc(M.error) + '<br><br><button class="btn sm" id="mRetry">Retry</button></div>'; document.getElementById('mRetry').onclick = function () { M.loaded = false; M.error = ''; view(root, L); }; return; }
    compute();
    var tabs = [['tree', 'Mind Tree'], ['map', 'Mind Map'], ['notes', 'Notes'], ['graph', 'Graph']];
    var html = (M.mode === 'local' ? '<div class="alert amber">Saved on this device only — update the Apps Script backend to sync My Mind to your Google Sheet (it will upload automatically).</div>' : '') +
      '<div class="toolbar mind-top"><div class="seg">' + tabs.map(function (t) { return '<button data-mtab="' + t[0] + '" class="' + (M.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<span class="spacer"></span><span class="small dim" id="mindStatus">' + esc(M.status || (M.mode === 'local' ? 'Saved on this device' : 'All changes saved')) + '</span>' +
      '<span class="tag">🔒 Private to you</span></div><div id="mindBody"></div>';
    root.innerHTML = html;
    Array.prototype.forEach.call(root.querySelectorAll('[data-mtab]'), function (b) { b.onclick = function () { M.tab = b.dataset.mtab; draw(); }; });
    var body = document.getElementById('mindBody');
    body.onclick = body.ondblclick = body.onchange = null;
    ({ tree: drawTree, map: drawMap, notes: drawNotes, graph: drawGraph })[M.tab](body);
  }

  // ---------- Mind Tree ----------
  function stats() {
    var leaves = nodes().filter(isLeaf), by = { done: 0, ready: 0, blocked: 0, doing: 0 };
    leaves.forEach(function (n) { var s = state(n); if (by[s] !== undefined) by[s]++; });
    return { total: leaves.length, by: by, pct: leaves.length ? Math.round(by.done / leaves.length * 100) : 0 };
  }
  function matches(n) {
    var s = state(n), f = M.filter;
    if (M.q && n.title.toLowerCase().indexOf(M.q.toLowerCase()) < 0 && String(n.body || '').toLowerCase().indexOf(M.q.toLowerCase()) < 0) return false;
    if (f === 'all') return true;
    if (f === 'open') return s !== 'done';
    return s === f && (f !== 'ready' || isLeaf(n));
  }
  function visibleSet() {
    if (M.filter === 'all' && !M.q) return null;
    var vis = {};
    nodes().forEach(function (n) { if (matches(n)) { vis[n.id] = 2; path(n).forEach(function (p) { if (!vis[p.id]) vis[p.id] = 1; }); } });
    return vis;
  }
  function drawTree(el) {
    compute();
    var st = stats();
    var html = '<div class="kpis mind-kpis">' + [
      ['Work items', st.total, (nodes().length - st.total) + ' groups', '#0077ff'], ['Done', st.by.done, st.pct + '% complete', '#22c55e'],
      ['Ready now', st.by.ready, 'nothing blocking', '#f5a524'], ['Doing', st.by.doing, 'in progress', '#3b95ff'], ['Blocked', st.by.blocked, 'waiting on links', '#ef4444']
    ].map(function (k) { return '<div class="kpi" style="--accent:' + k[3] + '"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div><div class="sub">' + k[2] + '</div></div>'; }).join('') +
      '<div class="kpi" style="--accent:#22c55e;display:flex;align-items:center;justify-content:center">' + L.ring(st.pct, 74) + '</div></div>';
    html += '<div class="toolbar"><input class="input search" id="mq" placeholder="Search tasks…" value="' + esc(M.q) + '"><div class="seg">' +
      [['all', 'All'], ['ready', 'Ready'], ['doing', 'Doing'], ['blocked', 'Blocked'], ['open', 'Open'], ['done', 'Done']].map(function (f) { return '<button data-mf="' + f[0] + '" class="' + (M.filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') +
      '</div><span class="spacer"></span><button class="btn sm" id="mExpand">Expand all</button><button class="btn sm" id="mCollapse">Collapse all</button><button class="btn primary sm" id="mAddRoot">' + L.icon('plus', 15) + ' Branch</button></div>';
    html += '<div class="mind-grid"><div class="card mind-outline" id="mOutline" tabindex="0">' + outline() + '</div><div class="card mind-detail" id="mDetail">' + detail() + '</div></div>' +
      '<p class="small dim">Keys (outline focused): ↑/↓ move · Space done · Enter new sibling · Tab / Shift+Tab indent · F2 rename · Del delete</p>';
    el.innerHTML = html;
    bindTree(el);
  }
  function outline() {
    var vis = visibleSet(), out = '';
    function row(n, depth) {
      if (vis && !vis[n.id]) return;
      var c = C.ch[n.id] || [], s = state(n), p = C.prog[n.id], open = !n.collapsed || (vis && c.some(function (x) { return vis[x.id]; }));
      var dl = deps(n).length, ub = (C.unblocks[n.id] || []).length;
      out += '<div class="mrow' + (M.sel === n.id ? ' sel' : '') + (vis && vis[n.id] === 1 ? ' ghost' : '') + ' st-' + s + '" data-id="' + n.id + '" style="--d:' + depth + '">' +
        (c.length ? '<button class="caret" data-caret="' + n.id + '">' + (open ? '▾' : '▸') + '</button>' : '<span class="caret"></span>') +
        '<input type="checkbox" data-check="' + n.id + '"' + (isDone(n) ? ' checked' : '') + (s === 'blocked' ? ' title="Blocked by ' + openDeps(n).length + ' open link(s)"' : '') + '>' +
        '<span class="mt">' + esc(n.title || 'Untitled') + '</span>' +
        (c.length ? '<span class="mini"><span style="width:' + Math.round(p.done / p.total * 100) + '%"></span></span><span class="dim small nowrap">' + p.done + '/' + p.total + '</span>' : '') +
        (s !== 'done' && s !== 'open' ? '<span class="chip c-' + s + '">' + STATE_LABEL[s] + '</span>' : '') +
        (dl ? '<span class="dim small" title="Depends on ' + dl + '">🔗' + dl + '</span>' : '') + (ub ? '<span class="dim small" title="Unblocks ' + ub + '">→' + ub + '</span>' : '') +
        '<button class="add" data-addchild="' + n.id + '" title="Add sub-task">+</button></div>';
      if (open) c.forEach(function (x) { row(x, depth + 1); });
    }
    (C.ch[''] || []).forEach(function (n) { row(n, 0); });
    return out || '<div class="empty">Nothing matches</div>';
  }
  function detail() {
    var n = M.items[M.sel];
    if (!n || n.kind !== 'node') {
      var ready = nodes().filter(function (x) { return isLeaf(x) && state(x) === 'ready'; }).slice(0, 12);
      var doing = nodes().filter(function (x) { return isLeaf(x) && state(x) === 'doing'; });
      return '<h3>Focus now</h3><div class="small muted" style="margin-bottom:8px">Doing</div>' + (doing.length ? doing.map(function (x) { return linkRow(x); }).join('') : '<div class="dim small">Nothing in progress</div>') +
        '<div class="small muted" style="margin:14px 0 8px">Ready — nothing blocking these</div>' + (ready.length ? ready.map(function (x) { return linkRow(x); }).join('') : '<div class="dim small">No ready items</div>') +
        '<p class="small dim" style="margin-top:14px">Select any item to see its links, notes and what it unblocks.</p>';
    }
    var s = state(n), p = C.prog[n.id], leaf = isLeaf(n);
    var dl = deps(n), ub = C.unblocks[n.id] || [];
    return '<div class="crumbs small dim">' + path(n).map(function (x) { return '<a href="#" data-goto="' + x.id + '">' + esc(x.title) + '</a>'; }).join(' › ') + '</div>' +
      '<input class="input mtitle" id="mTitle" value="' + esc(n.title) + '">' +
      '<div class="row wrap" style="margin:12px 0">' + (leaf ? '<div class="seg">' + ['todo', 'doing', 'done'].map(function (k) { return '<button data-mstatus="' + k + '" class="' + ((n.status || 'todo') === k ? 'on' : '') + '">' + STATUS[k] + '</button>'; }).join('') + '</div>' : '<span class="small muted">' + p.done + ' of ' + p.total + ' sub-tasks done</span>') +
      '<span class="chip c-' + s + '">' + STATE_LABEL[s] + '</span></div>' +
      (!leaf ? '<div class="progress" style="margin-bottom:12px"><span style="width:' + Math.round(p.done / p.total * 100) + '%;background:#22c55e"></span></div>' : '') +
      '<div class="small muted">Depends on (must be done first)</div>' + (dl.length ? dl.map(function (id) { return linkRow(M.items[id], true); }).join('') : '<div class="dim small">No links</div>') +
      '<div class="dep-add"><input class="input" id="mDepQ" placeholder="+ Link a task this depends on…" autocomplete="off"><div id="mDepList" class="dep-list"></div></div>' +
      '<div class="small muted" style="margin-top:12px">Unblocks</div>' + (ub.length ? ub.map(function (id) { return linkRow(M.items[id]); }).join('') : '<div class="dim small">Nothing waits on this</div>') +
      '<div class="small muted" style="margin-top:14px">Notes (Markdown, [[Note]] links)</div><textarea class="input" id="mBody" style="min-height:120px">' + esc(n.body || '') + '</textarea>' +
      '<div class="md small" style="margin-top:8px">' + md(n.body || '') + '</div>' +
      '<div class="row" style="margin-top:14px"><button class="btn sm" data-addchild="' + n.id + '">+ Sub-task</button><button class="btn sm" id="mSibling">+ Sibling</button><span class="spacer"></span><button class="btn danger sm" id="mDel">Delete</button></div>';
  }
  function linkRow(n, removable) {
    var s = state(n);
    return '<div class="lrow" data-goto="' + n.id + '"><span class="dot" style="background:' + STATE_COLOR[s] + '"></span><span class="lt">' + esc(n.title) + '</span><span class="dim small nowrap">' + esc((M.items[n.parentId] || {}).title || '') + '</span>' +
      (removable ? '<button class="btn ghost sm" data-undep="' + n.id + '" title="Remove link">×</button>' : '') + '</div>';
  }
  function addNode(parentId, afterId) {
    var sibs = kids(parentId), order = sibs.length;
    if (afterId) { var idx = sibs.map(function (x) { return x.id; }).indexOf(afterId); order = idx + 1; sibs.slice(order).forEach(function (x) { x.order = (+x.order || 0) + 1; touch(x.id); }); }
    var now = new Date().toISOString(), id = uid();
    M.items[id] = { id: id, kind: 'node', parentId: parentId || '', title: '', body: '', status: 'todo', links: '', tags: '', order: order, collapsed: '', createdAt: now, updatedAt: now };
    if (parentId && M.items[parentId].collapsed) { M.items[parentId].collapsed = ''; touch(parentId); }
    // A parent's own status no longer matters once it has children; clear it
    touch(id); M.sel = id; M.filter = 'all'; M.q = ''; drawTree(document.getElementById('mindBody'));
    rename(id);
  }
  function rename(id) {
    var rowEl = root.querySelector('.mrow[data-id="' + id + '"] .mt'); if (!rowEl) return;
    var n = M.items[id], inp = document.createElement('input');
    inp.className = 'input mrename'; inp.value = n.title; rowEl.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function commit(next) {
      if (done) return; done = true;
      var v = inp.value.trim();
      if (!v && !n.title) { removeTree(id); } else if (v && v !== n.title) { n.title = v; touch(id); }
      drawTree(document.getElementById('mindBody'));
      if (next) addNode(n.parentId, id); else { var o = document.getElementById('mOutline'); if (o) o.focus(); }
    }
    inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(!!inp.value.trim()); } if (e.key === 'Escape') { inp.value = n.title; commit(false); } };
    inp.onblur = function () { commit(false); };
  }
  function removeTree(id) {
    (C.ch[id] || kids(id)).forEach(function (c) { removeTree(c.id); });
    nodes().forEach(function (x) { var l = deps(x); if (l.indexOf(id) >= 0) { x.links = l.filter(function (y) { return y !== id; }).join(','); touch(x.id); } });
    remove(id); compute();
  }
  function setDone(n, done) {
    if (isLeaf(n)) { n.status = done ? 'done' : 'todo'; touch(n.id); return; }
    (C.ch[n.id] || []).forEach(function (c) { setDone(c, done); });
  }
  function moveIndent(n, dir) {
    var sibs = kids(n.parentId), idx = sibs.indexOf(n);
    if (dir > 0) { if (idx < 1) return; var np = sibs[idx - 1]; n.parentId = np.id; n.order = kids(np.id).length; np.collapsed = ''; touch(np.id); }
    else { if (!n.parentId) return; var par = M.items[n.parentId]; var ps = kids(par.parentId); n.parentId = par.parentId; n.order = (+par.order || 0) + 0.5; ps.concat([n]).sort(function (a, b) { return a.order - b.order; }).forEach(function (x, i) { x.order = i; touch(x.id); }); }
    touch(n.id);
  }
  function bindTree(el) {
    var redraw = function () { drawTree(el); };
    var q = el.querySelector('#mq'); q.oninput = function () { M.q = q.value; var o = el.querySelector('#mOutline'); compute(); o.innerHTML = outline(); };
    q.onkeydown = function (e) { if (e.key === 'Escape') { q.value = ''; M.q = ''; redraw(); } };
    Array.prototype.forEach.call(el.querySelectorAll('[data-mf]'), function (b) { b.onclick = function () { M.filter = b.dataset.mf; redraw(); }; });
    el.querySelector('#mExpand').onclick = function () { nodes().forEach(function (n) { if (n.collapsed) { n.collapsed = ''; touch(n.id); } }); redraw(); };
    el.querySelector('#mCollapse').onclick = function () { nodes().forEach(function (n) { if (n.parentId && !isLeaf(n) && !n.collapsed) { n.collapsed = 'true'; touch(n.id); } }); redraw(); };
    el.querySelector('#mAddRoot').onclick = function () { addNode('', null); };
    el.onclick = function (e) {
      var t = e.target, id;
      if ((id = t.dataset.caret)) { var n = M.items[id]; n.collapsed = n.collapsed ? '' : 'true'; touch(id); redraw(); return; }
      if ((id = t.dataset.addchild)) { addNode(id, null); return; }
      if ((id = t.dataset.undep)) { e.stopPropagation(); var cur = M.items[M.sel]; cur.links = deps(cur).filter(function (x) { return x !== id; }).join(','); touch(cur.id); redraw(); return; }
      var go = t.closest('[data-goto]'); if (go) { e.preventDefault(); select(go.dataset.goto); return; }
      var r = t.closest('.mrow'); if (r && !t.dataset.check) { M.sel = r.dataset.id; redraw(); el.querySelector('#mOutline').focus(); }
    };
    el.ondblclick = function (e) { var r = e.target.closest('.mrow'); if (r && e.target.classList.contains('mt')) rename(r.dataset.id); };
    el.onchange = function (e) {
      var id = e.target.dataset.check; if (!id) return;
      var n = M.items[id];
      if (e.target.checked && state(n) === 'blocked' && !confirm('"' + n.title + '" is still blocked by ' + openDeps(n).length + ' open link(s). Mark it done anyway?')) { e.target.checked = false; return; }
      if (!isLeaf(n) && !confirm((e.target.checked ? 'Mark all ' : 'Re-open all ') + C.prog[id].total + ' sub-tasks of "' + n.title + '"?')) { e.target.checked = !e.target.checked; return; }
      setDone(n, e.target.checked); redraw();
      if (e.target.checked) { var un = (C.unblocks[id] || []).map(function (x) { return M.items[x]; }).filter(function (x) { return x && state(x) === 'ready'; }); if (un.length) L.toast('Unblocked: ' + un.map(function (x) { return x.title; }).join(', '), 'ok'); }
    };
    var o = el.querySelector('#mOutline');
    o.onkeydown = function (e) {
      if (e.target !== o) return;
      var order = Array.prototype.map.call(o.querySelectorAll('.mrow'), function (r) { return r.dataset.id; });
      var i = order.indexOf(M.sel), n = M.items[M.sel];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); M.sel = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || order[0]; redraw(); el.querySelector('#mOutline').focus(); scrollSel(); return; }
      if (!n) return;
      if (e.key === ' ') { e.preventDefault(); compute(); setDone(n, !isDone(n)); redraw(); el.querySelector('#mOutline').focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); addNode(n.parentId, n.id); }
      else if (e.key === 'Tab') { e.preventDefault(); moveIndent(n, e.shiftKey ? -1 : 1); redraw(); el.querySelector('#mOutline').focus(); }
      else if (e.key === 'F2') { e.preventDefault(); rename(n.id); }
      else if (e.key === 'Delete') { e.preventDefault(); delNode(n); }
      else if (e.key === 'ArrowRight' && n.collapsed) { n.collapsed = ''; touch(n.id); redraw(); el.querySelector('#mOutline').focus(); }
      else if (e.key === 'ArrowLeft' && !isLeaf(n) && !n.collapsed) { n.collapsed = 'true'; touch(n.id); redraw(); el.querySelector('#mOutline').focus(); }
    };
    var n = M.items[M.sel]; if (!n) return;
    var title = el.querySelector('#mTitle'); if (title) title.onchange = function () { n.title = title.value.trim() || n.title; touch(n.id); redraw(); };
    Array.prototype.forEach.call(el.querySelectorAll('[data-mstatus]'), function (b) { b.onclick = function () { n.status = b.dataset.mstatus; touch(n.id); redraw(); }; });
    var body = el.querySelector('#mBody'); if (body) { body.oninput = function () { n.body = body.value; touch(n.id); var pv = body.nextElementSibling; if (pv) pv.innerHTML = md(n.body); }; }
    el.querySelector('#mDel').onclick = function () { delNode(n); };
    el.querySelector('#mSibling').onclick = function () { addNode(n.parentId, n.id); };
    // dependency picker
    var dq = el.querySelector('#mDepQ'), dlist = el.querySelector('#mDepList');
    dq.oninput = function () {
      var v = dq.value.toLowerCase().trim(); if (!v) { dlist.innerHTML = ''; return; }
      var banned = {}; banned[n.id] = 1; deps(n).forEach(function (x) { banned[x] = 1; });
      (function down(id) { (C.ch[id] || []).forEach(function (c) { banned[c.id] = 1; down(c.id); }); })(n.id);
      path(n).forEach(function (p) { banned[p.id] = 1; });
      var hits = nodes().filter(function (x) { return !banned[x.id] && x.title.toLowerCase().indexOf(v) >= 0 && !dependsOn(x.id, n.id); }).slice(0, 8);
      dlist.innerHTML = hits.map(function (x) { return '<div class="lrow" data-pick="' + x.id + '"><span class="dot" style="background:' + STATE_COLOR[state(x)] + '"></span><span class="lt">' + esc(x.title) + '</span><span class="dim small">' + esc((M.items[x.parentId] || {}).title || '') + '</span></div>'; }).join('') || '<div class="dim small" style="padding:6px">No match (or it would create a loop)</div>';
    };
    dlist.onclick = function (e) { var r = e.target.closest('[data-pick]'); if (!r) return; n.links = deps(n).concat([r.dataset.pick]).join(','); touch(n.id); redraw(); };
  }
  // true if `a` (transitively) depends on `b` — prevents dependency loops
  function dependsOn(a, b, seen) {
    seen = seen || {}; if (a === b) return true; if (seen[a]) return false; seen[a] = 1;
    return deps(M.items[a]).some(function (d) { return dependsOn(d, b, seen); });
  }
  function delNode(n) {
    var cnt = C.prog[n.id] ? C.prog[n.id].total : 1;
    if (!confirm('Delete "' + (n.title || 'Untitled') + '"' + (isLeaf(n) ? '' : ' and its ' + cnt + ' sub-tasks') + '?')) return;
    var sibs = kids(n.parentId), i = sibs.indexOf(n);
    removeTree(n.id); M.sel = (sibs[i + 1] || sibs[i - 1] || M.items[n.parentId] || {}).id || null;
    draw();
  }
  function select(id) {
    var n = M.items[id]; if (!n) return;
    if (n.kind === 'note') { M.tab = 'notes'; M.note = id; draw(); return; }
    path(n).forEach(function (p) { if (p.collapsed) { p.collapsed = ''; touch(p.id); } });
    M.sel = id; if (M.tab !== 'tree' && M.tab !== 'map') M.tab = 'tree';
    if (M.filter !== 'all' && !matches(n)) M.filter = 'all';
    draw(); scrollSel();
  }
  function scrollSel() { var r = root.querySelector('.mrow.sel'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' }); }

  // ---------- Mind Map (SVG tree + dependency arcs) ----------
  function drawMap(el) {
    compute();
    var focus = M.items[M.map.focus] ? M.map.focus : null;
    var rootsList = focus ? [M.items[focus]] : (C.ch[''] || []);
    var W = 230, H = 46, GAPY = 10, pos = {}, y = 0, maxD = 0;
    function place(n, d) {
      var c = C.ch[n.id] || [], open = !n.collapsed;
      maxD = Math.max(maxD, d);
      if (!c.length || !open) { pos[n.id] = { x: d * (W + 60), y: y, n: n }; y += H + GAPY; return; }
      var start = y; c.forEach(function (x) { place(x, d + 1); });
      var first = pos[c[0].id].y, last = pos[c[c.length - 1].id].y;
      pos[n.id] = { x: d * (W + 60), y: (first + last) / 2, n: n };
      if (y === start) y += H + GAPY;
    }
    rootsList.forEach(function (n) { place(n, 0); y += 20; });
    var edges = '', depEdges = '', boxes = '';
    Object.keys(pos).forEach(function (id) {
      var p = pos[id], n = p.n, c = n.collapsed ? [] : (C.ch[id] || []);
      c.forEach(function (x) { var q = pos[x.id]; if (!q) return; var x1 = p.x + W, y1 = p.y + H / 2, x2 = q.x, y2 = q.y + H / 2, mx = (x1 + x2) / 2; edges += '<path d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" class="m-edge"/>'; });
      if (M.map.deps) deps(n).forEach(function (d) {
        var q = pos[d]; if (!q) return;
        var x1 = q.x + W / 2, y1 = q.y + (q.y < p.y ? H : 0), x2 = p.x + W / 2, y2 = p.y + (q.y < p.y ? 0 : H);
        var open = !isDone(M.items[d]);
        depEdges += '<path d="M' + x1 + ' ' + y1 + ' C' + (x1 + 90) + ' ' + y1 + ' ' + (x2 + 90) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" class="m-dep' + (open ? ' open' : '') + '" marker-end="url(#arr' + (open ? 'o' : 'd') + ')"><title>' + esc(M.items[d].title + ' → ' + n.title) + '</title></path>';
      });
      var s = state(n), pr = C.prog[id], pct = Math.round(pr.done / pr.total * 100), hasKids = (C.ch[id] || []).length;
      boxes += '<g class="m-node' + (M.sel === id ? ' sel' : '') + '" data-mid="' + id + '" transform="translate(' + p.x + ',' + p.y + ')">' +
        '<rect width="' + W + '" height="' + H + '" rx="10" style="stroke:' + STATE_COLOR[s] + '"/>' +
        '<rect class="bar" x="0" y="' + (H - 4) + '" width="' + (W * pct / 100) + '" height="4" rx="2" style="fill:' + STATE_COLOR[s] + '"/>' +
        '<circle cx="14" cy="' + (H / 2 - 2) + '" r="5" style="fill:' + STATE_COLOR[s] + '"/>' +
        '<text x="26" y="' + (H / 2 + 2) + '" class="m-t">' + esc(trunc(n.title || 'Untitled', 30)) + '</text>' +
        (hasKids ? '<text x="' + (W - 10) + '" y="' + (H / 2 + 2) + '" text-anchor="end" class="m-c">' + pr.done + '/' + pr.total + (n.collapsed ? ' ▸' : '') + '</text>' : '') + '</g>';
    });
    var height = Math.max(400, y + 40), width = (maxD + 1) * (W + 60) + 200;
    el.innerHTML = '<div class="toolbar"><span class="small muted">Drag to pan · scroll / pinch to zoom · click to select · double-click to focus a branch · click a count to fold</span><span class="spacer"></span>' +
      (focus ? '<button class="btn sm" id="mmUp">↑ Up a level</button><button class="btn sm" id="mmAll">Whole map</button>' : '') +
      '<label class="row small"><input type="checkbox" id="mmDeps"' + (M.map.deps ? ' checked' : '') + '> Show links</label><button class="btn sm" id="mmFit">Fit</button></div>' +
      '<div class="mind-grid"><div class="card mind-map" id="mmWrap"><svg id="mmSvg" width="100%" height="640"><defs>' +
      '<marker id="arro" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#f5a524"/></marker>' +
      '<marker id="arrd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3a6b4a"/></marker></defs>' +
      '<g id="mmG">' + edges + depEdges + boxes + '</g></svg><div class="legend" style="padding:0 12px 10px">' + Object.keys(STATE_LABEL).map(function (k) { return '<span><i style="background:' + STATE_COLOR[k] + '"></i>' + STATE_LABEL[k] + '</span>'; }).join('') + '<span><i style="background:#f5a524;height:2px"></i>Open link</span></div></div>' +
      '<div class="card mind-detail" id="mDetail">' + detail() + '</div></div>';
    var svg = el.querySelector('#mmSvg'), g = el.querySelector('#mmG');
    function apply() { g.setAttribute('transform', 'translate(' + M.map.x + ',' + M.map.y + ') scale(' + M.map.k + ')'); }
    // Fit = whole map on screen; default view = readable width, pan/scroll for the rest
    function fit() { var bw = svg.clientWidth || 900; M.map.k = Math.max(0.2, Math.min(1, bw / width, 640 / height)); M.map.x = 20; M.map.y = 20; apply(); }
    function fitWidth() { var bw = svg.clientWidth || 900; M.map.k = Math.max(0.55, Math.min(1, (bw - 40) / width)); M.map.x = 20; M.map.y = 20; apply(); }
    if (!M.map.fitted) { M.map.fitted = true; fitWidth(); } else apply();
    var drag = null, moved = false;
    svg.onmousedown = function (e) { drag = { x: e.clientX - M.map.x, y: e.clientY - M.map.y }; moved = false; };
    window.onmousemove = function (e) { if (!drag) return; moved = true; M.map.x = e.clientX - drag.x; M.map.y = e.clientY - drag.y; apply(); };
    window.onmouseup = function () { drag = null; };
    svg.addEventListener('wheel', function (e) {
      e.preventDefault(); var r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k2 = Math.max(0.2, Math.min(2.5, M.map.k * (e.deltaY < 0 ? 1.12 : 0.89)));
      M.map.x = mx - (mx - M.map.x) * k2 / M.map.k; M.map.y = my - (my - M.map.y) * k2 / M.map.k; M.map.k = k2; apply();
    }, { passive: false });
    svg.onclick = function (e) {
      if (moved) return; var gEl = e.target.closest('[data-mid]'); if (!gEl) return;
      var id = gEl.dataset.mid;
      if (e.target.classList.contains('m-c')) { var n = M.items[id]; n.collapsed = n.collapsed ? '' : 'true'; touch(id); drawMap(el); return; }
      M.sel = id; drawMap(el);
    };
    svg.ondblclick = function (e) { var gEl = e.target.closest('[data-mid]'); if (!gEl || isLeaf(M.items[gEl.dataset.mid])) return; M.map.focus = gEl.dataset.mid; M.map.fitted = false; drawMap(el); };
    el.querySelector('#mmDeps').onchange = function () { M.map.deps = this.checked; drawMap(el); };
    el.querySelector('#mmFit').onclick = fit;
    if (el.querySelector('#mmUp')) el.querySelector('#mmUp').onclick = function () { M.map.focus = (M.items[focus] || {}).parentId || null; M.map.fitted = false; drawMap(el); };
    if (el.querySelector('#mmAll')) el.querySelector('#mmAll').onclick = function () { M.map.focus = null; M.map.fitted = false; drawMap(el); };
    // detail panel interactions reuse the tree bindings where possible
    el.querySelector('#mDetail').addEventListener('click', function (e) {
      var go = e.target.closest('[data-goto]'); if (go && !e.target.dataset.undep) { e.preventDefault(); M.sel = go.dataset.goto; drawMap(el); }
    });
    bindDetailLite(el, function () { drawMap(el); });
  }
  function bindDetailLite(el, redraw) {
    var n = M.items[M.sel]; if (!n || n.kind !== 'node') return;
    var t = el.querySelector('#mTitle'); if (t) t.onchange = function () { n.title = t.value.trim() || n.title; touch(n.id); redraw(); };
    Array.prototype.forEach.call(el.querySelectorAll('[data-mstatus]'), function (b) { b.onclick = function () { n.status = b.dataset.mstatus; touch(n.id); redraw(); }; });
    var body = el.querySelector('#mBody'); if (body) body.oninput = function () { n.body = body.value; touch(n.id); };
    Array.prototype.forEach.call(el.querySelectorAll('[data-undep]'), function (b) { b.onclick = function (e) { e.stopPropagation(); n.links = deps(n).filter(function (x) { return x !== b.dataset.undep; }).join(','); touch(n.id); redraw(); }; });
    Array.prototype.forEach.call(el.querySelectorAll('[data-addchild]'), function (b) { b.onclick = function () { M.tab = 'tree'; addNodeAfterDraw(b.dataset.addchild); }; });
    var del = el.querySelector('#mDel'); if (del) del.onclick = function () { delNode(n); };
    var sib = el.querySelector('#mSibling'); if (sib) sib.onclick = function () { M.tab = 'tree'; draw(); addNode(n.parentId, n.id); };
    var dq = el.querySelector('#mDepQ'); if (dq) { dq.placeholder = 'Open in Mind Tree to add links'; dq.disabled = true; }
  }
  function addNodeAfterDraw(pid) { draw(); addNode(pid, null); }
  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- Notes (Obsidian-style) ----------
  function noteByTitle(t) { t = String(t).trim().toLowerCase(); return notes().filter(function (n) { return n.title.trim().toLowerCase() === t; })[0]; }
  function wikilinks(body) { var out = [], re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, m; while ((m = re.exec(body || ''))) out.push(m[1].trim()); return out; }
  function tagsOf(n) { var set = {}; String(n.tags || '').split(/[\s,]+/).filter(Boolean).forEach(function (t) { set[t.replace(/^#/, '').toLowerCase()] = 1; }); var re = /(^|\s)#([A-Za-z][\w\-/]*)/g, m; while ((m = re.exec(n.body || ''))) set[m[2].toLowerCase()] = 1; return Object.keys(set); }
  function backlinks(note) { var t = note.title.toLowerCase(); return Object.keys(M.items).map(function (k) { return M.items[k]; }).filter(function (x) { return x.id !== note.id && wikilinks(x.body).some(function (w) { return w.toLowerCase() === t; }); }); }
  function newNote(title, body) {
    var now = new Date().toISOString(), id = uid();
    M.items[id] = { id: id, kind: 'note', parentId: '', title: title || 'Untitled', body: body != null ? body : '# ' + (title || 'Untitled') + '\n\n', status: '', links: '', tags: '', order: 0, collapsed: '', createdAt: now, updatedAt: now };
    touch(id); return M.items[id];
  }
  function openWiki(title) {
    var n = noteByTitle(title); if (n) { M.note = n.id; M.tab = 'notes'; draw(); return; }
    var task = nodes().filter(function (x) { return x.title.toLowerCase() === title.toLowerCase(); })[0];
    if (task) { select(task.id); return; }
    n = newNote(title); M.note = n.id; M.tab = 'notes'; M.editMode = 'edit'; draw(); L.toast('Created note "' + title + '"', 'ok');
  }
  function md(src) {
    var lines = String(src || '').replace(/\r/g, '').split('\n'), out = [], inCode = false, list = null, para = [];
    function inline(s) {
      s = esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
        .replace(/~~([^~]+)~~/g, '<s>$1</s>')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, t, a) { var ex = noteByTitle(t) || nodes().some(function (x) { return x.title.toLowerCase() === t.trim().toLowerCase(); }); return '<a href="#" class="wl' + (ex ? '' : ' new') + '" data-wiki="' + t.trim() + '">' + (a || t) + '</a>'; })
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/(^|\s)#([A-Za-z][\w\-/]*)/g, '$1<a href="#" class="tagl" data-tag="$2">#$2</a>');
      return s;
    }
    function flushPara() { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } }
    function closeList() { if (list) { out.push('</' + list + '>'); list = null; } }
    lines.forEach(function (ln, i) {
      if (/^```/.test(ln)) { flushPara(); closeList(); out.push(inCode ? '</code></pre>' : '<pre><code>'); inCode = !inCode; return; }
      if (inCode) { out.push(esc(ln) + '\n'); return; }
      var m;
      if ((m = /^(#{1,6})\s+(.*)/.exec(ln))) { flushPara(); closeList(); out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); return; }
      if (/^\s*(---|\*\*\*)\s*$/.test(ln)) { flushPara(); closeList(); out.push('<hr>'); return; }
      if ((m = /^>\s?(.*)/.exec(ln))) { flushPara(); closeList(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
      if (/^\|.*\|\s*$/.test(ln)) {
        flushPara(); closeList();
        if (/^\|[\s\-:|]+\|\s*$/.test(ln)) return;
        var cells = ln.trim().slice(1, -1).split('|').map(function (c) { return '<td>' + inline(c.trim()) + '</td>'; }).join('');
        var prev = out[out.length - 1];
        if (prev && prev.indexOf('</table>') === prev.length - 8) out[out.length - 1] = prev.slice(0, -8) + '<tr>' + cells + '</tr></table>';
        else out.push('<table class="mdt"><tr>' + cells + '</tr></table>');
        return;
      }
      if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)/.exec(ln))) { flushPara(); if (list !== 'ul') { closeList(); out.push('<ul class="tasks">'); list = 'ul'; } out.push('<li><input type="checkbox" data-line="' + i + '"' + (m[1] !== ' ' ? ' checked' : '') + '> <span' + (m[1] !== ' ' ? ' class="dim"' : '') + '>' + inline(m[2]) + '</span></li>'); return; }
      if ((m = /^\s*[-*]\s+(.*)/.exec(ln))) { flushPara(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = /^\s*\d+\.\s+(.*)/.exec(ln))) { flushPara(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (!ln.trim()) { flushPara(); closeList(); return; }
      closeList(); para.push(ln);
    });
    flushPara(); closeList(); if (inCode) out.push('</code></pre>');
    return out.join('');
  }
  function drawNotes(el) {
    compute();
    var all = notes().sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
    if (!M.items[M.note] || M.items[M.note].kind !== 'note') M.note = (noteByTitle('Home') || all[0] || {}).id || null;
    var tagFilter = M.tagFilter, q = M.nq.toLowerCase();
    var list = all.filter(function (n) { return (!q || (n.title + ' ' + n.body).toLowerCase().indexOf(q) >= 0) && (!tagFilter || tagsOf(n).indexOf(tagFilter) >= 0); });
    var tagCount = {}; all.forEach(function (n) { tagsOf(n).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
    var n = M.items[M.note];
    var html = '<div class="notes-grid"><aside class="card notes-side"><div class="row"><button class="btn primary sm" id="nNew">' + L.icon('plus', 15) + ' New</button><button class="btn sm" id="nToday">Today</button></div>' +
      '<input class="input" id="nq" placeholder="Search notes…" value="' + esc(M.nq) + '" style="margin:10px 0">' +
      (tagFilter ? '<div class="small" style="margin-bottom:8px">Tag <span class="tag">#' + esc(tagFilter) + '</span> <a href="#" id="nClearTag">clear</a></div>' : '') +
      '<div class="note-list">' + (list.map(function (x) { return '<div class="nitem' + (x.id === M.note ? ' on' : '') + '" data-note="' + x.id + '"><div class="nt">' + esc(x.title) + '</div><div class="dim small">' + fmtAgo(x.updatedAt) + ' · ' + backlinks(x).length + ' backlinks</div></div>'; }).join('') || '<div class="dim small">No notes</div>') + '</div>' +
      '<div class="small muted" style="margin-top:14px">Tags</div><div class="tagcloud">' + Object.keys(tagCount).sort().map(function (t) { return '<a href="#" class="tagl" data-tag="' + esc(t) + '">#' + esc(t) + ' <span class="dim">' + tagCount[t] + '</span></a>'; }).join(' ') + '</div></aside>';
    if (!n) { html += '<div class="card empty">No note selected — create one.</div></div>'; el.innerHTML = html; bindNotes(el); return; }
    var bl = backlinks(n), outl = wikilinks(n.body), tg = tagsOf(n);
    var linkedTasks = nodes().filter(function (x) { return wikilinks(x.body).some(function (w) { return w.toLowerCase() === n.title.toLowerCase(); }); });
    html += '<section class="card note-main"><div class="row"><input class="input ntitle" id="nTitle" value="' + esc(n.title) + '"><div class="seg">' +
      [['edit', 'Edit'], ['split', 'Split'], ['preview', 'Read']].map(function (m) { return '<button data-nmode="' + m[0] + '" class="' + (M.editMode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn ghost sm" id="nDel" title="Delete note">🗑</button></div>' +
      '<div class="note-panes mode-' + M.editMode + '"><textarea class="input note-ed" id="nBody" spellcheck="true" placeholder="Write in Markdown. Link notes with [[Note name]], tag with #tag, tasks with - [ ]">' + esc(n.body) + '</textarea>' +
      '<div class="md note-pv" id="nPrev">' + md(n.body) + '</div></div>' +
      '<div class="small dim" style="margin-top:6px">Tip: type <code>[[</code> to link a note or a Mind Tree task · <code>- [ ]</code> makes a checkbox · Ctrl+S saves now</div></section>' +
      '<aside class="card notes-meta"><h3>Backlinks <span class="dim small">' + bl.length + '</span></h3>' + (bl.length ? bl.map(function (x) { return '<div class="lrow" data-open="' + x.id + '"><span class="dot" style="background:' + (x.kind === 'note' ? '#7c3aed' : STATE_COLOR[state(x)]) + '"></span><span class="lt">' + esc(x.title) + '</span><span class="dim small">' + (x.kind === 'note' ? 'note' : 'task') + '</span></div>'; }).join('') : '<div class="dim small">No notes link here yet</div>') +
      '<h3 style="margin-top:16px">Outgoing</h3>' + (outl.length ? outl.map(function (t) { var ex = noteByTitle(t); return '<div class="lrow" data-wiki="' + esc(t) + '"><span class="dot" style="background:' + (ex ? '#7c3aed' : '#555') + '"></span><span class="lt">' + esc(t) + '</span>' + (ex ? '' : '<span class="dim small">create</span>') + '</div>'; }).join('') : '<div class="dim small">No [[links]]</div>') +
      (linkedTasks.length ? '<h3 style="margin-top:16px">Linked tasks</h3>' + linkedTasks.map(function (x) { return '<div class="lrow" data-open="' + x.id + '"><span class="dot" style="background:' + STATE_COLOR[state(x)] + '"></span><span class="lt">' + esc(x.title) + '</span></div>'; }).join('') : '') +
      '<h3 style="margin-top:16px">Tags</h3><div class="tagcloud">' + (tg.map(function (t) { return '<a href="#" class="tagl" data-tag="' + esc(t) + '">#' + esc(t) + '</a>'; }).join(' ') || '<span class="dim small">None</span>') + '</div>' +
      '<div class="small dim" style="margin-top:16px">Created ' + new Date(n.createdAt).toLocaleDateString() + ' · edited ' + fmtAgo(n.updatedAt) + ' ago</div></aside></div>';
    el.innerHTML = html;
    bindNotes(el);
  }
  function bindNotes(el) {
    var n = M.items[M.note];
    el.querySelector('#nNew').onclick = function () { var x = newNote('Untitled ' + new Date().toLocaleDateString()); M.note = x.id; M.editMode = 'edit'; drawNotes(el); var t = el.querySelector('#nTitle'); t.focus(); t.select(); };
    el.querySelector('#nToday').onclick = function () {
      var d = L.officeDay(L.serverNow()), x = noteByTitle(d);
      if (!x) x = newNote(d, '# ' + d + '\n\n## Top 3\n- [ ] \n- [ ] \n- [ ] \n\n## Notes\n\n## Wins\n\nLinks: [[Home]]\n\n#daily');
      M.note = x.id; drawNotes(el);
    };
    var q = el.querySelector('#nq'); q.oninput = function () { M.nq = q.value; var pos = q.selectionStart; drawNotes(el); var q2 = el.querySelector('#nq'); q2.focus(); q2.setSelectionRange(pos, pos); };
    if (el.querySelector('#nClearTag')) el.querySelector('#nClearTag').onclick = function (e) { e.preventDefault(); M.tagFilter = null; drawNotes(el); };
    el.onclick = function (e) {
      var t = e.target, a;
      if ((a = t.closest('[data-note]'))) { M.note = a.dataset.note; drawNotes(el); return; }
      if ((a = t.closest('[data-wiki]'))) { e.preventDefault(); openWiki(a.dataset.wiki); return; }
      if ((a = t.closest('[data-tag]'))) { e.preventDefault(); M.tagFilter = a.dataset.tag.toLowerCase(); drawNotes(el); return; }
      if ((a = t.closest('[data-open]'))) { select(a.dataset.open); return; }
    };
    if (!n) return;
    Array.prototype.forEach.call(el.querySelectorAll('[data-nmode]'), function (b) { b.onclick = function () { M.editMode = b.dataset.nmode; drawNotes(el); }; });
    var title = el.querySelector('#nTitle');
    title.onchange = function () {
      var old = n.title, v = title.value.trim(); if (!v || v === old) return;
      if (noteByTitle(v) && noteByTitle(v).id !== n.id) { L.toast('A note with that name already exists', 'err'); title.value = old; return; }
      // Rename keeps links working: update [[Old]] → [[New]] everywhere
      var re = new RegExp('\\[\\[' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\]\\]|\\||#)', 'gi');
      Object.keys(M.items).forEach(function (k) { var x = M.items[k]; if (re.test(x.body || '')) { x.body = x.body.replace(re, '[[' + v + '$1'); touch(x.id); } re.lastIndex = 0; });
      if (n.body.split('\n')[0] === '# ' + old) n.body = '# ' + v + n.body.slice(2 + old.length);
      n.title = v; touch(n.id); drawNotes(el);
    };
    var ed = el.querySelector('#nBody'), pv = el.querySelector('#nPrev'), t;
    ed.oninput = function () { n.body = ed.value; touch(n.id); clearTimeout(t); t = setTimeout(function () { pv.innerHTML = md(n.body); }, 150); autocomplete(ed); };
    ed.onkeydown = function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); clearTimeout(M.saveTimer); flush(); }
      var ac = document.getElementById('wikiAc');
      if (ac && (e.key === 'Enter' || e.key === 'Tab')) { var first = ac.querySelector('[data-ac]'); if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'Escape' && ac) ac.remove();
    };
    ed.onblur = function () { setTimeout(function () { var ac = document.getElementById('wikiAc'); if (ac) ac.remove(); }, 200); };
    pv.addEventListener('change', function (e) {
      var ln = e.target.dataset.line; if (ln == null) return;
      var lines = n.body.split('\n'); lines[+ln] = lines[+ln].replace(/\[( |x|X)\]/, e.target.checked ? '[x]' : '[ ]');
      n.body = lines.join('\n'); ed.value = n.body; touch(n.id); pv.innerHTML = md(n.body);
    });
    el.querySelector('#nDel').onclick = function () {
      var bl = backlinks(n).length;
      if (!confirm('Delete note "' + n.title + '"?' + (bl ? ' ' + bl + ' other item(s) link to it.' : ''))) return;
      remove(n.id); M.note = null; drawNotes(el);
    };
  }
  // [[ autocomplete
  function autocomplete(ed) {
    var old = document.getElementById('wikiAc'); if (old) old.remove();
    var before = ed.value.slice(0, ed.selectionStart), m = /\[\[([^\]\n]*)$/.exec(before); if (!m) return;
    var q = m[1].toLowerCase();
    var opts = notes().map(function (x) { return [x.title, 'note']; }).concat(nodes().map(function (x) { return [x.title, 'task']; }))
      .filter(function (o) { return o[0] && o[0].toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    if (q && !opts.some(function (o) { return o[0].toLowerCase() === q; })) opts.push([m[1], 'new note']);
    if (!opts.length) return;
    var box = document.createElement('div'); box.id = 'wikiAc'; box.className = 'wiki-ac';
    box.innerHTML = opts.map(function (o) { return '<div data-ac="' + esc(o[0]) + '"><span>' + esc(o[0]) + '</span><span class="dim small">' + o[1] + '</span></div>'; }).join('');
    var r = ed.getBoundingClientRect(); box.style.left = (r.left + 16) + 'px'; box.style.top = Math.min(window.innerHeight - 260, r.top + 40) + 'px';
    document.body.appendChild(box);
    box.onmousedown = function (e) { e.preventDefault(); };
    box.onclick = function (e) {
      var a = e.target.closest('[data-ac]'); if (!a) return;
      var pos = ed.selectionStart, start = before.length - m[1].length, after = ed.value.slice(pos).replace(/^\]\]/, '');
      ed.value = ed.value.slice(0, start) + a.dataset.ac + ']]' + after; var np = start + a.dataset.ac.length + 2; ed.setSelectionRange(np, np); ed.focus();
      box.remove(); ed.oninput();
    };
  }

  // ---------- Graph (force-directed, notes + optional tags) ----------
  function drawGraph(el) {
    compute();
    var ns = notes(), idx = {}, gn = [], ge = [];
    ns.forEach(function (n) { idx[n.title.toLowerCase()] = gn.length; gn.push({ id: n.id, label: n.title, kind: 'note', deg: 0 }); });
    ns.forEach(function (n) { wikilinks(n.body).forEach(function (w) { var j = idx[w.toLowerCase()]; if (j != null && gn[j].id !== n.id) { ge.push([idx[n.title.toLowerCase()], j]); } }); });
    // tasks that link to notes become small nodes too
    nodes().forEach(function (x) { var ws = wikilinks(x.body).map(function (w) { return idx[w.toLowerCase()]; }).filter(function (j) { return j != null; }); if (ws.length) { var k = gn.length; gn.push({ id: x.id, label: x.title, kind: 'task', st: state(x), deg: 0 }); ws.forEach(function (j) { ge.push([k, j]); }); } });
    if (M.graphTags) { var tIdx = {}; ns.forEach(function (n) { tagsOf(n).forEach(function (t) { if (tIdx[t] == null) { tIdx[t] = gn.length; gn.push({ id: 'tag:' + t, label: '#' + t, kind: 'tag', deg: 0 }); } ge.push([idx[n.title.toLowerCase()], tIdx[t]]); }); }); }
    ge.forEach(function (e) { gn[e[0]].deg++; gn[e[1]].deg++; });
    var W = 1000, H = 640;
    gn.forEach(function (n, i) { var a = i / gn.length * Math.PI * 2; n.x = W / 2 + Math.cos(a) * 220 + Math.random() * 20; n.y = H / 2 + Math.sin(a) * 220 + Math.random() * 20; n.vx = 0; n.vy = 0; });
    for (var it = 0; it < 320; it++) {
      for (var i = 0; i < gn.length; i++) for (var j = i + 1; j < gn.length; j++) {
        var a = gn[i], b = gn[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, f = 2600 / d2;
        a.vx += dx * f / Math.sqrt(d2); a.vy += dy * f / Math.sqrt(d2); b.vx -= dx * f / Math.sqrt(d2); b.vy -= dy * f / Math.sqrt(d2);
      }
      ge.forEach(function (e) { var a = gn[e[0]], b = gn[e[1]], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 110) * 0.02; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; });
      gn.forEach(function (n) { n.vx += (W / 2 - n.x) * 0.004; n.vy += (H / 2 - n.y) * 0.004; n.x += n.vx * 0.5; n.y += n.vy * 0.5; n.vx *= 0.6; n.vy *= 0.6; });
    }
    var cur = M.note;
    var svg = '<svg id="gSvg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="640">' +
      ge.map(function (e) { var a = gn[e[0]], b = gn[e[1]], hot = a.id === cur || b.id === cur; return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="g-edge' + (hot ? ' hot' : '') + '"/>'; }).join('') +
      gn.map(function (n) {
        var r = n.kind === 'note' ? 6 + Math.min(10, n.deg * 1.6) : n.kind === 'tag' ? 5 : 4;
        var fill = n.kind === 'note' ? (n.id === cur ? '#0077ff' : '#a78bfa') : n.kind === 'tag' ? '#14b8a6' : STATE_COLOR[n.st];
        return '<g class="g-node" data-gid="' + esc(n.id) + '"><circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="' + fill + '"/><text x="' + n.x + '" y="' + (n.y + r + 13) + '" text-anchor="middle" class="g-label' + (n.kind === 'note' ? '' : ' small') + '">' + esc(trunc(n.label, 26)) + '</text></g>';
      }).join('') + '</svg>';
    el.innerHTML = '<div class="toolbar"><span class="small muted">' + ns.length + ' notes · ' + ge.length + ' links. Click a dot to open it.</span><span class="spacer"></span><label class="row small"><input type="checkbox" id="gTags"' + (M.graphTags ? ' checked' : '') + '> Show tags</label></div>' +
      '<div class="card graph-card">' + svg + '<div class="legend" style="padding:0 12px 10px"><span><i style="background:#a78bfa"></i>Note</span><span><i style="background:#0077ff"></i>Current note</span><span><i style="background:#14b8a6"></i>Tag</span><span><i style="background:#f5a524"></i>Task linking a note</span></div></div>';
    el.querySelector('#gTags').onchange = function () { M.graphTags = this.checked; drawGraph(el); };
    el.querySelector('#gSvg').onclick = function (e) { var g = e.target.closest('[data-gid]'); if (!g) return; var id = g.dataset.gid; if (id.indexOf('tag:') === 0) { M.tagFilter = id.slice(4); M.tab = 'notes'; draw(); } else select(id); };
  }

  window.LCMMind = { view: view, flush: flush, isBusy: function () { return Object.keys(M.dirty).length > 0; } };
})();
