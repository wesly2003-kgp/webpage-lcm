# LCM Work Portal — go-live setup

The portal lives at **https://lcmev.com/portal/** (the **Login** button in the site navbar).
Until the steps below are done it runs in **Preview mode**: data stays in your own browser and sign-in codes are shown on screen. That lets you click around safely.

It goes live with a free Google Apps Script backend:

| Piece | Where it lives |
|---|---|
| Database (users, tasks, remarks, approvals, logs) | A Google Sheet you own |
| Email OTP sign-in codes | Sent from your Gmail via Apps Script |
| File uploads | Google Drive folder **LCM - WORK** → one sub-folder per department → one per task |

## 1. Create the backend (≈5 minutes)

1. Go to <https://sheets.new> and name the sheet **LCM Portal DB**.
2. **Extensions → Apps Script**.
3. Delete everything in `Code.gs` and paste the **whole** of [`portal/backend/AppsScript-AllInOne.gs`](backend/AppsScript-AllInOne.gs)
   (raw: https://raw.githubusercontent.com/wesly2003-kgp/webpage-lcm/main/portal/backend/AppsScript-AllInOne.gs).
   It already contains the admin emails (`DEFAULT_ADMIN_EMAILS`) and the LCM - WORK folder ID. Do not add a separate Core file.
4. *(optional)* Project Settings → Script properties: `ADMIN_EMAILS` or `DRIVE_FOLDER_ID` override the built-in values.
5. ⚠️ Do all of this while signed in as **eloopchargingsolutions@gmail.com** (owner of LCM - WORK); OTP emails are sent from this account.
6. In the toolbar's function menu pick **setup** (not myFunction) → **Run** → allow the permissions (Sheets, Gmail send, Drive).
7. **Deploy → New deployment → ⚙️ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (ends with `/exec`).

## 2. Connect the website

Edit `portal/config.js` in this repo:

```js
window.LCM_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
  REFRESH_SECONDS: 60
};
```

Commit and push. GitHub Pages updates lcmev.com within a minute or two.

## 3. First sign-in

1. Open lcmev.com/portal/ → **Admin** → enter an email listed in `ADMIN_EMAILS` → enter the emailed code.
2. **Team → Add member** for each employee (email, name, **department**, role).
   Only listed, active members can sign in. Type each department name exactly the same every time
   (the form suggests existing ones), because it becomes the Drive folder name.

## Where uploads go

```
LCM - WORK/
├── Electronics/
│   ├── MPPT controller PCB rev B/
│   │   └── layout-v2.pdf
│   └── General Uploads/
├── Mechanical/
│   └── Gearset torque test on bench/
└── Management/
```

- Department folders and task folders are created automatically on the first upload.
- The department comes from the **task's assignee**, so all of a task's files stay in one place even when an admin uploads them.
  Files not attached to a task go under `<uploader's department>/General Uploads`.
- Members with no department set go under `General/`.

## How it works

**Admin**
- Overview dashboard: KPIs, status donut, 14-day throughput, team workload, deadlines, overdue alerts and an activity feed.
- New task / **Add daily work**: assign to one person or to every employee at once, with priority, dates, category and method.
- Tasks: **Board** (drag between statuses), **List** (sortable) and **Timeline** (Gantt) views, with filters and CSV export.
- **Approvals**: approve or reject employees' alternative methods. Approving makes it the task's official method.
- **Team**: add, disable or promote members, with per-person completion, overdue and blocked counts.
- **Files**: everything uploaded, plus a link to the Drive folder.

**Employee**
- Sees only their own tasks.
- Changes status (Not Started → In Progress → Blocked → In Review → Completed) and sets progress %.
- Posts remarks and development updates; each one is logged on the task timeline.
- Uploads files straight to Drive, into their department's folder (max 25 MB each).
- **Method changes**: proposes another way to execute a task. The admins get an email and it waits for approval.
- Submits a daily log (hours, work done, blockers).

## Updating the backend later

After changing `Code.gs` or `core.js`, run `portal/backend/build.sh`, paste the new all-in-one file into Apps Script, then: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

## Security notes
- Sign-in codes are 6 digits, valid for 10 minutes, with 5 attempts max. They are stored hashed and can be used once.
- Sessions last 7 days and are stored hashed in the `Sessions` sheet. **Sign out** ends a session immediately.
- Every permission check runs on the server, so employees cannot edit others' tasks, approve proposals or manage users.
- Unknown emails get the same "if registered, a code was sent" reply, so the login form can't be used to discover who works at LCM.
