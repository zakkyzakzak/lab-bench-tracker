# Lab Bench Tracker

Bench tracker for the Kaur lab (Wits, School of Molecular and Cell Biology).

**This repository holds code only. No sample, experiment or result data is ever stored here.**
Records live in Firebase (Firestore, project `lab-bench-tracker`, Johannesburg), protected by
`firestore.rules`. Result files go to Google Drive, one folder per sample.

## Build 1: empty shell
- Sign-in with a Wits Google account only.
- One-time lab setup by the lab owner, who becomes admin; Prof Kaur is set as supervisor and sees every project.
- Lab and access: add or remove lab members and supervisors, create projects, add project members.
- Every tab from the mockup is present with no data: Today, Overview, Samples, Experiments, Protocols,
  Reagents, Targets, Study plan, Lab duties, Lab and access.
- Fast loading through a local browser cache, cleared on sign-out.

## Files
- `index.html`, `styles.css`, `app.js`: the app (no build step; Firebase SDK loaded from gstatic).
- `config.js`: Firebase web settings (public identifiers, not secrets).
- `firestore.rules`: who can read and write what.
- `firebase.json`, `.firebaserc`: Firebase Hosting and rules deployment.

## Deploy
From a terminal with the Firebase CLI signed in to the Wits account:

    firebase deploy --only hosting,firestore:rules

Live at https://lab-bench-tracker.web.app
