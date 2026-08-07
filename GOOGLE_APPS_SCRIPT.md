# Google Apps Script Schedule Endpoint

Endpoint nay dung cho Auto Live tu Google Sheet. Apps Script co the tu tao sheet
`VIC Auto Live Schedule` trong Google Drive lan dau endpoint chay.

## Code mau

```javascript
const SHEET_NAME = 'Schedule';
const HEADERS = [
  'title',
  'date',
  'time',
  'videoPath',
  'description',
  'duration',
  'quality',
  'bitrate',
  'fps',
  'pageUrl',
  'liveUrl'
];

function doGet(e) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = ensureScheduleSheet_(ss);
  return json_({
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: sheet.getName(),
    rows: readRows_(sheet)
  });
}

function getOrCreateSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    return SpreadsheetApp.openById(savedId);
  }

  const ss = SpreadsheetApp.create('VIC Auto Live Schedule');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  ensureScheduleSheet_(ss);
  return ss;
}

function ensureScheduleSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const current = headerRange.getValues()[0].map(value => String(value || '').trim());
  const missingHeader = HEADERS.some((header, index) => current[index] !== header);
  if (missingHeader) {
    headerRange.setValues([HEADERS]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values.shift().map(value => String(value || '').trim());
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const item = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const value = row[index];
        item[header] = value instanceof Date
          ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
          : value;
      });
      return item;
    });
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Cot trong Sheet

```text
title        Bat buoc. Tieu de live.
date         Ngay dang: dd/mm/yyyy.
time         Gio dang: 20:30.
videoPath    Duong dan video tren may chay app.
description  Mo ta.
duration     So phut tu dong tat.
quality      720p hoac 1080p.
bitrate      Kbps.
fps          30 hoac 60.
pageUrl      Tuy chon, override page da chon trong app.
liveUrl      Tuy chon, override link Live Producer.
```

## Deploy

1. Mo `https://script.new`.
2. Dan code tren vao `Ma.gs`, save.
3. Deploy -> New deployment -> Web app.
4. Execute as: Me.
5. Who has access: Anyone.
6. Neu hien canh bao unverified app: Advanced -> Go to project -> Allow.
7. Copy Web App URL vao Settings -> Auto Live tu Google Sheet.
8. Mo Web App URL mot lan de script tu tao Google Sheet; JSON tra ve co `spreadsheetUrl`.

Neu khong muon Apps Script, co the dung truc tiep link Google Sheet public; app se tu doc CSV.
