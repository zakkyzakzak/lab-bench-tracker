# Lab Bench Tracker

Bench tracker for the Kaur lab (Wits, School of Molecular and Cell Biology).

**This repository holds code only. No sample, experiment, protocol or result data is ever stored here.**
Records live in Firebase (Firestore, project `lab-bench-tracker`, Johannesburg), protected by
`firestore.rules`. Result files are not stored by the tracker: each run keeps the name and link of
its files, for example in Google Drive.

## What it does
- Sign-in with a Wits Google account only. One-time lab setup by the lab owner, who becomes admin;
  Prof Kaur is set as supervisor and sees every project.
- **Lab and access**: lab members and supervisors, projects and who is in them.
- **Protocols**: one lab-wide library. Protocols are built from blocks (wash, incubation, other),
  with check boxes, variants (V1.1, V1.1.1, V1.2.0) and revisions. Runs keep the revision they used.
- **Study plan**: samples, experiments taken from the lab protocols (with genes or proteins per
  study), and a grid of which sample gets which experiment.
- **Experiments / Today**: bench sessions for a batch of samples, step by step, with timers,
  check boxes and deviations noted per sample or per batch.
- **Overview / Samples**: every sample against every experiment, and the full record of each run.
- **Reagents**: stock counted down from finished steps, with a low-stock warning.
- **Targets**: weekly targets by exact sample, agreed by the supervisor, with a time estimate that
  learns from finished sessions. A missed week must be explained before carrying on.
- **Lab duties**: duties dealt out fairly each month by a supervisor or admin, with requests.

- **Inbox and email**: every notice shows in the person's Inbox and, once the mail sheet is set
  up, is emailed to their Wits address, including the invitation when someone is added to the lab.

The app starts empty: there is no example data.

## Who can see what
- Supervisors read and write every project. Members only the projects that list them.
  Admins manage lab membership but do not see other people's projects.
- Protocols, reagents, duties and requests are shared by everyone in the lab.
- Each person's backlog is private to them. Notices go only to the person they are for.

## Files
- `index.html`, `styles.css`, `app.js`: the app (no build step).
- `backend.js`: the only file that talks to Firebase (SDK loaded from gstatic).
- `config.js`: Firebase web settings (public identifiers, not secrets).
- `firestore.rules`: who can read and write what.
- `firebase.json`, `.firebaserc`: Firebase Hosting and rules deployment.
- `publish.cmd`: push to GitHub and deploy to Firebase in one step.
- `apps-script/`: the Google Sheet script that emails each notice (see `apps-script/SETUP.md`).

## Where data is stored (Firestore)
- `config/lab`: lab name, admins, members, supervisors.
- `users/{uid}`: name and email; `users/{uid}/private/backlog`: that person's backlog.
- `projects/{id}`: name, description, members, samples, experiment order. Under it: `exps`,
  `asg` (which sample gets which experiment), `sessions`, `targets`, `files` (result links).
- Lab-wide: `protocols`, `reagents`, `duties`, `rota` (one per month), `dutyLog`, `dutyRequests`,
  `notices`.

## Hosting and deploy
- Main site: Firebase Hosting, https://lab-bench-tracker.web.app
- Copy: GitHub Pages from `main`, https://zakkyzakzak.github.io/lab-bench-tracker/
- To publish, commit your changes and run `.\publish.cmd` in this folder. It pushes to GitHub,
  asks GitHub Pages to rebuild, and deploys the site and the security rules to Firebase.
