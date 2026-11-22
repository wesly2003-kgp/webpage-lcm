#!/bin/sh
# Rebuilds AppsScript-AllInOne.gs (Code.gs + core.js) — the single file pasted into Apps Script.
cd "$(dirname "$0")"
{ cat Code.gs; echo; echo; echo '// ===================== CORE (same as portal/core.js) ====================='; cat ../core.js; } > AppsScript-AllInOne.gs
