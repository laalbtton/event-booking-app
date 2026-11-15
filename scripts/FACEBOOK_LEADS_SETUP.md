# Facebook Lead Ads → CRM

## Data flow

There are two supported intake paths:

1. **Direct (primary):** Meta `leadgen` webhook → app CRM.
2. **Sheet (fallback):** Google Sheet/Meta CSV → Apps Script → app CRM.

Both paths use the Facebook Lead ID and the same app delivery ledger. If the same lead arrives through both, it is imported and welcomed only once.

## 1. Apply the database migration

Run `sql/facebook_lead_deliveries_migration.sql`, then `sql/sms_opt_out_migration.sql`, in the Supabase SQL editor.

## 2. Configure Vercel

Set these Production environment variables, then redeploy:

```text
FACEBOOK_LEADS_WEBHOOK_SECRET=<random secret used only by Apps Script>
FACEBOOK_LEADS_CRM_OWNER_ID=<auth.users UUID of the admin who owns CRM contacts>

META_WEBHOOK_VERIFY_TOKEN=<a second random token entered in Meta>
META_APP_SECRET=<Meta developer app secret>
META_PAGE_ACCESS_TOKEN=<long-lived Page access token with lead access>
META_GRAPH_API_VERSION=v27.0
# Comma-separated normalized names of your consent question:
META_LEAD_CONSENT_FIELDS=consent,contact_consent,email_sms_consent

TWILIO_ACCOUNT_SID=<Twilio account SID>
TWILIO_AUTH_TOKEN=<Twilio auth token>
TWILIO_FROM_NUMBER=<E.164 Twilio number, for example +14165550100>
SMS_CONSENT_WEBHOOK_SECRET=<a third random secret used by Pabbly inbound SMS>
```

If using a Twilio Messaging Service, set `TWILIO_MESSAGING_SERVICE_SID` instead of `TWILIO_FROM_NUMBER`.

The existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, Supabase, and site URL variables are also used. The inbound Pabbly workflow posts Twilio replies to `/api/integrations/twilio/consent`; STOP-like keywords suppress the normalized phone number and START/UNSTOP restores consent.

## 3. Configure Meta's direct webhook

After deploying:

1. In Meta Developer Dashboard, open **Webhooks → Page**.
2. Set Callback URL to:
  `https://app.laalbutton.com/api/integrations/meta/webhook`
3. Enter the exact value of `META_WEBHOOK_VERIFY_TOKEN` as the Verify token.
4. Click **Verify and save**.
5. Subscribe to the Page webhook field named `leadgen` using the same Graph API version configured in Vercel.
6. Connect/subscribe the Facebook Page to this app and grant the app CRM access in Meta Business Settings/Leads Access Manager.
7. Use Meta's Lead Ads Testing Tool to create one test lead.

Production requires the app to be Live and the relevant Meta permissions, normally `leads_retrieval` and `pages_manage_metadata`. The Page access token must belong to a user/system user that has lead access for that Page.

## 4. Configure the Google Sheet fallback

Create a Google Sheet using `facebook-leads-sheet-template.csv`, or use an existing lead sheet. The script recognizes common columns such as `Lead ID`, `Created Time`, `Full Name`, `Email`, and `Phone Number`.

In the Facebook lead form, add an explicit checkbox permitting both email and SMS marketing. Map it to a column named `consent`. Only values such as `TRUE`, `yes`, `1`, `consented`, or `opted_in` permit messages.

In the Sheet:

1. Open **Extensions → Apps Script**.
2. Replace the editor contents with `facebook-leads-google-sheet.gs`.
3. Save and reload the Sheet.
4. Select **Lead CRM → Configure connection**.
5. Enter the production app URL and webhook secret.
6. Select **Lead CRM → Install 1-minute trigger** and approve Google's prompts.

The app does **not** need access to the Google account. Apps Script reads and updates the sheet as the sheet owner.

### Import leads already downloaded from Leads Manager

Import or paste the Meta CSV into the first tab, preserve the header row, and add a `consent` column if the export's consent-question heading has a different name. Only mark consent true when that person explicitly accepted email/SMS contact on the form. Then select **Lead CRM → Process new leads now**.

Do not remove Meta's Lead ID column. It is what prevents a CSV/Sheet lead from being sent again if the direct webhook also received it.

## 5. Test

Add one test row with your own email and phone and set `consent` to `TRUE`. Use **Lead CRM → Process new leads now**. Confirm:

- the CRM contains the contact with the `Facebook Lead` tag;
- email and SMS arrive;
- the three status columns are populated;
- running the command again does not send either message again.

Next, submit the same Facebook test lead through Meta. The delivery ledger should prevent a second welcome.

To retry a failed channel after fixing its configuration, clear only that channel's status cell and run the processor again.