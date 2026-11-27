# Lab Bench Tracker

Bench tracker for the Kaur lab (Wits, School of Molecular and Cell Biology).

**This repository holds code only. No sample, experiment, protocol or result data is ever stored here.**
Records live in Firebase (Firestore, project `lab-bench-tracker`, Johannesburg), protected by
`firestore.rules`. Result files are not stored by the tracker: each run keeps the name and link of
its files, for example in Google Drive.

## What it does
- Sign-in with a Wits account only: with Google, or by a sign-in link emailed from the lab's mail
  sheet for Wits addresses that have no Google account. One-time lab setup by the lab owner, who becomes admin;
  Prof Kaur is set as supervisor and sees every project.
- **Lab and access**: lab members and supervisors, projects and who is in them.
- **Protocols**: one lab-wide library. Protocols are built from blocks (wash, incubation, other),
  with check boxes, variants (V1.1, V1.1.1, V1.2.0) and revisions. Runs keep the revision they used.
  A protocol can be marked as needing a processed sample from an earlier protocol (reliant, e.g.
  IHC after FFPE); the one it starts from shows as initial, and the rest as entire. Starting a reliant
  experiment on a sample with no record of the earlier step gives a warning, with the choice to
  do it first, record it as already done (with or without a date), or start anyway.
- **Study plan**: samples, experiments taken from the lab protocols (with genes or proteins per
  study), and a grid of which sample gets which experiment.
- **Experiments / Today**: bench sessions for a batch of samples, step by step, with timers,
  check boxes and deviations noted per sample or per batch.
- **Overview / Samples**: every sample against every experiment, and the full record of each run.
- **Lineage** (studies that grow cultures, such as organoids and cell lines): a founder sample (B055), its
  passages (B055-P1, B055-P2 ...), the stocks frozen along the way and the vials thawed again, as a tree or a
  table. Each passage becomes its own sample when it is recorded, so the sample list builds up as the work goes on.
  A run belongs to the passage it was done on and also counts towards the founder as a whole. A culture grown from
  a thawed vial starts a branch, named with a letter (B055-P4b). Switched on per study, when it is created or
  under Study plan. New study also offers a test study with made-up samples (names start with T); it is kept out
  of Other projects and Google Drive, and its members can delete it under Lab and access.
- **Reagents**: stock counted down from finished steps, with a low-stock warning.
- **Lab map**: each room as a 3D scan (a GLB file from a phone's LiDAR scanning app), the places inside it
  (fridges, shelves, drawers) marked on the scan, the items kept in each place, photos, and a record of when
  each place was last checked. Every place has a link (`#p=<place>`) to write to an NFC tag stuck at that spot.
- **Targets**: planned day by day over the next two weeks, by exact sample; each week is sent to the
  supervisor as its own target and tracked against its days, with a time estimate that learns from
  finished sessions. A missed week must be explained before carrying on.
- **Export**: the study's record as files, in place of a paper lab book. Images and files are exported with a
  three-step builder: what to include (by kind of file and by group), how to lay it out (one per slide, a grid
  of many per slide, or tumour photo beside its cut-out, with groups at the side, on top or a slide each), then a
  preview before anything is fetched. Out as PowerPoint, Word or the original files in a zip. Set-ups can be
  saved for the study, and a custom export can be asked for in words (it reaches the lab owner as a notice).
  The lab book (methods as performed) and the tables come out as Word or Excel, or everything in one zip.
  A file that shows several samples is exported once. Files are fetched from Drive one at a time, slowly, and a
  stopped export can carry on.
- **Kinds of file on an animal's profile**: adding a file starts by saying what it is. A tumour image can have
  its background removed; a graph is tagged with groups, stored once in a Graphs folder and shown on every
  animal in those groups; a gel image is tagged with the samples on it and linked to its experiment for each.
  Tags can be changed afterwards.
- **Uploads**: files sent to Google Drive join a waiting list and go up one at a time in the background,
  so you can move straight on to the next animal or sample; a box in the corner shows progress and failures.
- **Lab duties**: duties dealt out fairly each month by a supervisor or admin, with requests.

- **Inbox and email**: every notice shows in the person's Inbox and, once the mail sheet is set
  up, is emailed to their Wits address, including the invitation when someone is added to the lab.

The app starts empty: there is no example data.

## Who can see what
- Supervisors read and write every project. Members only the projects that list them.
  Admins manage lab membership but do not see other people's projects. The lab owner is the exception: the owner sees and can open every project, like a supervisor.
- Protocols, reagents, the lab map, duties and requests are shared by everyone in the lab.
- Each person's backlog is private to them. Notices go only to the person they are for.

## Files
- `index.html`, `styles.css`, `app.js`: the page, its styles and the start-up code (no build step).
- `js/`: the app itself, one file per area (`core`, `sync`, `protocols`, `reagents`, `targets`, `monitoring`,
  `study`, `animals`, `lineage`, `photos`, `uploads`, `plan`, `duties`, `export`, `office`, `lab`, `modal`, `render`, `actions`, `welcome`, and for the lab map
  `places`, `map`, `scan`, `blobs`). Each file starts with a line saying what it holds.
- `backend.js`: the only file that talks to Firebase (SDK loaded from gstatic).
- `config.js`: Firebase web settings (public identifiers, not secrets).
- `firestore.rules`: who can read and write what.
- `firebase.json`, `.firebaserc`: Firebase Hosting and rules deployment.
- `publish.cmd`: push to GitHub and deploy to Firebase in one step.
- `docs/protocol-import-handover.md`: instructions for turning written methods into a file that
  **Protocols > Import from a file** can read. The files themselves hold methods, so never commit them.
- `apps-script/`: the Google Sheet script that emails each notice (see `apps-script/SETUP.md`).

## Where data is stored (Firestore)
- `config/lab`: lab name, admins, members, supervisors.
- `users/{uid}`: name and email; `users/{uid}/private/backlog`: that person's backlog.
- `projects/{id}`: name, description, members, samples, experiment order. In a study with lineages (`lin`),
  a sample also carries its founder (`line`), passage number (`p`), parent (`from`), date made (`at`), whether it
  is in culture (`on`) and its freeze, thaw and end events (`ev`). Under it: `exps`,
  `asg` (which sample gets which experiment), `sessions`, `targets`, `files` (result links).
- Lab-wide: `protocols`, `reagents`, `duties`, `rota` (one per month), `dutyLog`, `dutyRequests`,
  `places` and `items` (the lab map), `blobs/{id}/parts/{n}` (room scans and photos, stored in pieces of
  under 1 MB), `notices`, `progress` (a per-project summary the whole lab can read), `visits` (admin-only), `presence` (who has the site open, shown as circles at the top).

## Hosting and deploy
- Main site: Firebase Hosting, https://lab-bench-tracker.web.app
- Copy: GitHub Pages from `main`, https://zakkyzakzak.github.io/lab-bench-tracker/
- To publish, commit your changes and run `.\publish.cmd` in this folder. It pushes to GitHub,
  asks GitHub Pages to rebuild, and deploys the site and the security rules to Firebase.
