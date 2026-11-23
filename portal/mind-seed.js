/*
 * Starter content for "My Mind" — imported once, the first time the section is opened.
 * Written from Wesly's point of view. After import, everything is editable in the portal.
 *
 * Tree format: { t: title, s: status ('done'|'doing'|''), k: key, d: [keys this depends on], b: notes, c: [children] }
 */
window.LCM_MIND_SEED = {
  tree: [
    { t: 'LCM — Master Plan', k: 'root', b: 'Everything I am driving at LCM. Each leaf is a concrete piece of work.\nLinks (🔗) mean "can\'t finish before that is done".\n\nSee [[Home]] for the notes map.', c: [
      { t: 'MPPT Controller (Electronics)', k: 'mppt', b: 'Design log: [[MPPT Design Log]]', c: [
        { t: 'Finalise input voltage / current spec', s: 'done', k: 'mppt-spec' },
        { t: 'Select MOSFETs & gate driver', s: 'done', k: 'mppt-fets', d: ['mppt-spec'] },
        { t: 'Inductor + capacitor sizing calc', s: 'done', k: 'mppt-ind', d: ['mppt-spec'] },
        { t: 'Rev A schematic review', s: 'done', k: 'mppt-sch-a' },
        { t: 'Rev A bench bring-up', s: 'done', k: 'mppt-revA', d: ['mppt-sch-a'] },
        { t: 'Rev B schematic changes (thermal fixes)', s: 'done', k: 'mppt-sch-b', d: ['mppt-revA'] },
        { t: 'Rev B PCB layout & routing', s: 'doing', k: 'mppt-layout', d: ['mppt-sch-b', 'mppt-fets', 'mppt-ind'] },
        { t: 'DRC + design review with Chethan', k: 'mppt-drc', d: ['mppt-layout'] },
        { t: 'Order Rev B PCBs + components', k: 'mppt-order', d: ['mppt-drc'] },
        { t: 'Assemble Rev B boards', k: 'mppt-assy', d: ['mppt-order'] },
        { t: 'MPPT algorithm: perturb & observe', s: 'done', k: 'mppt-algo' },
        { t: 'MPPT algorithm: incremental conductance', s: 'doing', k: 'mppt-algo2', d: ['mppt-algo'] },
        { t: 'Battery charge-rate logging script', s: 'done', k: 'mppt-log' },
        { t: 'Efficiency test at 5 load points', k: 'mppt-eff', d: ['mppt-assy', 'mppt-algo2'] },
        { t: 'Thermal soak test (2 h @ max load)', k: 'mppt-thermal', d: ['mppt-assy'] },
        { t: 'Firmware OTA update path', k: 'mppt-ota', d: ['mppt-algo2'] }
      ] },
      { t: 'Generator & Gearset (Mechanical)', k: 'mech', b: 'Notes: [[Gearset Notes]]', c: [
        { t: 'Airflow intake CFD study', s: 'done', k: 'cfd' },
        { t: 'Propeller blade profile v2', s: 'done', k: 'prop2', d: ['cfd'] },
        { t: 'Propeller casting vendor quotes', s: 'done', k: 'prop-quotes', d: ['prop2'] },
        { t: 'Gear ratio selection', s: 'done', k: 'gear-ratio' },
        { t: 'Gearset prototype machined', s: 'done', k: 'gear-proto', d: ['gear-ratio'] },
        { t: 'Generator selection (rpm/torque curve)', s: 'done', k: 'gen-select', d: ['gear-ratio'] },
        { t: 'Generator housing CAD v3', s: 'doing', k: 'housing3', d: ['gen-select'] },
        { t: 'Housing 3D print for fit check', k: 'housing-print', d: ['housing3'] },
        { t: 'Housing CNC (aluminium)', k: 'housing-cnc', d: ['housing-print'] },
        { t: 'Bearing & seal selection', s: 'done', k: 'bearings' },
        { t: 'Drag measurement plan', k: 'drag-plan', d: ['cfd'] },
        { t: 'Vibration damping mounts', k: 'mounts', d: ['housing3'] },
        { t: 'Full mechanical assembly', k: 'mech-assy', d: ['housing-cnc', 'gear-proto', 'prop-quotes', 'bearings', 'mounts'] },
        { t: 'Mechanical design freeze', k: 'mech-freeze', d: ['mech-assy'] }
      ] },
      { t: 'Testing & Validation', k: 'test', c: [
        { t: 'Load cell calibration (vendor)', s: 'doing', k: 'loadcell' },
        { t: 'Bench torque test rig assembled', s: 'done', k: 'rig' },
        { t: 'Bench safety checklist', s: 'done', k: 'safety' },
        { t: 'Gearset torque test on bench', k: 'torque-test', d: ['loadcell', 'rig', 'safety', 'gear-proto'] },
        { t: 'Generator output curve vs rpm', k: 'gen-curve', d: ['torque-test', 'gen-select'] },
        { t: 'System integration test (gen + MPPT + battery)', k: 'sys-test', d: ['gen-curve', 'mppt-assy'] },
        { t: 'Wind tunnel slot booking', s: 'done', k: 'tunnel-book' },
        { t: 'Wind tunnel test run', k: 'tunnel', d: ['tunnel-book', 'mech-assy'] },
        { t: 'Data analysis + test report', k: 'test-report', d: ['sys-test', 'tunnel'] },
        { t: 'IP67 water ingress test', k: 'ip67', d: ['housing-cnc'] },
        { t: 'EMI pre-compliance scan', k: 'emi', d: ['mppt-assy'] },
        { t: 'Durability: 500 km road equivalent', k: 'durability', d: ['road-test'] }
      ] },
      { t: 'Vehicle Integration', k: 'veh', c: [
        { t: 'Shortlist pilot vehicle (2W/3W)', s: 'done', k: 'veh-pick' },
        { t: 'Mounting bracket design', s: 'doing', k: 'bracket', d: ['veh-pick'] },
        { t: 'Wiring harness design', k: 'harness', d: ['veh-pick', 'mppt-sch-b'] },
        { t: 'Battery BMS interface protocol', k: 'bms', d: ['veh-pick'] },
        { t: 'Install on pilot vehicle', k: 'install', d: ['bracket', 'harness', 'bms', 'mech-freeze', 'mppt-assy'] },
        { t: 'Road test #1 (city loop)', k: 'road-test', d: ['install', 'sys-test'] },
        { t: 'Road test video for investors', k: 'road-video', d: ['road-test'] },
        { t: 'Range-gain calculation (km/day)', k: 'range', d: ['road-test'] },
        { t: 'OEM integration guide v1', k: 'oem-guide', d: ['range'] },
        { t: 'Pilot customer feedback session', k: 'pilot-fb', d: ['road-test'] }
      ] },
      { t: 'Manufacturing & Supply Chain', k: 'mfg', c: [
        { t: 'BOM v1 with costs', s: 'done', k: 'bom1' },
        { t: 'BOM cost-down targets', s: 'doing', k: 'bom-down', d: ['bom1'] },
        { t: 'Alternate supplier for MOSFETs', k: 'alt-fet', d: ['mppt-fets'] },
        { t: 'Assembly SOP draft', s: 'doing', k: 'sop' },
        { t: 'Jigs & fixtures list', k: 'jigs', d: ['sop'] },
        { t: 'QC checklist', k: 'qc', d: ['sop'] },
        { t: 'Pilot batch plan (50 units)', k: 'pilot-batch', d: ['mech-freeze', 'qc', 'jigs'] },
        { t: 'Contract manufacturer shortlist', s: 'done', k: 'cm-list' },
        { t: 'CM factory visit', k: 'cm-visit', d: ['cm-list'] },
        { t: 'Packaging design', k: 'pack' }
      ] },
      { t: 'Fundraising & Finance', k: 'fund', b: 'Pipeline: [[Fundraising Pipeline]] · FAQ: [[Investor FAQ]]', c: [
        { t: 'Financial model v3', s: 'done', k: 'fin3' },
        { t: 'Pitch deck v5', s: 'doing', k: 'deck5', d: ['fin3'] },
        { t: 'Data room: company docs', s: 'done', k: 'dr-docs' },
        { t: 'Data room: test data & reports', k: 'dr-tests', d: ['test-report'] },
        { t: 'Data room complete', k: 'dr', d: ['dr-docs', 'dr-tests', 'patent-file'] },
        { t: 'Investor list (40 targets)', s: 'done', k: 'inv-list' },
        { t: 'Warm intros (10)', s: 'doing', k: 'intros', d: ['inv-list'] },
        { t: 'First meetings (10)', k: 'meetings', d: ['intros', 'deck5'] },
        { t: 'Grant application: startup scheme', s: 'done', k: 'grant' },
        { t: 'Grant milestone report', k: 'grant-report', d: ['grant', 'test-report'] },
        { t: 'Term sheet negotiation', k: 'term', d: ['meetings', 'road-video', 'dr'] },
        { t: 'Seed round close', k: 'seed', d: ['term'] }
      ] },
      { t: 'Legal & IP', k: 'legal', c: [
        { t: 'Prior-art search', s: 'done', k: 'prior-art' },
        { t: 'Provisional patent filed', s: 'done', k: 'prov', d: ['prior-art'] },
        { t: 'Complete specification draft', s: 'doing', k: 'spec-draft', d: ['prov'] },
        { t: 'Complete patent filing', k: 'patent-file', d: ['spec-draft', 'test-report'] },
        { t: 'Trademark "LCM" filing', s: 'done', k: 'tm' },
        { t: 'Employee NDAs & IP assignment', s: 'done', k: 'nda' },
        { t: 'Vendor NDAs', k: 'vendor-nda' },
        { t: 'ESOP policy draft', k: 'esop', d: ['seed'] }
      ] },
      { t: 'Website & Work Portal', k: 'web', c: [
        { t: 'Website live on lcmev.com', s: 'done', k: 'site' },
        { t: 'Employee portal + OTP login', s: 'done', k: 'portal' },
        { t: 'Attendance + daily reports', s: 'done', k: 'attendance', d: ['portal'] },
        { t: 'Add team photos to Team page', k: 'team-photos' },
        { t: 'Timeline page update with road test', k: 'timeline-upd', d: ['road-test'] },
        { t: 'Blog post: how LCM works', k: 'blog' },
        { t: 'LinkedIn update: pilot results', k: 'li-post', d: ['road-video'] },
        { t: 'Careers page: open roles', k: 'careers', d: ['hire-plan'] }
      ] },
      { t: 'Team & Hiring', k: 'team', b: 'See [[Team 1:1s]]', c: [
        { t: 'Hiring plan for next 6 months', s: 'done', k: 'hire-plan' },
        { t: 'Hire: power electronics engineer', s: 'doing', k: 'hire-pe', d: ['hire-plan'] },
        { t: 'Hire: mechanical design intern', k: 'hire-mech', d: ['hire-plan'] },
        { t: 'Onboarding checklist', s: 'done', k: 'onboard' },
        { t: 'Weekly 1:1s set up', s: 'done', k: 'one-on-ones' },
        { t: 'Quarterly goals (OKRs)', s: 'doing', k: 'okrs' },
        { t: 'Team offsite plan', k: 'offsite', d: ['seed'] }
      ] },
      { t: 'Me — Daily System', k: 'me', b: 'Daily note template lives in [[Home]].', c: [
        { t: 'Morning: review Ready list (15 min)', s: 'done', k: 'am-review' },
        { t: 'Deep work block 9:30–12:30', s: 'doing', k: 'deep' },
        { t: 'Check team daily reports', k: 'check-reports', d: ['attendance'] },
        { t: 'Evening: write daily note', k: 'pm-note' },
        { t: 'Weekly review (Sunday)', k: 'weekly', d: ['pm-note'] },
        { t: 'Gym 3× / week', s: 'doing', k: 'gym' }
      ] }
    ] }
  ],
  notes: [
    { t: 'Home', tags: 'moc', b: '# Home\n\nMy map of everything. Start here.\n\n## Areas\n- [[LCM Vision]]\n- [[MPPT Design Log]] · [[Gearset Notes]]\n- [[Fundraising Pipeline]] · [[Investor FAQ]]\n- [[Team 1:1s]]\n- [[Ideas Inbox]]\n\n## Reviews\n- [[Weekly Review 2026-W47]]\n\n## Daily note template\n- [ ] Top 3 for today\n- [ ] Blockers to clear\n- Wins:\n- Learned:\n\n#moc' },
    { t: 'LCM Vision', tags: 'strategy', b: '# LCM Vision\n\nCharge EVs **while they drive** using ambient airflow — zero drag penalty, more range per day.\n\n## Why now\n- 2W/3W EVs in India run fixed routes → predictable airflow\n- Charging infra is the #1 complaint\n\n## 3-year goals\n1. Pilot with 2 fleet operators\n2. OEM integration with one 3W maker\n3. 10,000 units/year\n\nRelated: [[Fundraising Pipeline]], [[Investor FAQ]]\n\n#strategy #lcm' },
    { t: 'MPPT Design Log', tags: 'electronics', b: '# MPPT Design Log\n\n## Rev A learnings\n- MOSFETs ran hot above 8 A → better thermal path in Rev B\n- Gate-drive ringing; add RC snubber\n\n## Rev B checklist\n- [x] Thermal vias under FETs\n- [x] Snubber footprints\n- [ ] Current-sense filter tweak\n- [ ] DRC review with Chethan\n\n## Algorithm\nP&O works but oscillates at low wind; trying incremental conductance.\n\nSee also [[Gearset Notes]] (rpm range drives input voltage).\n\n#electronics #mppt' },
    { t: 'Gearset Notes', tags: 'mechanical', b: '# Gearset Notes\n\n- Ratio chosen for generator sweet spot at 30–60 km/h\n- Bench test blocked on **load cell calibration** (vendor)\n- Idea: use partner lab dynamometer if vendor slips (proposal sent in portal)\n\nFeeds into [[MPPT Design Log]].\n\n#mechanical #testing' },
    { t: 'Fundraising Pipeline', tags: 'fundraising', b: '# Fundraising Pipeline\n\n| Stage | Count |\n|---|---|\n| Target list | 40 |\n| Warm intro | 6 |\n| First meeting | 2 |\n\n## Needs before term sheet\n- [ ] Road test video\n- [ ] Data room complete (incl. test report)\n- [ ] Pitch deck v5\n\nAnswers prepared in [[Investor FAQ]]. Story in [[LCM Vision]].\n\n#fundraising' },
    { t: 'Investor FAQ', tags: 'fundraising', b: '# Investor FAQ\n\n**Does it add drag?** Designed for net-positive energy; drag measurement plan in progress.\n\n**What does it cost?** BOM v1 known; cost-down targets in progress.\n\n**IP?** Provisional patent filed; complete spec being drafted.\n\nBack to [[Fundraising Pipeline]].\n\n#fundraising #faq' },
    { t: 'Team 1:1s', tags: 'team', b: '# Team 1:1s\n\n## Chethan\n- Blocked on load cell → escalate vendor\n\n## Jayshri\n- Deck visuals in review\n\n## Naveen\n- SOP sections 1–3 done\n\nRelated: [[Weekly Review 2026-W47]]\n\n#team' },
    { t: 'Ideas Inbox', tags: 'ideas', b: '# Ideas Inbox\n\n- Fleet dashboard showing km gained per vehicle\n- Modular unit for e-rickshaw roofs\n- Partner with driving schools for test routes\n\nTriage these in the [[Weekly Review 2026-W47]].\n\n#ideas' },
    { t: 'Weekly Review 2026-W47', tags: 'review', b: '# Weekly Review — 2026-W47\n\n## Done\n- Portal live with attendance and daily reports\n- Gearset prototype machined\n\n## Stuck\n- Torque test waiting on load cell\n\n## Next week\n- [ ] Rev B DRC\n- [ ] 3 investor intros\n- [ ] Housing CAD v3 done\n\nLinks: [[Home]], [[Team 1:1s]], [[Ideas Inbox]]\n\n#review' }
  ]
};
