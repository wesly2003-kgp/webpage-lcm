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
  Object.keys(LCM_TABLES).forEach(function (name) { sheet_(ss, name); });
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

function sheetDb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = {};
  function rows(name) {
    if (cache[name]) return cache[name];
    var sh = sheet_(ss, name);
    var cols = LCM_TABLES[name];
    var last = sh.getLastRow();
    var values = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
    cache[name] = values.map(function (r, i) {
      var o = { _row: i + 2 };
      cols.forEach(function (c, j) {
        var v = r[j];
        o[c] = v instanceof Date ? v.toISOString() : (v === null ? '' : v);
      });
      return o;
    });
    return cache[name];
  }
  function clean(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }
  function toRow(name, o) {
    return LCM_TABLES[name].map(function (c) { var v = o[c]; return v === undefined || v === null ? '' : String(v); });
  }
  return {
    all: function (name) { return rows(name).map(clean); },
    insert: function (name, obj) {
      var sh = sheet_(ss, name);
      sh.appendRow(toRow(name, obj));
      delete cache[name];
      return obj;
    },
    update: function (name, id, patch) {
      var r = rows(name).filter(function (x) { return x.id === id; })[0];
      if (!r) throw new Error(name + ' row not found');
      var merged = clean(r);
      Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
      sheet_(ss, name).getRange(r._row, 1, 1, LCM_TABLES[name].length).setValues([toRow(name, merged)]);
      delete cache[name];
      return merged;
    },
    remove: function (name, id) {
      var r = rows(name).filter(function (x) { return x.id === id; })[0];
      if (r) sheet_(ss, name).deleteRow(r._row);
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
      var deptFolder = subFolder_(uploadsFolder_(), meta.department || 'General');
      var sub = subFolder_(deptFolder, meta.task || 'General Uploads');
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, name);
      var file = sub.createFile(blob);
      file.setDescription('Uploaded by ' + meta.uploader + ' via LCM Portal');
      return { id: file.getId(), url: file.getUrl() };
    },
    folderUrl: function () { return uploadsFolder_().getUrl(); }
  };
}

function uploadsFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || DEFAULT_DRIVE_FOLDER_ID;
  return DriveApp.getFolderById(id);
}

// Finds or creates a child folder by name (used for department and task folders).
function subFolder_(parent, name) {
  name = String(name || 'General').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'General';
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
