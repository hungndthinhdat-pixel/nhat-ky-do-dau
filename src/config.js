// ------------------------------------------------------------------
// CẤU HÌNH CHUNG CỦA APP — sửa 1 lần ở đây trước khi build & deploy.
// Sau khi sửa xong, mọi lái xe mở app đều dùng chung cấu hình này,
// KHÔNG cần tự nhập link Google Sheet / Cloudinary trên từng máy nữa.
// ------------------------------------------------------------------

// Link Web App của Google Apps Script (Bước 1 trong README) — dạng:
// https://script.google.com/macros/s/AKfycb.../exec
export const GOOGLE_SHEET_URL = "REPLACE_ME";

// Cloud name của tài khoản Cloudinary (Bước 2 trong README)
export const CLOUDINARY_CLOUD_NAME = "REPLACE_ME";

// Tên Upload preset đã tạo ở Cloudinary, chế độ Unsigned (Bước 2 trong README)
export const CLOUDINARY_UPLOAD_PRESET = "REPLACE_ME";

// Danh sách tên đăng nhập (phần trước dấu @) được coi là ADMIN — có thêm
// tab "Quản trị" để xem lịch sử + mức tiêu hao của TOÀN BỘ đội xe, không
// chỉ xe/lái xe mình đăng nhập. Có thể thêm nhiều người, viết thường,
// không dấu, không khoảng trắng — đúng như phần trước @ trong tài khoản
// Firebase của người đó.
export const ADMIN_USERNAMES = ["admin"];

// Danh sách các đơn vị/kho đổ dầu — dùng để tự nhận diện lái xe đang đổ ở
// đơn vị nào dựa trên vị trí GPS lúc bấm "Lưu". Mỗi đơn vị gồm:
// - name: tên hiển thị
// - lat, lng: toạ độ trung tâm (lấy từ Google Maps: bấm giữ vào điểm đó,
//   toạ độ hiện ra ở thanh tìm kiếm, dạng "21.0285, 105.8542")
// - radiusMeters: bán kính chấp nhận quanh toạ độ đó, tính bằng mét
// Nếu vị trí GPS lúc đổ dầu không nằm trong bán kính của đơn vị nào ở đây,
// app vẫn lưu toạ độ thô + ghi "Không xác định", không chặn việc lưu.
export const FUEL_LOCATIONS = [
  { name: "Cây dầu Công ty", lat: 21.70043462959246, lng: 104.83933161125815, radiusMeters: 300 },
  { name: "Cây dầu Sứ", lat: 21.710067192758082, lng: 104.90707742418105, radiusMeters: 300 },
  { name: "Cây dầu km23 chiều xuôi", lat: 21.345840391612526, lng: 105.62234444448964, radiusMeters: 100 },
  { name: "Cây dầu km23 chiều ngược", lat: 21.344448006525973, lng: 105.6249272809912, radiusMeters: 100 },
];
