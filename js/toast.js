let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.id = "toastContainer";
    document.body.appendChild(container);
  }
  return container;
}

const ICONS = {
  error: "❌",
  success: "✅",
  warning: "⚠️",
  info: "ℹ️"
};

export function showToast({ title, message, type = "info", duration = 4000 }) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${title}</div>` : ""}
      <div class="toast-message">${message}</div>
    </div>
  `;
  ensureContainer().appendChild(el);

  const remove = () => {
    el.style.opacity = "0";
    el.style.transform = "translateX(40px)";
    el.style.transition = "all 0.25s ease";
    setTimeout(() => el.remove(), 250);
  };

  setTimeout(remove, duration);
  el.addEventListener("click", remove);
  return remove;
}

export function showError(message, title = "Lỗi") {
  return showToast({ title, message, type: "error", duration: 5000 });
}

export function showSuccess(message, title = "Thành công") {
  return showToast({ title, message, type: "success" });
}

export function showNetworkError() {
  return showError("Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.", "Mất kết nối");
}
