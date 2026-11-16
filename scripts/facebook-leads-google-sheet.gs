/**
 * One Mic Stand Facebook Lead Ads -> CRM bridge.
 *
 * Paste this file into Extensions > Apps Script in the lead spreadsheet.
 * Run configureLeadSync() once, then run installLeadSyncTrigger().
 */

const STATUS_HEADERS = [
  'crm_status',
  'crm_contact_id',
  'email_status',
  'email_sent_at',
  'sms_status',
  'sms_sent_at',
  'last_error',
  'processed_at',
]

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lead CRM')
    .addItem('Configure connection', 'configureLeadSync')
    .addItem('Process new leads now', 'processNewFacebookLeads')
    .addItem('Process historical CSV (email + SMS)', 'processHistoricalFacebookLeads')
    .addItem('Install 1-minute trigger', 'installLeadSyncTrigger')
    .addToUi()
}

function configureLeadSync() {
  const ui = SpreadsheetApp.getUi()
  const urlPrompt = ui.prompt(
    'App URL',
    'Enter the deployed app URL, for example https://app.laalbutton.com',
    ui.ButtonSet.OK_CANCEL,
  )
  if (urlPrompt.getSelectedButton() !== ui.Button.OK) return

  const secretPrompt = ui.prompt(
    'Webhook secret',
    'Enter the same FACEBOOK_LEADS_WEBHOOK_SECRET configured in Vercel.',
    ui.ButtonSet.OK_CANCEL,
  )
  if (secretPrompt.getSelectedButton() !== ui.Button.OK) return

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  PropertiesService.getScriptProperties().setProperties({
    APP_URL: urlPrompt.getResponseText().trim().replace(/\/$/, ''),
    WEBHOOK_SECRET: secretPrompt.getResponseText().trim(),
    SPREADSHEET_ID: spreadsheet.getId(),
  })
  ensureStatusColumns_(spreadsheet.getSheets()[0])
  ui.alert('Connection saved. Install the one-minute trigger next.')
}

function installLeadSyncTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'processNewFacebookLeads')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger))

  ScriptApp.newTrigger('processNewFacebookLeads').timeBased().everyMinutes(1).create()
  SpreadsheetApp.getUi().alert('Lead sync will run every minute.')
}

function processNewFacebookLeads() {
  processFacebookLeads_(false)
}

function processHistoricalFacebookLeads() {
  const ui = SpreadsheetApp.getUi()
  const response = ui.alert(
    'Send historical welcome messages?',
    'This sends one real email and SMS to every eligible row with blank statuses. Use only a dedicated historical-leads sheet whose rows explicitly consented.',
    ui.ButtonSet.YES_NO,
  )
  if (response !== ui.Button.YES) return
  processFacebookLeads_(true)
}

function processFacebookLeads_(sendSmsViaApp) {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) return

  try {
    const props = PropertiesService.getScriptProperties()
    const appUrl = props.getProperty('APP_URL')
    const secret = props.getProperty('WEBHOOK_SECRET')
    const spreadsheetId = props.getProperty('SPREADSHEET_ID')
    if (!appUrl || !secret || !spreadsheetId) {
      throw new Error('Run Lead CRM > Configure connection first.')
    }

    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheets()[0]
    const headerMap = ensureStatusColumns_(sheet)
    const lastRow = sheet.getLastRow()
    if (lastRow < 2) return

    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues()
    values.forEach((row, index) => {
      if (!needsProcessing_(row, headerMap)) return

      const firstName = value_(row, headerMap, ['first_name', 'firstname'])
      const lastName = value_(row, headerMap, ['last_name', 'lastname'])
      const payload = {
        leadId: value_(row, headerMap, ['lead_id', 'id', 'facebook_lead_id']),
        createdTime: serializable_(value_(row, headerMap, ['created_time', 'created_at', 'date'])),
        name:
          value_(row, headerMap, ['full_name', 'name']) ||
          [firstName, lastName].filter(Boolean).join(' '),
        email: value_(row, headerMap, ['email', 'email_address']),
        phone: value_(row, headerMap, ['phone', 'phone_number', 'mobile', 'mobile_number']),
        city: value_(row, headerMap, ['city']),
        campaignName: value_(row, headerMap, ['campaign_name', 'campaign']),
        adName: value_(row, headerMap, ['ad_name', 'ad']),
        consent: value_(row, headerMap, [
          'consent',
          'contact_consent',
          'marketing_consent',
          'email_sms_consent',
        ]),
        sendSmsViaApp: Boolean(sendSmsViaApp),
      }

      if (!payload.name) {
        writeResult_(sheet, index + 2, headerMap, { error: 'Missing lead name' })
        return
      }

      try {
        const response = UrlFetchApp.fetch(`${appUrl}/api/integrations/facebook-leads`, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-lead-webhook-secret': secret },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        })
        const body = JSON.parse(response.getContentText() || '{}')
        if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
          throw new Error(body.error || `App returned HTTP ${response.getResponseCode()}`)
        }
        writeResult_(sheet, index + 2, headerMap, body)
      } catch (error) {
        writeResult_(sheet, index + 2, headerMap, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  } finally {
    lock.releaseLock()
  }
}

function ensureStatusColumns_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1)
  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((header) => normalizeHeader_(header))
  const map = {}
  headers.forEach((header, index) => {
    if (header) map[header] = index
  })

  STATUS_HEADERS.forEach((header) => {
    if (map[header] === undefined) {
      const column = sheet.getLastColumn() + 1
      sheet.getRange(1, column).setValue(header)
      map[header] = column - 1
    }
  })
  sheet.setFrozenRows(1)
  return map
}

function needsProcessing_(row, map) {
  const statuses = ['crm_status', 'email_status', 'sms_status']
  return statuses.some((name) => !String(row[map[name]] || '').trim())
}

function value_(row, map, aliases) {
  for (let i = 0; i < aliases.length; i += 1) {
    const index = map[normalizeHeader_(aliases[i])]
    if (index !== undefined && row[index] !== '' && row[index] !== null) return row[index]
  }
  return ''
}

function serializable_(value) {
  return value instanceof Date ? value.toISOString() : value
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function writeResult_(sheet, rowNumber, map, result) {
  const updates = {
    crm_status: result.crmStatus,
    crm_contact_id: result.crmContactId,
    email_status: result.emailStatus,
    email_sent_at: result.emailSentAt,
    sms_status: result.smsStatus,
    sms_sent_at: result.smsSentAt,
    last_error: result.error || '',
    processed_at: result.processedAt || new Date().toISOString(),
  }
  Object.keys(updates).forEach((header) => {
    if (updates[header] !== undefined && updates[header] !== null) {
      sheet.getRange(rowNumber, map[header] + 1).setValue(updates[header])
    }
  })
}
