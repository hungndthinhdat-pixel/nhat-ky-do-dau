import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Fuel,
  Gauge,
  Car,
  History,
  Camera,
  Check,
  Plus,
  LogOut,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  Settings,
  X,
  User,
  Truck,
  ShieldCheck,
  MapPin,
} from "lucide-react";

import {
  auth,
  firebaseConfigured,
  signInDriver,
  signOutDriver,
  watchDriver,
  mapAuthError,
} from "./firebase.js";

import {
  GOOGLE_SHEET_URL,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  ADMIN_USERNAMES,
  FUEL_LOCATIONS,
} from "./config.js";

// ---------- Google Sheet backend ----------

async function sheetGet(action, params = {}) {
  const res = await fetch(`${GOOGLE_SHEET_URL}?${new URLSearchParams({ action, ...params }).toString()}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "sheet-error");
  return data;
}

async function sheetPost(payload) {
  // Content-Type text/plain avoids a CORS preflight that Apps Script can't answer.
  const res = await fetch(GOOGLE_SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "sheet-error");
  return data;
}

// ---------- Cloudinary (photo storage) ----------

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const match = header.match(/data:(.*);base64/);
  const mime = match ? match[1] : "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadToCloudinary(dataUrl) {
  const form = new FormData();
  form.append("file", dataUrlToBlob(dataUrl));
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  form.append("folder", "nhat-ky-do-dau");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!data.secure_url) throw new Error((data.error && data.error.message) || "upload-failed");
  return data.secure_url;
}

// ---------- location (GPS) ----------

function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchLocation(point, locations) {
  if (!point) return null;
  let best = null;
  let bestDist = Infinity;
  for (const loc of locations) {
    const d = haversineMeters(point.lat, point.lng, loc.lat, loc.lng);
    if (d <= loc.radiusMeters && d < bestDist) {
      best = loc.name;
      bestDist = d;
    }
  }
  return best;
}

// ---------- image helpers ----------

function compressImage(file, maxW = 900, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- optional AI auto-read (via Netlify function, gracefully skipped if not set up) ----------

async function readValueFromImage(dataUrl, kind) {
  try {
    const res = await fetch("/.netlify/functions/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, kind }),
    });
    if (!res.ok) return { value: null, confidence: "low" };
    const data = await res.json();
    return { value: data.value != null ? data.value : null, confidence: data.confidence || "low" };
  } catch {
    return { value: null, confidence: "low" };
  }
}

// ---------- UI atoms ----------

function Field({ label, unit, children, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, color: "#6B7280", letterSpacing: 0.2 }}>{label}</span>
        {unit && <span style={{ fontSize: 12, color: "#9CA3AF" }}>{unit}</span>}
      </div>
      {children}
      {hint}
    </div>
  );
}

function OcrHint({ status }) {
  if (status === "reading")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280", marginTop: 6 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: "1.5px solid #9CA3AF",
            borderTopColor: "#F5A623",
            display: "inline-block",
            animation: "spin 0.7s linear infinite",
          }}
        />
        Đang tự động đọc…
      </div>
    );
  if (status === "done")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#178A4C", marginTop: 6 }}>
        <Check size={13} /> Đã tự động điền — kiểm tra lại trước khi lưu.
      </div>
    );
  if (status === "low")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#F5A623", marginTop: 6 }}>
        <AlertCircle size={13} /> Đọc chưa chắc chắn — kiểm tra kỹ.
      </div>
    );
  if (status === "error")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280", marginTop: 6 }}>
        <AlertCircle size={13} /> Không đọc được, vui lòng nhập tay.
      </div>
    );
  return null;
}

function PhotoSlot({ label, dataUrl, onCapture, busy }) {
  const inputRef = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          if (f) onCapture(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current && inputRef.current.click()}
        disabled={busy}
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 10,
          border: dataUrl ? "1.5px solid #178A4C" : "1.5px dashed #3A424D",
          background: dataUrl ? `url(${dataUrl}) center/cover no-repeat` : "#FFFFFF",
          position: "relative",
          cursor: "pointer",
          overflow: "hidden",
          padding: 0,
        }}
        aria-label={label}
      >
        {!dataUrl && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#9CA3AF" }}>
            <Camera size={22} strokeWidth={1.6} />
          </div>
        )}
        {dataUrl && (
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#178A4C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={13} color="#0E1116" strokeWidth={3} />
          </div>
        )}
      </button>
      <div style={{ fontSize: 11.5, color: "#6B7280", textAlign: "center", marginTop: 6, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function LocationBadge({ record }) {
  if (!record.locationName) return null;
  const hasCoords = record.lat && record.lng;
  const content = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#178A4C" }}>
      <MapPin size={11} /> {record.locationName}
    </span>
  );
  if (!hasCoords) return content;
  return (
    <a
      href={`https://maps.google.com/?q=${record.lat},${record.lng}`}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: "none" }}
    >
      {content}
    </a>
  );
}

function GlobalStyle() {
  return <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>;
}

const BRAND_GREEN = "#178A4C";
const BRAND_GREEN_DARK = "#0E6B3A";

function CompanyHeader({ subtitle, onSettings, onLogout }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_GREEN_DARK})`,
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 4px 14px rgba(23,138,76,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
          <img src="/logo.png" alt="Logo" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
            CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ HẢI PHƯỢNG
          </div>
          {subtitle && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {(onSettings || onLogout) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {onSettings && (
            <button onClick={onSettings} style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", opacity: 0.9 }}>
              <Settings size={17} />
            </button>
          )}
          {onLogout && (
            <button onClick={onLogout} style={{ background: "none", border: "none", color: "#FFFFFF", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12.5, opacity: 0.9 }}>
              <LogOut size={14} /> Đăng xuất
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- main app ----------

export default function FuelLogApp() {
  const configured = GOOGLE_SHEET_URL !== "REPLACE_ME" && !!GOOGLE_SHEET_URL;
  const cloudinaryReady =
    CLOUDINARY_CLOUD_NAME !== "REPLACE_ME" &&
    CLOUDINARY_UPLOAD_PRESET !== "REPLACE_ME" &&
    !!CLOUDINARY_CLOUD_NAME &&
    !!CLOUDINARY_UPLOAD_PRESET;

  const [authLoading, setAuthLoading] = useState(true);
  const [driver, setDriver] = useState(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [tab, setTab] = useState("nhap"); // 'nhap' | 'cuatoi' | 'theoxe'
  const [records, setRecords] = useState(null);
  const [recordsError, setRecordsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [vehicleList, setVehicleList] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleRecords, setVehicleRecords] = useState(null);

  const [photos, setPhotos] = useState({ meter: null, odo: null, plateShot: null });
  const [plateField, setPlateField] = useState("");
  const [liters, setLiters] = useState("");
  const [odo, setOdo] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [ocrStatus, setOcrStatus] = useState({ plate: "idle", liters: "idle", odo: "idle" });

  const isAdmin = !!(driver && ADMIN_USERNAMES.map((a) => a.toLowerCase()).includes(driver.toLowerCase()));
  const [adminRecords, setAdminRecords] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [vehicleModels, setVehicleModels] = useState(null);
  const [driverNames, setDriverNames] = useState({});

  const displayName = useCallback(
    (username) => (username && driverNames[username.toLowerCase()]) || username,
    [driverNames]
  );

  useEffect(() => {
    const unsubscribe = watchDriver((name) => {
      setDriver(name);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!driver || !configured) return;
    setRecords(null);
    setRecordsError("");
    sheetGet("list", { driver })
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecordsError("Không tải được lịch sử, kiểm tra kết nối mạng."));
  }, [driver, configured]);

  useEffect(() => {
    if (!driver || !configured) return;
    sheetGet("driverNames")
      .then((d) => setDriverNames(d.names || {}))
      .catch(() => {});
  }, [driver, configured]);

  useEffect(() => {
    if (!configured || tab !== "theoxe") return;
    sheetGet("vehicles")
      .then((d) => setVehicleList(d.plates || []))
      .catch(() => setVehicleList([]));
  }, [configured, tab]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setVehicleRecords(null);
    sheetGet("byPlate", { plate: selectedVehicle })
      .then((d) => setVehicleRecords(d.records || []))
      .catch(() => setVehicleRecords([]));
  }, [selectedVehicle]);

  useEffect(() => {
    if (!configured || !isAdmin || tab !== "quantri") return;
    setAdminRecords(null);
    setAdminError("");
    Promise.all([sheetGet("all"), sheetGet("vehicleModels")])
      .then(([recRes, modelRes]) => {
        setAdminRecords(recRes.records || []);
        setVehicleModels(modelRes.models || {});
      })
      .catch(() => setAdminError("Không tải được dữ liệu, kiểm tra kết nối mạng."));
  }, [configured, isAdmin, tab]);

  const doLogin = useCallback(async () => {
    setLoginError("");
    if (!loginUsername.trim() || !loginPin.trim()) {
      setLoginError("Nhập đủ tên đăng nhập và mã PIN.");
      return;
    }
    setLoginBusy(true);
    try {
      await signInDriver(loginUsername, loginPin);
      setLoginPin("");
    } catch (err) {
      setLoginError(mapAuthError(err));
    }
    setLoginBusy(false);
  }, [loginUsername, loginPin]);

  const logout = useCallback(() => {
    signOutDriver();
    setRecords(null);
    setTab("nhap");
    setPhotos({ meter: null, odo: null, plateShot: null });
    setPlateField("");
    setLiters("");
    setOdo("");
    setNeedsReview(false);
  }, []);

  const handleCapture = async (key, file) => {
    setPhotoBusy(true);
    setFormError("");
    try {
      const url = await compressImage(file);
      setPhotos((p) => ({ ...p, [key]: url }));
      setPhotoBusy(false);

      if (key === "meter") {
        setOcrStatus((s) => ({ ...s, liters: "reading" }));
        const { value, confidence } = await readValueFromImage(url, "liters");
        setOcrStatus((s) => ({ ...s, liters: value != null ? (confidence === "high" ? "done" : "low") : "error" }));
        if (value != null) setLiters(String(value));
      } else if (key === "odo") {
        setOcrStatus((s) => ({ ...s, odo: "reading" }));
        const { value, confidence } = await readValueFromImage(url, "odo");
        setOcrStatus((s) => ({ ...s, odo: value != null ? (confidence === "high" ? "done" : "low") : "error" }));
        if (value != null) setOdo(String(value));
      } else if (key === "plateShot") {
        setOcrStatus((s) => ({ ...s, plate: "reading" }));
        const { value, confidence } = await readValueFromImage(url, "plate");
        setOcrStatus((s) => ({ ...s, plate: value != null ? (confidence === "high" ? "done" : "low") : "error" }));
        if (value != null) setPlateField(String(value).toUpperCase());
      }
    } catch {
      setFormError("Không đọc được ảnh, thử chụp lại.");
      setPhotoBusy(false);
    }
  };

  const canSubmit = photos.meter && photos.odo && photos.plateShot && plateField && liters && odo && !saving;

  const submit = async () => {
    setFormError("");
    const litersNum = parseFloat(liters);
    const odoNum = parseFloat(odo);
    if (!litersNum || litersNum <= 0) return setFormError("Số lít dầu không hợp lệ.");
    if (!odoNum || odoNum <= 0) return setFormError("Số odo không hợp lệ.");
    if (!plateField.trim()) return setFormError("Chưa có biển số xe.");

    setSaving(true);
    try {
      const [meterPhotoUrl, odoPhotoUrl, platePhotoUrl, position] = await Promise.all([
        uploadToCloudinary(photos.meter),
        uploadToCloudinary(photos.odo),
        uploadToCloudinary(photos.plateShot),
        getCurrentPosition(),
      ]);
      const locationName = matchLocation(position, FUEL_LOCATIONS) || (position ? "Không xác định" : "");
      await sheetPost({
        action: "add",
        driver,
        plate: plateField.trim().toUpperCase(),
        date: new Date().toISOString(),
        liters: litersNum,
        odo: odoNum,
        needsReview,
        meterPhotoUrl,
        odoPhotoUrl,
        platePhotoUrl,
        locationName,
        lat: position ? position.lat : null,
        lng: position ? position.lng : null,
      });
      const d = await sheetGet("list", { driver });
      setRecords(d.records || []);
      setPhotos({ meter: null, odo: null, plateShot: null });
      setPlateField("");
      setLiters("");
      setOdo("");
      setNeedsReview(false);
      setOcrStatus({ plate: "idle", liters: "idle", odo: "idle" });
      setSaveMsg("Đã lưu lần đổ dầu.");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (err) {
      if (err && err.message === "no-cloudinary-config") {
        setFormError("Chưa cấu hình Cloudinary — bấm biểu tượng ⚙️ để nhập.");
      } else {
        setFormError("Lưu thất bại — kiểm tra mạng hoặc cấu hình trong Cài đặt.");
      }
    }
    setSaving(false);
  };

  // consumption is computed per VEHICLE (plate), not per driver, since several
  // drivers can share the same truck — see the "Theo xe" tab.
  const vehicleSorted = vehicleRecords
    ? [...vehicleRecords].map((r) => ({ ...r, liters: Number(r.liters), odo: Number(r.odo) })).sort((a, b) => a.odo - b.odo)
    : [];
  const vehicleWithConsumption = vehicleSorted.map((rec, i) => {
    if (i === 0) return { ...rec, distance: null, consumption: null };
    const prev = vehicleSorted[i - 1];
    const distance = rec.odo - prev.odo;
    const consumption = distance > 0 ? (rec.liters / distance) * 100 : null;
    return { ...rec, distance, consumption };
  });
  const vehicleWithConsumptionDesc = [...vehicleWithConsumption].reverse();
  const validConsumptions = vehicleWithConsumption.filter((r) => r.consumption != null);
  const avgConsumption = validConsumptions.length > 0 ? validConsumptions.reduce((s, r) => s + r.consumption, 0) / validConsumptions.length : null;

  const myRecordsDesc = records ? [...records].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

  // ---- admin dashboard: aggregate every vehicle, flag records that need review ----
  function computeConsumption(recs) {
    const sorted = [...recs].map((r) => ({ ...r, liters: Number(r.liters), odo: Number(r.odo) })).sort((a, b) => a.odo - b.odo);
    return sorted.map((rec, i) => {
      if (i === 0) return { ...rec, distance: null, consumption: null };
      const prev = sorted[i - 1];
      const distance = rec.odo - prev.odo;
      const consumption = distance > 0 ? (rec.liters / distance) * 100 : null;
      return { ...rec, distance, consumption };
    });
  }

  let adminVehicleSummaries = [];
  let adminFlagged = [];
  let adminRecordsDesc = [];
  let adminModelSummaries = [];
  let adminDriverModelSummaries = [];
  if (adminRecords) {
    const byPlate = {};
    for (const r of adminRecords) {
      const key = r.plate || "(chưa rõ biển số)";
      if (!byPlate[key]) byPlate[key] = [];
      byPlate[key].push(r);
    }

    const modelOf = (plate) => (vehicleModels && vehicleModels[plate]) || "(chưa gán dòng xe)";

    // flat list of every computable fill-up interval, tagged with plate/model/driver
    const events = [];
    adminVehicleSummaries = Object.entries(byPlate)
      .map(([plate, recs]) => {
        const withConsumption = computeConsumption(recs);
        withConsumption.forEach((r) => {
          if (r.consumption != null) events.push({ ...r, plate, model: modelOf(plate) });
        });
        const valid = withConsumption.filter((r) => r.consumption != null);
        const avg = valid.length > 0 ? valid.reduce((s, r) => s + r.consumption, 0) / valid.length : null;
        return { plate, model: modelOf(plate), count: recs.length, avgConsumption: avg };
      })
      .sort((a, b) => a.plate.localeCompare(b.plate));

    const byModel = {};
    for (const ev of events) {
      if (!byModel[ev.model]) byModel[ev.model] = [];
      byModel[ev.model].push(ev);
    }
    adminModelSummaries = Object.entries(byModel)
      .map(([model, evs]) => ({
        model,
        avgConsumption: evs.reduce((s, e) => s + e.consumption, 0) / evs.length,
        count: evs.length,
        plateCount: new Set(evs.map((e) => e.plate)).size,
      }))
      .sort((a, b) => b.avgConsumption - a.avgConsumption);

    const byDriverModel = {};
    for (const ev of events) {
      const key = `${ev.driver}||${ev.model}`;
      if (!byDriverModel[key]) byDriverModel[key] = { driver: ev.driver, model: ev.model, evs: [] };
      byDriverModel[key].evs.push(ev);
    }
    adminDriverModelSummaries = Object.values(byDriverModel)
      .map((g) => ({
        driver: g.driver,
        model: g.model,
        avgConsumption: g.evs.reduce((s, e) => s + e.consumption, 0) / g.evs.length,
        count: g.evs.length,
      }))
      .sort((a, b) => a.model.localeCompare(b.model) || a.avgConsumption - b.avgConsumption);

    adminFlagged = adminRecords.filter((r) => r.needsReview).sort((a, b) => new Date(b.date) - new Date(a.date));
    adminRecordsDesc = [...adminRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  const shellStyle = {
    minHeight: "100vh",
    background: "#F3F4F6",
    color: "#111827",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    justifyContent: "center",
  };
  const cardStyle = { width: "100%", maxWidth: 420, minHeight: "100vh", display: "flex", flexDirection: "column" };
  const mono = { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" };

  // ---- not configured yet ----
  if (!configured || !cloudinaryReady) {
    const missing = [];
    if (!configured) missing.push("Google Sheet");
    if (!cloudinaryReady) missing.push("Cloudinary");
    return (
      <div style={shellStyle}>
        <GlobalStyle />
        <div style={{ ...cardStyle, padding: "40px 24px", alignItems: "center", textAlign: "center", justifyContent: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Fuel size={24} color="#111827" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Chưa cấu hình xong: {missing.join(", ")}</div>
          <p style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
            Mở file <b>src/config.js</b>, điền link Google Sheet và thông tin Cloudinary vào, rồi build lại. Xem hướng dẫn chi tiết trong <b>README.md</b>.
          </p>
        </div>
      </div>
    );
  }

  // ---- Firebase not configured yet ----
  if (!firebaseConfigured) {
    return (
      <div style={shellStyle}>
        <GlobalStyle />
        <div style={{ ...cardStyle, padding: "40px 24px", alignItems: "center", textAlign: "center", justifyContent: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <User size={24} color="#111827" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Chưa cấu hình Firebase</div>
          <p style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
            Mở file <b>src/firebase.js</b>, dán cấu hình dự án Firebase của bạn vào, rồi build lại. Xem hướng dẫn chi tiết trong <b>README.md</b>, mục "Firebase".
          </p>
        </div>
      </div>
    );
  }

  // ---- auth still loading ----
  if (authLoading) {
    return (
      <div style={shellStyle}>
        <GlobalStyle />
        <div style={{ ...cardStyle, alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>Đang tải…</div>
        </div>
      </div>
    );
  }

  // ---- login screen (Firebase: username + PIN) ----
  if (!driver) {
    return (
      <div style={shellStyle}>
        <GlobalStyle />
        <div style={{ ...cardStyle, padding: "24px 20px" }}>
          <CompanyHeader subtitle="Đăng nhập lái xe" />
          <div style={{ padding: "0 4px" }}>
          <p style={{ color: "#6B7280", fontSize: 13.5, marginTop: 6, marginBottom: 32, lineHeight: 1.5 }}>
            Đăng nhập bằng tài khoản quản lý đội xe cấp cho bạn.
          </p>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>Tên đăng nhập</div>
            <input
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="VD: nguyenvana"
              autoCapitalize="none"
              style={{ width: "100%", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: "13px 14px", color: "#111827", fontSize: 15, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>Mã PIN</div>
            <input
              value={loginPin}
              onChange={(e) => setLoginPin(e.target.value)}
              type="password"
              inputMode="numeric"
              placeholder="••••••"
              style={{ width: "100%", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: "13px 14px", color: "#111827", fontSize: 15, outline: "none", boxSizing: "border-box" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") doLogin();
              }}
            />
          </div>

          {loginError && (
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start", color: "#E5484D", fontSize: 13, marginBottom: 14 }}>
              <AlertCircle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          )}

          <button
            onClick={doLogin}
            disabled={loginBusy}
            style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: "#F5A623", color: "#111827", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
          >
            {loginBusy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>

          <div style={{ marginTop: 40, fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.5 }}>
            Mỗi lần đổ dầu, biển số xe / số lít / số odo sẽ được đọc tự động từ 3 ảnh chụp. Bạn chỉ cần tích "báo sai" nếu thấy phần mềm đọc nhầm. Chưa có tài khoản? Liên hệ quản lý đội xe.
          </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- logged-in shell ----
  return (
    <div style={shellStyle}>
      <GlobalStyle />
      <div style={cardStyle}>
        <div style={{ padding: "16px 20px 0 20px" }}>
          <CompanyHeader subtitle={`Lái xe: ${displayName(driver)}`} onLogout={logout} />

          <div style={{ display: "flex", gap: 4, marginTop: 4, borderBottom: "1px solid #E5E7EB" }}>
            {[
              { id: "nhap", label: "Đổ dầu", icon: Fuel },
              { id: "cuatoi", label: "Của tôi", icon: History },
              { id: "theoxe", label: "Theo xe", icon: Truck },
              ...(isAdmin ? [{ id: "quantri", label: "Quản trị", icon: ShieldCheck }] : []),
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{ flex: 1, background: "none", border: "none", padding: "10px 0 12px 0", color: active ? "#F5A623" : "#9CA3AF", borderBottom: active ? "2px solid #F5A623" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: -1 }}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, padding: "22px 20px 40px 20px", overflowY: "auto" }}>
          {tab === "nhap" && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                <PhotoSlot label="Số lít ở cây dầu" dataUrl={photos.meter} busy={photoBusy} onCapture={(f) => handleCapture("meter", f)} />
                <PhotoSlot label="Đồng hồ Odo" dataUrl={photos.odo} busy={photoBusy} onCapture={(f) => handleCapture("odo", f)} />
                <PhotoSlot label="Biển số xe" dataUrl={photos.plateShot} busy={photoBusy} onCapture={(f) => handleCapture("plateShot", f)} />
              </div>

              <Field label="Biển số xe" hint={<OcrHint status={ocrStatus.plate} />}>
                <input
                  type="text"
                  value={plateField}
                  onChange={(e) => {
                    setPlateField(e.target.value);
                    setOcrStatus((s) => ({ ...s, plate: "idle" }));
                  }}
                  placeholder="VD: 24H-040.86"
                  style={{ width: "100%", background: "#FFFFFF", border: ocrStatus.plate === "low" ? "1px solid #F5A623" : "1px solid #E5E7EB", borderRadius: 10, padding: "14px 14px", color: "#111827", fontSize: 18, ...mono, outline: "none", boxSizing: "border-box", textTransform: "uppercase" }}
                />
              </Field>

              <Field label="Số lít dầu vừa đổ" unit="lít" hint={<OcrHint status={ocrStatus.liters} />}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={liters}
                  onChange={(e) => {
                    setLiters(e.target.value);
                    setOcrStatus((s) => ({ ...s, liters: "idle" }));
                  }}
                  placeholder="0.0"
                  style={{ width: "100%", background: "#FFFFFF", border: ocrStatus.liters === "low" ? "1px solid #F5A623" : "1px solid #E5E7EB", borderRadius: 10, padding: "14px 14px", color: "#111827", fontSize: 20, ...mono, outline: "none", boxSizing: "border-box" }}
                />
              </Field>

              <Field label="Số Odo vừa chụp" unit="km" hint={<OcrHint status={ocrStatus.odo} />}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={odo}
                  onChange={(e) => {
                    setOdo(e.target.value);
                    setOcrStatus((s) => ({ ...s, odo: "idle" }));
                  }}
                  placeholder="0"
                  style={{ width: "100%", background: "#FFFFFF", border: ocrStatus.odo === "low" ? "1px solid #F5A623" : "1px solid #E5E7EB", borderRadius: 10, padding: "14px 14px", color: "#111827", fontSize: 20, ...mono, outline: "none", boxSizing: "border-box" }}
                />
              </Field>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "13px 14px",
                  borderRadius: 10,
                  border: needsReview ? "1px solid #E5484D" : "1px solid #E5E7EB",
                  background: needsReview ? "rgba(229,72,77,0.08)" : "#FFFFFF",
                  marginBottom: 18,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={needsReview}
                  onChange={(e) => setNeedsReview(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: "#E5484D" }}
                />
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: needsReview ? "#F0A8AA" : "#6B7280" }}>
                  Phần mềm đọc <b>sai</b> một trong các số ở trên — đánh dấu để kế toán xem lại ảnh và nhập tay lại.
                </span>
              </label>

              {formError && (
                <div style={{ display: "flex", gap: 7, alignItems: "flex-start", color: "#E5484D", fontSize: 13, marginBottom: 14, marginTop: -4 }}>
                  <AlertCircle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{formError}</span>
                </div>
              )}

              <button
                onClick={submit}
                disabled={!canSubmit}
                style={{ width: "100%", padding: "15px 0", borderRadius: 10, border: "none", background: canSubmit ? "#F5A623" : "#E5E7EB", color: canSubmit ? "#111827" : "#9CA3AF", fontSize: 15, fontWeight: 700, cursor: canSubmit ? "pointer" : "default" }}
              >
                {saving ? "Đang lưu…" : "Lưu lần đổ dầu"}
              </button>

              {saveMsg && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#178A4C", fontSize: 13, marginTop: 12, justifyContent: "center" }}>
                  <Check size={14} /> {saveMsg}
                </div>
              )}
            </div>
          )}

          {tab === "cuatoi" && (
            <div>
              {recordsError && (
                <div style={{ display: "flex", gap: 7, color: "#E5484D", fontSize: 13, marginBottom: 16 }}>
                  <AlertCircle size={15} /> {recordsError}
                </div>
              )}
              {records === null && !recordsError && <div style={{ color: "#9CA3AF", fontSize: 13 }}>Đang tải lịch sử…</div>}

              {records !== null && records.length === 0 && (
                <div style={{ textAlign: "center", padding: "50px 10px", color: "#9CA3AF" }}>
                  <Gauge size={26} style={{ marginBottom: 10, opacity: 0.6 }} />
                  <div style={{ fontSize: 13.5 }}>Bạn chưa có lần đổ dầu nào.</div>
                </div>
              )}

              {records !== null && records.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>{records.length} lần đổ dầu · mới nhất trước</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {myRecordsDesc.map((r) => (
                      <div key={r.id} style={{ border: r.needsReview ? "1px solid #E5484D" : "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", background: "#FFFFFF" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, color: "#6B7280" }}>{formatDate(r.date)}</span>
                          {r.needsReview ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "#E5484D" }}>
                              <AlertTriangle size={12} /> Cần kiểm tra
                            </span>
                          ) : (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#178A4C" }}>
                              <Check size={12} /> Đã xác nhận đúng
                            </span>
                          )}
                        </div>
                        <div style={{ marginBottom: 10 }}><LocationBadge record={r} /></div>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>BIỂN SỐ</div>
                            <div style={{ ...mono, fontSize: 14, fontWeight: 600 }}>{r.plate}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>ĐỔ DẦU</div>
                            <div style={{ ...mono, fontSize: 14, fontWeight: 600 }}>{Number(r.liters).toLocaleString("vi-VN")} L</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>ODO</div>
                            <div style={{ ...mono, fontSize: 14, fontWeight: 600 }}>{Number(r.odo).toLocaleString("vi-VN")} km</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "theoxe" && (
            <div>
              {!selectedVehicle && (
                <>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12 }}>Chọn xe để xem lịch sử đổ dầu &amp; mức tiêu hao (gộp tất cả lái xe)</div>
                  {vehicleList.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13 }}>Chưa có xe nào trong dữ liệu.</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {vehicleList.map((p) => (
                      <button
                        key={p}
                        onClick={() => setSelectedVehicle(p)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#111827", cursor: "pointer", textAlign: "left" }}
                      >
                        <Car size={17} color="#F5A623" />
                        <span style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{p}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedVehicle && (
                <div>
                  <button onClick={() => { setSelectedVehicle(null); setVehicleRecords(null); }} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 12.5, marginBottom: 14, cursor: "pointer", padding: 0 }}>
                    ← Chọn xe khác
                  </button>

                  {vehicleRecords === null && <div style={{ color: "#9CA3AF", fontSize: 13 }}>Đang tải…</div>}

                  {vehicleRecords !== null && vehicleRecords.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 10px", color: "#9CA3AF" }}>
                      <Gauge size={24} style={{ marginBottom: 10, opacity: 0.6 }} />
                      <div style={{ fontSize: 13.5 }}>Chưa có dữ liệu cho xe {selectedVehicle}.</div>
                    </div>
                  )}

                  {vehicleRecords !== null && vehicleRecords.length > 0 && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{selectedVehicle} · Tiêu hao trung bình</div>
                          <div style={{ ...mono, fontSize: 24, fontWeight: 700 }}>
                            {avgConsumption != null ? avgConsumption.toFixed(1) : "—"}
                            <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 500 }}> lít/100km</span>
                          </div>
                        </div>
                        <TrendingDown size={26} color="#F5A623" strokeWidth={1.6} />
                      </div>

                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>{vehicleRecords.length} lần đổ dầu · mới nhất trước</div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {vehicleWithConsumptionDesc.map((r) => (
                          <div key={r.id} style={{ border: r.needsReview ? "1px solid #E5484D" : "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", background: "#FFFFFF" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                              <span style={{ fontSize: 12.5, color: "#6B7280" }}>{formatDate(r.date)} · {displayName(r.driver)}</span>
                              {r.consumption != null ? (
                                <span style={{ ...mono, fontSize: 13.5, fontWeight: 700, color: "#F5A623" }}>{r.consumption.toFixed(1)} L/100km</span>
                              ) : (
                                <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>Mốc khởi điểm</span>
                              )}
                            </div>
                            {r.needsReview && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#E5484D", marginBottom: 8 }}>
                                <AlertTriangle size={11} /> Lái xe báo đọc sai — cần kiểm tra ảnh
                              </div>
                            )}
                            <div style={{ marginBottom: 8 }}><LocationBadge record={r} /></div>
                            <div style={{ display: "flex", gap: 18 }}>
                              <div>
                                <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>ĐỔ DẦU</div>
                                <div style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{r.liters.toLocaleString("vi-VN")} L</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>ODO</div>
                                <div style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{r.odo.toLocaleString("vi-VN")} km</div>
                              </div>
                              {r.distance != null && (
                                <div>
                                  <div style={{ fontSize: 10.5, color: "#9CA3AF", marginBottom: 2 }}>QUÃNG ĐƯỜNG</div>
                                  <div style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{r.distance.toLocaleString("vi-VN")} km</div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "quantri" && isAdmin && (
            <div>
              {adminError && (
                <div style={{ display: "flex", gap: 7, color: "#E5484D", fontSize: 13, marginBottom: 16 }}>
                  <AlertCircle size={15} /> {adminError}
                </div>
              )}
              {adminRecords === null && !adminError && <div style={{ color: "#9CA3AF", fontSize: 13 }}>Đang tải dữ liệu toàn đội xe…</div>}

              {adminRecords !== null && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Tiêu hao trung bình theo xe</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                    {adminVehicleSummaries.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>Chưa có dữ liệu.</div>}
                    {adminVehicleSummaries.map((v) => (
                      <div key={v.plate} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", background: "#FFFFFF" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <Car size={15} color="#F5A623" style={{ flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ ...mono, fontSize: 14, fontWeight: 600 }}>{v.plate}</div>
                            <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>{v.model}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: "#178A4C" }}>
                            {v.avgConsumption != null ? v.avgConsumption.toFixed(1) : "—"} L/100km
                          </span>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{v.count} lần đổ dầu</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Tiêu hao trung bình theo dòng xe</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                    {adminModelSummaries.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>Chưa có dữ liệu.</div>}
                    {adminModelSummaries.map((m) => (
                      <div key={m.model} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", background: "#FFFFFF" }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>{m.model}</div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: "#178A4C" }}>{m.avgConsumption.toFixed(1)} L/100km</span>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{m.plateCount} xe · {m.count} lần đổ dầu</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Tiêu hao theo Lái xe × Dòng xe</div>
                  <div style={{ fontSize: 11.5, color: "#9CA3AF", marginBottom: 10 }}>So sánh trực tiếp — cùng 1 dòng xe, xếp từ tiết kiệm nhất trở lên.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                    {Object.entries(
                      adminDriverModelSummaries.reduce((acc, r) => {
                        if (!acc[r.model]) acc[r.model] = [];
                        acc[r.model].push(r);
                        return acc;
                      }, {})
                    ).map(([model, rows]) => (
                      <div key={model}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>{model}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {rows.map((r) => (
                            <div key={r.driver} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 12px", background: "#FFFFFF" }}>
                              <span style={{ fontSize: 13 }}>{displayName(r.driver)}</span>
                              <div style={{ textAlign: "right" }}>
                                <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "#178A4C" }}>{r.avgConsumption.toFixed(1)} L/100km</span>
                                <span style={{ fontSize: 10.5, color: "#9CA3AF", marginLeft: 6 }}>({r.count} lần)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {adminDriverModelSummaries.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>Chưa đủ dữ liệu để so sánh.</div>}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#E5484D", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={15} /> Cần kiểm tra ({adminFlagged.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                    {adminFlagged.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>Không có lần nào bị báo đọc sai.</div>}
                    {adminFlagged.map((r) => (
                      <div key={r.id} style={{ border: "1px solid #E5484D", borderRadius: 10, padding: "12px 14px", background: "#FEF2F2" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#6B7280", marginBottom: 6 }}>
                          <span>{formatDate(r.date)} · {displayName(r.driver)}</span>
                          <span style={{ ...mono, fontWeight: 700 }}>{r.plate}</span>
                        </div>
                        <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                          <span><b>{Number(r.liters).toLocaleString("vi-VN")}</b> L</span>
                          <span><b>{Number(r.odo).toLocaleString("vi-VN")}</b> km</span>
                        </div>
                        <div style={{ marginTop: 6 }}><LocationBadge record={r} /></div>
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                          {r.meterPhotoUrl && <a href={r.meterPhotoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#178A4C" }}>Ảnh cây dầu</a>}
                          {r.odoPhotoUrl && <a href={r.odoPhotoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#178A4C" }}>Ảnh odo</a>}
                          {r.platePhotoUrl && <a href={r.platePhotoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#178A4C" }}>Ảnh biển số</a>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Toàn bộ lịch sử ({adminRecordsDesc.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {adminRecordsDesc.map((r) => (
                      <div key={r.id} style={{ border: r.needsReview ? "1px solid #E5484D" : "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", background: "#FFFFFF", fontSize: 12.5 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
                          <span>{formatDate(r.date)} · {displayName(r.driver)}</span>
                          <span style={{ ...mono, fontWeight: 700, color: "#111827" }}>{r.plate}</span>
                        </div>
                        <div style={{ display: "flex", gap: 14, marginTop: 4, alignItems: "center" }}>
                          <span>{Number(r.liters).toLocaleString("vi-VN")} L</span>
                          <span>{Number(r.odo).toLocaleString("vi-VN")} km</span>
                          {r.needsReview && <span style={{ color: "#E5484D", fontWeight: 700 }}>Cần kiểm tra</span>}
                          <LocationBadge record={r} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
