import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

// ------------------------------------------------------------------
// Cấu hình dự án Firebase "hp-do-dau" của bạn.
// Đây là thông tin công khai (không phải mật khẩu bí mật), an toàn khi
// đưa vào code phía trình duyệt — đây là cách Firebase web app luôn hoạt động.
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDRJxN43w6n_xpuREQRY6mjJbYEEgryEcs",
  authDomain: "hp-do-dau.firebaseapp.com",
  projectId: "hp-do-dau",
  storageBucket: "hp-do-dau.firebasestorage.app",
  messagingSenderId: "107102154124",
  appId: "1:107102154124:web:ead9fa7d5e588fbc617aa9",
};

// Hậu tố giả dùng để biến "tên đăng nhập" thành một email hợp lệ cho Firebase.
// Không cần là domain thật — chỉ là quy ước nội bộ. Khi tạo tài khoản lái xe
// trong Firebase Console, luôn dùng dạng: <tên đăng nhập>@laixe.local
export const EMAIL_DOMAIN = "laixe.local";

export const firebaseConfigured = firebaseConfig.apiKey !== "REPLACE_ME" && !!firebaseConfig.apiKey;

let app = null;
let authInstance = null;

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  setPersistence(authInstance, browserLocalPersistence).catch(() => {});
}

export const auth = authInstance;

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase().replace(/\s+/g, "")}@${EMAIL_DOMAIN}`;
}

export function emailToUsername(email) {
  return email ? email.split("@")[0] : "";
}

export async function signInDriver(username, pin) {
  if (!auth) throw new Error("firebase-not-configured");
  const email = usernameToEmail(username);
  const cred = await signInWithEmailAndPassword(auth, email, pin);
  return cred.user;
}

export function signOutDriver() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

export function watchDriver(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user ? emailToUsername(user.email) : null);
  });
}

export function mapAuthError(err) {
  const code = err && err.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Sai tên đăng nhập hoặc mã PIN.";
  }
  if (code === "auth/user-disabled") {
    return "Tài khoản này đã bị khoá. Liên hệ quản lý đội xe.";
  }
  if (code === "auth/too-many-requests") {
    return "Sai quá nhiều lần, thử lại sau ít phút.";
  }
  if (code === "auth/invalid-email") {
    return "Tên đăng nhập không hợp lệ.";
  }
  return "Đăng nhập thất bại, kiểm tra lại thông tin.";
}
