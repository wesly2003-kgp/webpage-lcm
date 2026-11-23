// ============================================================
// LCM Work Portal — Google Apps Script backend (ALL-IN-ONE FILE)
// Paste this whole file into Code.gs. Nothing else is needed.
// Then: pick "setup" in the function menu → Run → allow access.
// Then: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
// ============================================================

// Admins who can sign in on day one. More people are added from the portal's Team page.
var DEFAULT_ADMIN_EMAILS = ['eloopchargingsolutions@gmail.com', 'wesleyj84660@gmail.com'];

// "LCM - WORK" — https://drive.google.com/drive/folders/18lrhR09L3AlYDWeyz-_rzVeVPClLZl4i
// Uploads are saved as: LCM - WORK / <Department> / <Task> / <file>
// The Google account that deploys this script must have Editor access to this folder.
var DEFAULT_DRIVE_FOLDER_ID = '18lrhR09L3AlYDWeyz-_rzVeVPClLZl4i';

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(LCM_TABLES).forEach(function (name) {
    var sh = sheet_(ss, name), cols = LCM_TABLES[name];
    // Upgrade older sheets: full header row + plain-text format so Sheets never turns "2026-11-22" into a Date.
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  uploadsFolder_();
  Logger.log('Ready. Sheets created, uploads folder: ' + uploadsFolder_().getUrl());
}

function doGet() {
  return json_({ ok: true, service: 'LCM Work Portal API' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var readOnly = req.action === 'bootstrap' || req.action === 'ping';
    if (!readOnly) lock.waitLock(20000);
    var core = LCMCore(sheetDb_(), services_());
    var data = core.handle(req.action, req.payload, req.token);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err), code: err && err.code || 500 });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sheets as database ----------
function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  var cols = LCM_TABLES[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // keep everything as text
  }
  return sh;
}

// Columns that hold a calendar day (yyyy-MM-dd), not a moment in time.
var DAY_COLS_ = { date: 1, startDate: 1, dueDate: 1 };

function sheetDb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || LCM_TIMEZONE;
  var cache = {}, sheets = {};
  function sh_(name) { return sheets[name] || (sheets[name] = sheet_(ss, name)); }
  function norm(c, v) {
    if (v instanceof Date) return DAY_COLS_[c] ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
    return v === null || v === undefined ? '' : v;
  }
  function read(name, firstRow, count) {
    var cols = LCM_TABLES[name];
    if (count <= 0) return [];
    return sh_(name).getRange(firstRow, 1, count, cols.length).getValues().map(function (r, i) {
      var o = { _row: firstRow + i };
      cols.forEach(function (c, j) { o[c] = norm(c, r[j]); });
      return o;
    });
  }
  function rows(name) {
    if (!cache[name]) cache[name] = read(name, 2, sh_(name).getLastRow() - 1);
    return cache[name];
  }
  function clean(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }
  function toRow(name, o) {
    return LCM_TABLES[name].map(function (c) { var v = o[c]; return v === undefined || v === null ? '' : String(v); });
  }
  return {
    all: function (name) { return rows(name).map(clean); },
    // Only the newest `n` rows — keeps big logs (Activity) fast to load.
    tail: function (name, n) {
      if (cache[name]) return cache[name].slice(-n).map(clean);
      var last = sh_(name).getLastRow();
      var first = Math.max(2, last - n + 1);
      return read(name, first, last - first + 1).map(clean);
    },
    insert: function (name, obj) {
      var sh = sh_(name), row = sh.getLastRow() + 1, cols = LCM_TABLES[name].length;
      // Write as plain text so dates/times are stored exactly as sent.
      var values = toRow(name, obj);
      sh.getRange(row, 1, 1, cols).setNumberFormat('@').setValues([values]);
      if (cache[name]) { var o = { _row: row }; LCM_TABLES[name].forEach(function (c, j) { o[c] = values[j]; }); cache[name].push(o); }
      return obj;
    },
    update: function (name, id, patch) {
      var r = rows(name).filter(function (x) { return x.id === id; })[0];
      if (!r) throw new Error(name + ' row not found');
      var merged = clean(r);
      Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
      var values = toRow(name, merged);
      sh_(name).getRange(r._row, 1, 1, values.length).setNumberFormat('@').setValues([values]);
      LCM_TABLES[name].forEach(function (c, j) { r[c] = values[j]; });
      return merged;
    },
    // Appends many rows in one write (used when importing a whole mind map at once).
    insertMany: function (name, list) {
      if (!list.length) return;
      var sh = sh_(name), row = sh.getLastRow() + 1, cols = LCM_TABLES[name].length;
      var values = list.map(function (o) { return toRow(name, o); });
      sh.getRange(row, 1, values.length, cols).setNumberFormat('@').setValues(values);
      if (cache[name]) values.forEach(function (v, i) { var o = { _row: row + i }; LCM_TABLES[name].forEach(function (c, j) { o[c] = v[j]; }); cache[name].push(o); });
    },
    remove: function (name, id) {
      var r = rows(name).filter(function (x) { return x.id === id; })[0];
      if (r) sh_(name).deleteRow(r._row);
      delete cache[name];
    }
  };
}

// ---------- Services: email, cache, Drive ----------
function services_() {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  return {
    adminEmails: (props.getProperty('ADMIN_EMAILS') ? String(props.getProperty('ADMIN_EMAILS')).split(',') : DEFAULT_ADMIN_EMAILS).map(function (s) { return String(s).trim(); }).filter(String),
    now: function () { return new Date().toISOString(); },
    officeDate: function () { return Utilities.formatDate(new Date(), LCM_TIMEZONE, 'yyyy-MM-dd'); },
    formatTime: function (iso) { return iso ? Utilities.formatDate(new Date(iso), LCM_TIMEZONE, 'hh:mm a') : ''; },
    uuid: function () { return Utilities.getUuid().replace(/-/g, ''); },
    random: function () { return Math.random(); },
    hash: function (s) {
      var salt = props.getProperty('HASH_SALT');
      if (!salt) { salt = Utilities.getUuid(); props.setProperty('HASH_SALT', salt); }
      return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + s)
        .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    },
    cacheGet: function (k) { return cache.get(k); },
    cachePut: function (k, v, sec) { cache.put(k, v, sec); },
    cacheRemove: function (k) { cache.remove(k); },
    sendOtp: function (email, code, name) {
      MailApp.sendEmail({
        to: email,
        subject: 'Your LCM Portal sign-in code: ' + code,
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">' +
          '<h2 style="color:#0077ff;margin:0 0 12px">LCM Work Portal</h2>' +
          '<p>Hi ' + (name || '') + ',</p><p>Your one-time sign-in code is:</p>' +
          '<p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:16px 0">' + code + '</p>' +
          '<p style="color:#666">It expires in 10 minutes. If you did not try to sign in, ignore this email.</p></div>'
      });
    },
    notifyAdmins: function (emails, subject, body) {
      if (!emails.length) return;
      try { MailApp.sendEmail({ to: emails.join(','), subject: '[LCM Portal] ' + subject, body: body + '\n\nReview it at https://lcmev.com/portal/' }); } catch (e) {}
    },
    saveFile: function (name, mime, base64, meta) {
      var sub = folderPath_(meta.path || [meta.department || 'General', meta.task || 'General Uploads']);
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, name);
      var file = sub.createFile(blob);
      file.setDescription('Uploaded by ' + meta.uploader + ' via LCM Portal');
      return { id: file.getId(), url: file.getUrl() };
    },
    // Writes the checkout report as a Google Doc into LCM - WORK / <Dept> / Daily Reports / <YYYY-MM>.
    saveReport: function (r) {
      var doc = DocumentApp.create(r.title);
      var body = doc.getBody();
      body.appendParagraph(r.heading).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      r.fields.forEach(function (f) {
        var p = body.appendParagraph(f[0] + ': ' + f[1]);
        p.editAsText().setBold(0, f[0].length, true);
      });
      r.sections.forEach(function (sec) {
        body.appendParagraph(sec[0]).setHeading(DocumentApp.ParagraphHeading.HEADING2);
        body.appendParagraph(sec[1]);
      });
      doc.saveAndClose();
      var file = DriveApp.getFileById(doc.getId());
      file.moveTo(folderPath_(r.path));
      return { id: file.getId(), url: file.getUrl() };
    },
    folderUrl: function () { return uploadsFolder_().getUrl(); }
  };
}

function uploadsFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || DEFAULT_DRIVE_FOLDER_ID;
  return DriveApp.getFolderById(id);
}

// Walks/creates nested folders under LCM - WORK, e.g. ['Electronics', 'Daily Reports', '2026-11'].
function folderPath_(parts) {
  var f = uploadsFolder_();
  parts.forEach(function (name) { f = subFolder_(f, name); });
  return f;
}

// Finds or creates a child folder by name (used for department and task folders).
function subFolder_(parent, name) {
  name = String(name || 'General').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'General';
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
