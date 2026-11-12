# Email notices: one-time setup

Do this once, signed in to Google as the lab admin's Wits account (the account that owns the
`lab-bench-tracker` Firebase project). It takes about ten minutes.

## 1. Make the sheet
1. Go to https://sheets.new and name the sheet **Lab Bench Tracker mail**.
2. In the sheet, open **Extensions > Apps Script**. A script editor opens in a new tab.

## 2. Put the script in
1. In the editor, delete everything in `Code.gs` and paste in the whole of [Code.gs](Code.gs).
2. Click the cog (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**.
3. Back in the editor, open `appsscript.json`, delete its contents and paste in the whole of
   [appsscript.json](appsscript.json).
4. Save (Ctrl+S).

## 3. Link the script to the tracker's Google Cloud project
The script reads the tracker's database, which only works from inside the tracker's own project.
1. In **Project Settings**, under **Google Cloud Platform (GCP) Project**, click **Change project**.
2. Enter the project number **714894705915** and click **Set project**.
3. If Google says an OAuth consent screen is needed, follow its link, choose **Internal**, give the
   app the name "Lab Bench Tracker mail", save, then repeat step 2.

## 4. Switch it on
1. Go back to the sheet and reload the page. A **Lab mail** menu appears after a few seconds.
2. Choose **Lab mail > Set up and switch on**.
3. Google asks for permission. Approve it. It asks to: see and edit this one sheet, connect to an
   outside service (the database), send email as you, run on a timer, and read the database.
4. Choose **Lab mail > Set up and switch on** once more if the first click only asked for permission.
   You should see "Email notices are on".

## 5. Test it
1. In the tracker, open **Lab and access** and press **Send me a test email**.
2. Within a minute or two the card changes to "Test emailed", a row appears in the **Mail queue**
   sheet with status `sent`, and the email arrives. To skip the wait, use
   **Lab mail > Check for mail now** in the sheet.

## 6. Sign-in links (for Wits addresses with no Google account)
Staff addresses often cannot use "Sign in with Google". The sign-in screen has **Email me a sign-in
link** for them; the link is made and emailed by this sheet, from your own mailbox.

One-time, to switch it on:
1. In the Firebase console open **Authentication > Sign-in method**, click **Email/Password**, turn on
   **Email/Password** and **Email link (passwordless sign-in)**, and save.
2. On the same page under **Settings > Authorised domains**, check that `zakkyzakzak.github.io` is listed
   (add it if not).
3. If you set the script up before this feature existed: paste in the new `Code.gs` and
   `appsscript.json`, save, reload the sheet, and choose **Lab mail > Set up and switch on** again.
   Google asks for one more permission (manage the tracker's sign-in). Approve it.

How it behaves: a link is only sent to an address already listed in the lab, at most one every
3 minutes per address, and can take up to two minutes to arrive. Each request shows in the
**Mail queue** sheet as `sign-in link` with `sent`, `skipped` or `failed` and the reason. The link
itself is never written to the sheet.

## 7. Google Drive (a folder per study, uploads, a data sheet)
This part is optional. It lets the script keep a Drive folder for every study, shared with the
study's members and the supervisors, and a spreadsheet in it with a copy of everything typed into
the tracker. Everything it creates belongs to **your** Google account.

### Switch it on
1. In the script editor, add a second file: click **+** next to Files, choose **Script**, name it
   `Drive`, and paste in the whole of [Drive.gs](Drive.gs).
2. Replace `Code.gs` and `appsscript.json` with the new versions and save.
3. Reload the sheet and choose **Lab mail > Switch on Google Drive**. Google asks for two more
   permissions: your Google Drive, and your spreadsheets. Approve them, then choose the menu item
   once more if the first click only asked for permission.
4. Within a few minutes a folder called **Lab Bench Tracker** appears in your Drive with one
   folder per study, and the tracker shows **Open the Google Drive folder for ...** at the top of
   each study's pages.

### Uploads from inside the tracker
1. In the script editor click **Deploy > New deployment**, choose the type **Web app**, set
   **Execute as: Me** and **Who has access: Anyone**, and click **Deploy**.
2. Copy the web app address (it ends in `/exec`).
3. In the tracker open **Lab and access**, paste it under **Google Drive**, press **Save**, then
   **Test**.

"Anyone" means anyone can reach the address, not that anyone can upload: every upload carries the
person's tracker sign-in, which the script checks with Google, and it is refused unless that person
is in the lab and in that study. If Wits does not offer "Anyone", uploads cannot work this way;
the folders and the data sheet still do, and people can add files to the folder in Drive and
paste the link into the tracker.

After changing the script later, use **Deploy > Manage deployments > Edit > New version** so the
address stays the same.

### Things to know
- Members are added to a study's folder as **Editor**, the highest level Drive allows without
  being the owner. Someone whose Wits address has no Google account cannot be added.
- The data sheet is rewritten about every ten minutes. Do not edit it; add your own tabs or copy it.
- **Lab and access > Hand a study's folder to a new owner** makes someone else the owner of the
  folder and its files. Google only allows that inside one organisation, so it may be refused for
  an address in a different Wits domain; the reason is shown in the tracker.

## How it works
- Every minute the script copies notices that have not been emailed into the **Mail queue** sheet
  as `pending`, emails each pending row, and marks it `sent`. The Status column is its memory.
- A send that fails is tried again, up to 5 times, then marked `failed` with the reason.
- Only `@wits.ac.za` and `@students.wits.ac.za` addresses are ever emailed.
- The sheet keeps the text of every notice, so keep the sheet private to the lab admin.
- **Lab mail > Switch off** stops all email. Notices still show in each person's Inbox in the tracker.

## If setup fails
- "The database answered 403 ... API has not been used in project": step 3 was missed or did not save.
- "The database answered 403 ... permission": you are signed in to Google as a different account
  from the one that owns the Firebase project.
