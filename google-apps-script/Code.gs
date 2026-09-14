/**
 * NHẬT KÝ ĐỔ DẦU — Google Apps Script backend (v3)
 * ------------------------------------------------
 * Dán toàn bộ nội dung này vào Apps Script gắn với Google Sheet của bạn.
 *
 * Cột trong sheet "FuelLog":
 * id | date | driver | plate | liters | odo | needsReview | meterPhotoUrl | odoPhotoUrl | platePhotoUrl
 *
 * - driver: tên lái xe (đăng nhập trong app qua Firebase)
 * - plate: biển số xe, đọc tự động từ ảnh (có thể do lái xe sửa tay nếu đọc sai)
 * - needsReview: TRUE nếu lái xe tự tích "dữ liệu đọc sai, cần kiểm tra lại"
 * - *PhotoUrl: link ảnh trên Cloudinary — app đã tự tải ảnh lên Cloudinary
 *   và gửi thẳng link cho Apps Script, nên ở đây KHÔNG cần xử lý Google Drive
 *   hay giải mã base64 nữa (khác với bản v1/v2 trước đó).
 */

const SHEET_NAME = "FuelLog";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "add") return handleAdd(data);
    return jsonResponse({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "list") return handleList({ driver: e.parameter.driver });
    if (action === "byPlate") return handleByPlate({ plate: e.parameter.plate });
    if (action === "drivers") return handleDistinct(2, "drivers");
    if (action === "vehicles") return handleDistinct(3, "plates");
    return jsonResponse({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "id", "date", "driver", "plate", "liters", "odo", "needsReview",
      "meterPhotoUrl", "odoPhotoUrl", "platePhotoUrl",
    ]);
  }
  return sheet;
}

function handleAdd(data) {
  const sheet = getSheet();
  const id = Utilities.getUuid();
  const date = data.date || new Date().toISOString();
  sheet.appendRow([
    id,
    date,
    data.driver || "",
    data.plate || "",
    data.liters,
    data.odo,
    data.needsReview ? true : false,
    data.meterPhotoUrl || "",
    data.odoPhotoUrl || "",
    data.platePhotoUrl || "",
  ]);
  return jsonResponse({ ok: true, id: id });
}

function rowToRecord(row) {
  return {
    id: row[0],
    date: row[1],
    driver: row[2],
    plate: row[3],
    liters: row[4],
    odo: row[5],
    needsReview: row[6] === true || row[6] === "TRUE",
    meterPhotoUrl: row[7],
    odoPhotoUrl: row[8],
    platePhotoUrl: row[9],
  };
}

function handleList(data) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!data.driver || row[2] === data.driver) result.push(rowToRecord(row));
  }
  return jsonResponse({ ok: true, records: result });
}

function handleByPlate(data) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!data.plate || row[3] === data.plate) result.push(rowToRecord(row));
  }
  return jsonResponse({ ok: true, records: result });
}

function handleDistinct(colIndex, key) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const values = [];
  for (let i = 1; i < rows.length; i++) {
    const v = rows[i][colIndex];
    if (v && values.indexOf(v) === -1) values.push(v);
  }
  const out = {};
  out[key] = values;
  return jsonResponse(Object.assign({ ok: true }, out));
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
