export const escapeHtml = (unsafe = "") =>
  unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const getAvatarColor = (name) => {
  const colors = ["#5865F2", "#ed4245", "#fee75c", "#ea2652", "#9b59b6", "#23a559"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export const sanitizeFilename = (name) =>
  String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

export const getClientUserId = () => {
  const cached = localStorage.getItem("chat_user_id");
  if (cached) return cached;
  const id = crypto.randomUUID();
  localStorage.setItem("chat_user_id", id);
  return id;
};

/** Hôm nay / Hôm qua / ngày đầy đủ */
export const formatSmartTime = (isoString) => {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const time = date.toLocaleTimeString("vi-VN", { hour: "numeric", minute: "2-digit", hour12: true });
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `Hôm nay lúc ${time}`;
    if (isYesterday) return `Hôm qua lúc ${time}`;
    return date.toLocaleString("vi-VN", {
      day: "numeric",
      month: "long",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return "--:--";
  }
};

export const formatDateDivider = (isoString) => {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === now.toDateString()) return "Hôm nay";
    if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
    return date.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
    });
  } catch {
    return "";
  }
};

export const encodeAttachmentMarker = ({ name, mime, url }) =>
  `[[file:${encodeURIComponent(name)}:${encodeURIComponent(mime || "application/octet-stream")}:${encodeURIComponent(url)}]]`;

export const parseAttachmentMarker = (raw) => {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^\[\[file:([^:]*):([^:]*):(.+)\]\]$/);
  if (!match) return null;
  try {
    return {
      name: decodeURIComponent(match[1] || "file"),
      mime: decodeURIComponent(match[2] || "application/octet-stream"),
      url: decodeURIComponent(match[3] || "")
    };
  } catch {
    return null;
  }
};

export const encodeReplyMarker = ({ id, username, preview }) =>
  `[[reply:${id}:${encodeURIComponent(username)}:${encodeURIComponent(preview || "")}]]`;

export const parseReplyMarker = (raw) => {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^\[\[reply:([^:]+):([^:]*):(.+)\]\]$/);
  if (!match) return null;
  try {
    return {
      id: match[1],
      username: decodeURIComponent(match[2] || ""),
      preview: decodeURIComponent(match[3] || "")
    };
  } catch {
    return null;
  }
};

export const stripMarkers = (content) => {
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    const t = line.trim();
    return !parseReplyMarker(t) && !parseAttachmentMarker(t);
  });
  return filtered.join("\n").trim();
};

export const getUnreadStorage = () => {
  try {
    return JSON.parse(localStorage.getItem("chat_unread") || "{}");
  } catch {
    return {};
  }
};

export const setUnreadStorage = (data) => {
  localStorage.setItem("chat_unread", JSON.stringify(data));
};

export const getLastReadStorage = () => {
  try {
    return JSON.parse(localStorage.getItem("chat_last_read") || "{}");
  } catch {
    return {};
  }
};

export const setLastReadStorage = (data) => {
  localStorage.setItem("chat_last_read", JSON.stringify(data));
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const getFileExtension = (filename) => {
  if (!filename) return "";
  return filename.split(".").pop().toLowerCase();
};

export const isValidFileType = (file, allowedExtensions, allowedMimes) => {
  const ext = getFileExtension(file.name);
  const mimeType = file.type || "application/octet-stream";
  
  // Check extension
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, reason: `Định dạng .${ext} không được phép` };
  }
  
  // Check MIME type if provided
  if (allowedMimes && allowedMimes.length > 0 && !allowedMimes.includes(mimeType)) {
    return { valid: false, reason: `Loại file không hợp lệ (${mimeType})` };
  }
  
  return { valid: true };
};

export const isValidFileSize = (fileSize, maxSize) => {
  if (fileSize > maxSize) {
    return {
      valid: false,
      reason: `File quá lớn. Tối đa ${formatFileSize(maxSize)}, file của bạn ${formatFileSize(fileSize)}`
    };
  }
  return { valid: true };
};
