/**
 * NHẬT KÝ ĐỔ DẦU — Google Apps Script backend (v4)
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
 *
 * Sheet "Vehicles" (tự tạo sẵn, bạn tự điền/sửa trực tiếp trong Google Sheet,
 * KHÔNG cần sửa code hay build lại app):
 * plate | model
 * Ví dụ:
 * 29A-123.45 | Ford Transit
 * 30G-456.78 | Hyundai County
 * Dùng để gộp tiêu hao theo TỪNG DÒNG XE và theo LÁI XE × DÒNG XE trong tab Quản trị.
 *
 * Sheet "Drivers" (tự tạo sẵn, bạn tự điền/sửa trực tiếp trong Google Sheet,
 * KHÔNG cần sửa code hay build lại app):
 * username | displayName
 * Ví dụ:
 * nguyenvana | Nguyễn Văn A
 * Dùng để hiển thị TÊN THẬT của lái xe thay vì tên đăng nhập ở khắp app.
 * Nếu một username chưa có trong sheet này, app sẽ tạm hiển thị đúng tên đăng nhập.
 *
 * (Danh sách đơn vị/kho đổ dầu — dùng để tự nhận diện vị trí GPS — được
 * cấu hình trong code (src/config.js), KHÔNG nằm trong Google Sheet.)
 */

const SHEET_NAME = "FuelLog";
const VEHICLES_SHEET_NAME = "Vehicles";
const DRIVERS_SHEET_NAME = "Drivers";

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
    if (action === "all") return handleAll();
    if (action === "vehicleModels") return handleVehicleModels();
    if (action === "driverNames") return handleDriverNames();
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
      "meterPhotoUrl", "odoPhotoUrl", "platePhotoUrl", "locationName", "lat", "lng",
    ]);
  }
  return sheet;
}

function getVehiclesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(VEHICLES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VEHICLES_SHEET_NAME);
    sheet.appendRow(["plate", "model"]);
    sheet.appendRow(["29A-123.45", "Ví dụ: Ford Transit — sửa/xoá dòng này"]);
  }
  return sheet;
}

function handleVehicleModels() {
  const sheet = getVehiclesSheet();
  const rows = sheet.getDataRange().getValues();
  const models = {};
  for (let i = 1; i < rows.length; i++) {
    const plate = rows[i][0];
    const model = rows[i][1];
    if (plate) models[String(plate).trim().toUpperCase()] = model || "";
  }
  return jsonResponse({ ok: true, models: models });
}

function getDriversSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DRIVERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DRIVERS_SHEET_NAME);
    sheet.appendRow(["username", "displayName"]);
    sheet.appendRow(["nguyenvana", "Ví dụ: Nguyễn Văn A — sửa/xoá dòng này"]);
  }
  return sheet;
}

function handleDriverNames() {
  const sheet = getDriversSheet();
  const rows = sheet.getDataRange().getValues();
  const names = {};
  for (let i = 1; i < rows.length; i++) {
    const username = rows[i][0];
    const displayName = rows[i][1];
    if (username) names[String(username).trim().toLowerCase()] = displayName || "";
  }
  return jsonResponse({ ok: true, names: names });
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
    data.locationName || "",
    data.lat != null ? data.lat : "",
    data.lng != null ? data.lng : "",
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
    locationName: row[10] || "",
    lat: row[11],
    lng: row[12],
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

function handleAll() {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    result.push(rowToRecord(rows[i]));
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
