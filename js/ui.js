import { EMOJI_LIST } from "./config.js";
import { escapeHtml } from "./utils.js";

export function createEmojiPicker({ onSelect, anchorEl }) {
  const picker = document.createElement("div");
  picker.className = "emoji-picker";
  picker.innerHTML = `<div class="emoji-picker-grid"></div>`;
  const grid = picker.querySelector(".emoji-picker-grid");

  EMOJI_LIST.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-picker-item";
    btn.textContent = emoji;
    btn.title = emoji;
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(emoji);
      picker.classList.remove("active");
    };
    grid.appendChild(btn);
  });

  anchorEl.style.position = "relative";
  anchorEl.appendChild(picker);

  const toggle = (e) => {
    e?.stopPropagation();
    document.querySelectorAll(".emoji-picker.active").forEach((p) => {
      if (p !== picker) p.classList.remove("active");
    });
    picker.classList.toggle("active");
  };

  const closeOnOutside = (e) => {
    if (!picker.contains(e.target) && !anchorEl.contains(e.target)) {
      picker.classList.remove("active");
    }
  };

  document.addEventListener("click", closeOnOutside);

  return { picker, toggle, destroy: () => document.removeEventListener("click", closeOnOutside) };
}

export function initMobileDrawer({ channelList, channelOverlay, channelToggle, chatArea }) {
  const open = () => {
    channelList.classList.add("drawer-open");
    channelOverlay.classList.add("active");
  };
  const close = () => {
    channelList.classList.remove("drawer-open");
    channelOverlay.classList.remove("active");
  };
  const toggle = () => {
    if (channelList.classList.contains("drawer-open")) close();
    else open();
  };

  channelToggle?.addEventListener("click", toggle);
  channelOverlay?.addEventListener("click", close);

  let touchStartX = 0;
  let touchStartY = 0;
  let tracking = false;

  const onTouchStart = (e) => {
    if (window.innerWidth > 768) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    tracking = true;
  };

  const onTouchEnd = (e) => {
    if (!tracking || window.innerWidth > 768) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 80 && touchStartX < 40) open();
    if (dx < -80) close();
  };

  chatArea?.addEventListener("touchstart", onTouchStart, { passive: true });
  chatArea?.addEventListener("touchend", onTouchEnd, { passive: true });

  return { open, close, toggle };
}

export function initMobileMenu() {
  const btn = document.getElementById("mobileMenuBtn");
  const menu = document.getElementById("mobileMenu");
  const memberDrawer = document.getElementById("memberDrawer");

  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu?.classList.toggle("active");
  });

  document.addEventListener("click", () => menu?.classList.remove("active"));

  menu?.addEventListener("click", (e) => {
    e.stopPropagation();
    const action = e.target.closest(".mobile-menu-item")?.dataset.action;
    menu.classList.remove("active");
    if (action === "members" && memberDrawer) {
      memberDrawer.classList.toggle("open");
      document.getElementById("memberOverlay")?.classList.toggle("active");
    }
  });

  document.getElementById("memberOverlay")?.addEventListener("click", () => {
    memberDrawer?.classList.remove("open");
    document.getElementById("memberOverlay")?.classList.remove("active");
  });
}

export function initServerIcons() {
  document.querySelectorAll(".server-icon[data-server]").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".server-icon").forEach((s) => s.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

export function initChannels({ onSwitchRoom, onDrawerClose }) {
  document.querySelectorAll(".channel[data-room]").forEach((el) => {
    el.addEventListener("click", () => {
      onSwitchRoom(el.dataset.room);
      if (window.innerWidth <= 768) onDrawerClose?.();
    });
  });
}

export function updateUnreadBadges({ currentRoom, unreadCounts }) {
  document.querySelectorAll(".channel[data-room]").forEach((el) => {
    const room = el.dataset.room;
    const count = unreadCounts[room] || 0;
    el.classList.toggle("unread", room !== currentRoom && count > 0);
    let badge = el.querySelector(".unread-badge");
    if (room !== currentRoom && count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "unread-badge";
        el.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  });

  const hasAnyUnread = Object.entries(unreadCounts).some(([r, c]) => r !== currentRoom && c > 0);
  document.querySelector(".server-icon[data-server='main']")?.classList.toggle("unread", hasAnyUnread);
}

export function renderOfflineMembers(container, members) {
  if (!container) return;
  container.innerHTML = members.map((m) => `
    <div class="member offline">
      <div class="member-avatar">
        <div class="avatar" style="background-color:${m.color}"></div>
        <div class="status-dot offline"></div>
      </div>
      <div class="member-name">${escapeHtml(m.name)}</div>
    </div>
  `).join("");
}

export function scrollToMessage(messageId) {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.background = "rgba(88,101,242,0.15)";
    setTimeout(() => { el.style.background = ""; }, 1500);
  }
}

export function setupReplyBar() {
  const bar = document.getElementById("replyBar");
  const text = document.getElementById("replyBarText");
  const closeBtn = document.getElementById("replyBarClose");
  let currentReply = null;

  closeBtn?.addEventListener("click", () => setReply(null));

  function setReply(reply) {
    currentReply = reply;
    if (reply) {
      bar?.classList.add("active");
      if (text) text.innerHTML = `Đang trả lời <strong>@${escapeHtml(reply.username)}</strong>`;
      document.getElementById("messageInput")?.focus();
    } else {
      bar?.classList.remove("active");
      if (text) text.textContent = "";
    }
  }

  return { getReply: () => currentReply, setReply };
}

export function setupAutoResizeTextarea(inputEl) {
  const resize = () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
  };
  inputEl?.addEventListener("input", resize);
  return resize;
}

export function setupCharacterCounter(inputEl, maxLength) {
  let counter = document.getElementById("charCounter");
  
  if (!counter) {
    counter = document.createElement("div");
    counter.id = "charCounter";
    counter.className = "char-counter";
    const statusBar = document.querySelector(".status-bar");
    if (statusBar) {
      statusBar.insertAdjacentElement("afterbegin", counter);
    }
  }

  const updateCounter = () => {
    const length = inputEl.value.length;
    counter.textContent = `${length}/${maxLength}`;
    
    if (length > maxLength * 0.9) {
      counter.classList.add("warning");
    } else if (length > maxLength * 0.7) {
      counter.classList.add("caution");
      counter.classList.remove("warning");
    } else {
      counter.classList.remove("warning", "caution");
    }
    
    // Disable send button if over limit
    const sendBtn = document.querySelector(".send-btn");
    if (sendBtn) {
      sendBtn.disabled = length > maxLength || length === 0;
    }
  };

  inputEl?.addEventListener("input", updateCounter);
  updateCounter();
  
  return updateCounter;
}

export function showFilePreview(file) {
  let preview = document.getElementById("filePreview");
  
  if (!preview) {
    preview = document.createElement("div");
    preview.id = "filePreview";
    preview.className = "file-preview";
    const chatInputWrapper = document.querySelector(".chat-input-wrapper");
    if (chatInputWrapper) {
      chatInputWrapper.insertAdjacentElement("afterbegin", preview);
    }
  }

  preview.innerHTML = `
    <div class="preview-content">
      <span class="preview-icon">📎</span>
      <div class="preview-info">
        <div class="preview-name">${escapeHtml(file.name)}</div>
        <div class="preview-size">${(file.size / 1024).toFixed(2)} KB</div>
      </div>
      <button type="button" class="preview-close" aria-label="Xóa file">✕</button>
    </div>
  `;

  const closeBtn = preview.querySelector(".preview-close");
  closeBtn?.addEventListener("click", () => {
    preview.remove();
    const fileInput = document.getElementById("fileInput");
    if (fileInput) fileInput.value = "";
  });

  return preview;
}

export function hideFilePreview() {
  const preview = document.getElementById("filePreview");
  if (preview) preview.remove();
}
