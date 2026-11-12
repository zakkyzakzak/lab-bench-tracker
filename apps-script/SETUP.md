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
