# Nhật ký đổ dầu — Hướng dẫn cài đặt

**Mô hình hoạt động (v4):**
- Mỗi lái xe có **tài khoản thật** (tên đăng nhập + mã PIN) do bạn tạo trong Firebase — khoá/xoá được khi nhân viên nghỉ việc.
- Mỗi lần đổ dầu, lái xe chụp 3 ảnh (cây dầu, đồng hồ odo, biển số xe) → app **tự động đọc cả 3 giá trị**: biển số, số lít, số odo.
- Ảnh được **tải thẳng lên Cloudinary** (không qua máy chủ trung gian), lấy link ảnh rồi ghi vào Google Sheet.
- Có ô tích **"Phần mềm đọc sai"** — mặc định không cần đụng vào nếu số liệu đúng; nếu sai, lái xe tích vào để kế toán biết cần mở ảnh gốc kiểm tra và tự sửa lại.
- Mức tiêu hao nhiên liệu được tính theo **từng xe** (tab "Theo xe"), gộp dữ liệu của mọi lái xe từng dùng xe đó.

App này gồm 4 phần, làm theo đúng thứ tự:

1. **Firebase** — quản lý tài khoản đăng nhập của lái xe.
2. **Google Sheet** — nơi lưu toàn bộ dữ liệu đổ dầu (tự động là "bản xuất", không cần export thủ công).
3. **Cloudinary** — nơi lưu 3 ảnh của mỗi lần đổ dầu.
4. **Netlify** — nơi "host" app để tài xế mở bằng điện thoại, giống một trang web bình thường.

Tổng thời gian: khoảng 30–35 phút, không cần biết lập trình.

---

## BƯỚC 0 — Tạo tài khoản lái xe trên Firebase (khoảng 10 phút)

1. Vào [console.firebase.google.com](https://console.firebase.google.com), đăng nhập bằng tài khoản Google, bấm **Add project (Thêm dự án)**, đặt tên tuỳ ý (ví dụ "doi-xe-cong-ty"), bỏ qua Google Analytics nếu được hỏi, bấm **Create project**.
2. Trong dự án vừa tạo, ở menu bên trái chọn **Build → Authentication** → bấm **Get started**.
3. Ở tab **Sign-in method**, bấm **Email/Password**, bật công tắc **Enable**, bấm **Save**.
4. Vẫn trong Authentication, chọn tab **Users** → bấm **Add user** để tạo tài khoản cho từng lái xe:
   - Email: theo đúng định dạng **`<tên đăng nhập>@laixe.local`** — ví dụ lái xe tên "nguyenvana" thì nhập `nguyenvana@laixe.local`. Đây không phải email thật, chỉ là quy ước để Firebase nhận diện tài khoản.
   - Password: đặt mã PIN cho lái xe đó (Firebase yêu cầu tối thiểu 6 ký tự, ví dụ PIN `123456`).
   - Lặp lại cho từng lái xe.
5. Lấy cấu hình dự án để dán vào app:
   - Bấm biểu tượng ⚙️ cạnh "Project Overview" → **Project settings**.
   - Kéo xuống mục **Your apps**, bấm biểu tượng **</>** (Web) để đăng ký một web app, đặt tên tuỳ ý, bấm **Register app**.
   - Firebase sẽ hiện một đoạn code có object `firebaseConfig = { apiKey: ..., authDomain: ..., ... }` → **copy toàn bộ object này**.
6. Mở file **`src/firebase.js`** trong project mình gửi, thay object `firebaseConfig` mẫu bằng object bạn vừa copy, giữ nguyên các dòng còn lại. Lưu file lại.

**Khi nhân viên nghỉ việc:** quay lại Firebase Console → Authentication → Users → tìm đúng dòng người đó → bấm biểu tượng ⋮ → chọn **Disable account** (khoá, giữ lại lịch sử) hoặc **Delete account** (xoá hẳn). Có hiệu lực ngay cho lần đăng nhập tiếp theo.

> Lưu ý nhỏ: nếu người đó đang có phiên đăng nhập mở sẵn trên điện thoại, phiên đó có thể còn hoạt động thêm tối đa khoảng 1 giờ trước khi Firebase tự làm mới và phát hiện tài khoản đã bị khoá — đây là giới hạn khi không dùng thêm máy chủ riêng để thu hồi phiên ngay lập tức.

---

## BƯỚC 1 — Tạo Google Sheet + Apps Script (khoảng 7 phút)

1. Vào [sheets.google.com](https://sheets.google.com), tạo một Google Sheet mới, đặt tên ví dụ "Dữ liệu đổ dầu".
2. Trên thanh menu, chọn **Tiện ích mở rộng (Extensions) → Apps Script**. Một tab mới sẽ mở ra, đây là nơi viết code chạy đứng sau Sheet.
3. Xoá hết nội dung mặc định trong file `Code.gs`, sau đó **mở file `google-apps-script/Code.gs`** trong project mình gửi, copy toàn bộ, dán vào đây.
4. Bấm biểu tượng 💾 (Save project). Đặt tên project tuỳ ý, ví dụ "Fuel Backend".
5. Bấm nút **Deploy (Triển khai) → New deployment (Bản triển khai mới)**.
   - Bấm biểu tượng ⚙️ cạnh "Select type", chọn **Web app**.
   - Ở mục "Execute as": chọn **Me (tài khoản của bạn)**.
   - Ở mục "Who has access": chọn **Anyone (Bất kỳ ai)** — bắt buộc, nếu không tài xế sẽ không gửi dữ liệu lên được.
   - Bấm **Deploy**.
6. Lần đầu deploy, Google sẽ hỏi cấp quyền — bấm **Authorize access**, chọn tài khoản Google của bạn, nếu hiện cảnh báo "Google chưa xác minh app" thì bấm **Advanced (Nâng cao) → Đi tới [tên project] (không an toàn)** rồi **Allow**. Đây là bình thường vì đây là script riêng của bạn, không phải app công khai.
7. Sau khi deploy xong, Google sẽ hiện một **link dạng**: `https://script.google.com/macros/s/AKfycb.../exec`
   → **Copy link này lại**, sẽ dùng ở Bước 3.

> Lưu ý: mỗi khi bạn **sửa lại code** trong Apps Script sau này, phải bấm **Deploy → Manage deployments → biểu tượng bút chì → Version: New version → Deploy** thì thay đổi mới có hiệu lực (link vẫn giữ nguyên).

---

## BƯỚC 2 — Tạo tài khoản Cloudinary để lưu ảnh (khoảng 5 phút)

1. Vào [cloudinary.com](https://cloudinary.com), bấm **Sign up free**, đăng ký bằng email hoặc Google (gói miễn phí đủ dùng cho nhu cầu này).
2. Sau khi đăng nhập, vào **Dashboard** (trang chủ sau đăng nhập) — bạn sẽ thấy ngay dòng **Cloud name** (một chuỗi kiểu `dabc123xy`). **Copy lại**, dùng ở Bước 4.
3. Tạo "Upload preset" — đây là một cấu hình cho phép app tải ảnh lên **mà không cần mật khẩu bí mật** (an toàn để dùng trực tiếp từ điện thoại lái xe):
   - Vào **Settings (⚙️ góc trên phải) → Upload** (tab bên trái).
   - Kéo xuống mục **Upload presets** → bấm **Add upload preset**.
   - **Signing Mode**: chọn **Unsigned** (rất quan trọng — nếu để "Signed" app sẽ không tải ảnh lên được).
   - **Preset name**: đặt tên dễ nhớ, ví dụ `nhat_ky_do_dau` — **copy lại tên này**, dùng ở Bước 4.
   - (Tuỳ chọn) Ở mục **Folder**, có thể để trống — app đã tự đặt ảnh vào thư mục `nhat-ky-do-dau` khi tải lên.
   - Bấm **Save**.

> Vì preset là "Unsigned", về lý thuyết ai biết Cloud name + tên preset đều tải được ảnh lên tài khoản Cloudinary của bạn (không đọc/xoá được ảnh cũ, chỉ tải thêm ảnh mới). Với quy mô một đội xe nội bộ, mức rủi ro này chấp nhận được; nếu cần chặt hơn, Cloudinary cho phép giới hạn theo dung lượng, định dạng file trong chính màn hình cấu hình preset.

---

## BƯỚC 3 — Đưa app lên Netlify (khoảng 10 phút)

⚠️ **Lưu ý quan trọng:** vì file `src/firebase.js` cần chứa cấu hình Firebase **riêng của bạn** (Bước 0), bản `dist/` build sẵn (nếu có) sẽ **chưa** có cấu hình đó. Vì vậy nên dùng **Cách B** dưới đây — Netlify tự build trên "đám mây" bằng đúng code bạn đã sửa, không cần cài Node.js trên máy.

### Cách B — Qua GitHub (khuyên dùng, không cần cài Node.js)

1. Đảm bảo bạn đã sửa xong `src/firebase.js` (Bước 0) và `google-apps-script/Code.gs` đã deploy (Bước 1).
2. Tạo một repository mới trên [github.com](https://github.com), upload toàn bộ project (trừ thư mục `dist` và `node_modules` nếu có) — bao gồm cả file `src/firebase.js` đã sửa.
3. Vào [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → chọn GitHub → chọn repo vừa tạo.
4. Netlify tự nhận diện `netlify.toml` đã có sẵn trong project (build command: `npm run build`, thư mục publish: `dist`) — cứ để mặc định, bấm **Deploy**.
5. Sau vài phút, Netlify build xong (dùng đúng file `firebase.js` bạn đã sửa) và cho bạn link `https://ten-ngau-nhien.netlify.app`.
6. Ưu điểm: từ giờ mỗi khi bạn (hoặc mình) sửa code và đẩy lên GitHub, Netlify tự build lại, không cần làm gì thêm.

### Cách A — Tự build rồi kéo-thả (cần cài Node.js trên máy)

1. Cài [Node.js](https://nodejs.org) (bản LTS) nếu máy bạn chưa có.
2. Mở Terminal / Command Prompt tại thư mục project, chạy lần lượt:
   ```
   npm install
   npm run build
   ```
3. Một thư mục `dist/` mới sẽ được tạo ra (đã chứa đúng cấu hình Firebase bạn vừa sửa).
4. Vào [app.netlify.com/drop](https://app.netlify.com/drop), đăng nhập, **kéo-thả thư mục `dist` vừa build** vào đó.
5. Netlify cho bạn link `https://ten-ngau-nhien.netlify.app` — gửi cho lái xe mở bằng điện thoại.

---

## BƯỚC 4 — Kết nối app với Google Sheet + Cloudinary (2 phút)

1. Mở link app Netlify vừa tạo trên điện thoại hoặc máy tính.
2. Màn hình đầu tiên sẽ báo "Chưa cấu hình xong: ..." → bấm **Mở Cài đặt**.
3. Điền đủ 3 ô:
   - **Google Sheet**: dán link `.../exec` đã copy ở Bước 1.
   - **Cloudinary — Cloud name**: dán Cloud name đã copy ở Bước 2.
   - **Cloudinary — Upload preset**: dán tên preset đã tạo ở Bước 2.
4. Bấm **Lưu**.
5. Xong — giờ app đã sẵn sàng: đăng nhập bằng tài khoản Firebase (Bước 0), lưu dữ liệu vào Google Sheet, lưu ảnh vào Cloudinary.

Lưu ý: bước này chỉ cần làm **một lần trên mỗi thiết bị** (lưu trong bộ nhớ trình duyệt của máy đó). Mỗi lái xe mở app trên điện thoại của họ lần đầu cũng cần điền đúng 3 thông tin này (bạn gửi sẵn cho tất cả lái xe).

---

## Xem dữ liệu / xử lý báo sai (dành cho kế toán)

Mở lại Google Sheet — sheet tên **FuelLog** sẽ tự có đủ các cột:

`id | date | driver | plate | liters | odo | needsReview | meterPhotoUrl | odoPhotoUrl | platePhotoUrl`

- **driver**: tên lái xe đã đăng nhập khi nhập liệu (để quy trách nhiệm).
- **plate**: biển số xe, app tự đọc từ ảnh chụp biển số.
- **needsReview**: cột quan trọng nhất cho kế toán — bằng `TRUE` nghĩa là chính lái xe cũng thấy phần mềm đọc sai một trong 3 số (biển số / lít / odo) và đã chủ động tích báo. Bạn nên:
  1. Lọc cột này = `TRUE` (Data → Create a filter).
  2. Mở link ảnh tương ứng (`meterPhotoUrl`, `odoPhotoUrl`, `platePhotoUrl` — link Cloudinary, mở là xem ảnh ngay) để đối chiếu ảnh gốc.
  3. Sửa lại số liệu đúng trực tiếp trong các ô `plate` / `liters` / `odo`.

Vì đây là Google Sheet gốc, bạn tải xuống Excel/CSV, lọc, làm Pivot Table như bình thường.

> Lưu ý: dù lái xe **không** tích báo sai, xác suất đọc nhầm vẫn khác 0 (nhất là chữ số dễ nhầm như 8/3, 0/O). Nếu cần độ chính xác tuyệt đối cho một số liệu cụ thể, vẫn nên đối chiếu ảnh gốc định kỳ.

---

## (Tuỳ chọn) Bật tính năng tự động đọc số từ ảnh

Mặc định app **vẫn hoạt động bình thường** mà không cần bước này — tài xế chỉ cần nhập tay 3 trường (biển số / lít / odo) nếu app không tự đọc được. Nếu muốn app tự đọc:

1. Lấy API key tại [console.anthropic.com](https://console.anthropic.com) (mục API Keys).
2. Vào trang site trên Netlify → **Site configuration → Environment variables → Add a variable**.
   - Key: `ANTHROPIC_API_KEY`
   - Value: dán API key vừa lấy.
3. Vào **Deploys → Trigger deploy → Deploy site** để áp dụng biến môi trường mới.

Tính năng này sẽ phát sinh phí nhỏ theo lượng ảnh đọc (tính theo API key của bạn), không liên quan đến Netlify, Google Sheet hay Cloudinary.

---

## Tóm tắt các file trong project

```
nhat-ky-do-dau/
├── src/App.jsx                  ← toàn bộ giao diện + logic app
├── src/firebase.js              ← cấu hình tài khoản đăng nhập (Bước 0)
├── netlify/functions/ocr.js     ← tính năng đọc số tự động (tuỳ chọn)
├── google-apps-script/Code.gs   ← dán vào Apps Script (Bước 1)
├── netlify.toml                 ← cấu hình build cho Netlify
└── package.json
```
