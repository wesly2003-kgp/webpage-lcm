# LCM Work Portal — go-live setup

The portal lives at **https://lcmev.com/portal/** (the **Login** button in the site navbar).
Until the steps below are done it runs in **Preview mode**: data stays in your own browser and sign-in codes are shown on screen. That lets you click around safely.

It goes live with a free Google Apps Script backend:

| Piece | Where it lives |
|---|---|
| Database (users, tasks, remarks, approvals, logs) | A Google Sheet you own |
| Email OTP sign-in codes | Sent from your Gmail via Apps Script |
| File uploads | Your Google Drive folder (one sub-folder per task) |

## 1. Create the backend (≈5 minutes)

1. Go to <https://sheets.new> and name the sheet **LCM Portal DB**.
2. **Extensions → Apps Script**.
3. Rename `Code.gs` → paste the contents of [`portal/backend/Code.gs`](backend/Code.gs).
4. Click **+ → Script**, name it `Core`, and paste the contents of [`portal/core.js`](core.js).
5. ⚙️ **Project Settings → Script properties → Add**:
   - `ADMIN_EMAILS` = the admin email(s), comma-separated, e.g. `wesleyj@…,anil@…`
   - `DRIVE_FOLDER_ID` = the ID of the Drive folder uploads should go to
     (the part after `/folders/` in the folder's link). Leave it out and the backend creates a folder called **LCM Portal Uploads**.
6. Select the `setup` function → **Run** → allow the permissions (Sheets, Gmail send, Drive).
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
2. **Team → Add member** for each employee (email, name, department, role).
   Only listed, active members can sign in.

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
- Uploads files straight to Drive (max 25 MB each).
- **Method changes**: proposes another way to execute a task. The admins get an email and it waits for approval.
- Submits a daily log (hours, work done, blockers).

## Updating the backend later

After changing `Code.gs` or `core.js` in Apps Script: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

## Security notes
- Sign-in codes are 6 digits, valid for 10 minutes, with 5 attempts max. They are stored hashed and can be used once.
- Sessions last 7 days and are stored hashed in the `Sessions` sheet. **Sign out** ends a session immediately.
- Every permission check runs on the server, so employees cannot edit others' tasks, approve proposals or manage users.
- Unknown emails get the same "if registered, a code was sent" reply, so the login form can't be used to discover who works at LCM.
