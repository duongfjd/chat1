import { STORAGE_BUCKET, OFFLINE_MEMBERS } from "./config.js";
import { getClientUserId, sanitizeFilename, getAvatarColor, escapeHtml } from "./utils.js";
import { supabase } from "./supabase-client.js";
import { createMessageManager } from "./messages.js";
import { showError, showSuccess, showNetworkError } from "./toast.js";
import {
  createEmojiPicker,
  initMobileDrawer,
  initMobileMenu,
  initServerIcons,
  initChannels,
  updateUnreadBadges,
  renderOfflineMembers,
  setupReplyBar,
  setupAutoResizeTextarea
} from "./ui.js";

const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const usernameEl = document.getElementById("username");
const composerEl = document.getElementById("composer");
const messageInputEl = document.getElementById("messageInput");
const fileInputEl = document.getElementById("fileInput");
const attachBtnEl = document.getElementById("attachBtn");
const uploadStatusEl = document.getElementById("uploadStatus");
const typingIndicatorEl = document.getElementById("typingIndicator");
const typingTextEl = document.getElementById("typingText");
const onlineCountEl = document.getElementById("onlineCount");
const onlineMembersListEl = document.getElementById("onlineMembersList");
const chatTitleEl = document.querySelector(".chat-title");

const clientUserId = getClientUserId();
const replyBar = setupReplyBar();
setupAutoResizeTextarea(messageInputEl);

const cachedName = localStorage.getItem("chat_name");
if (cachedName) usernameEl.value = cachedName;
usernameEl.addEventListener("change", () => {
  localStorage.setItem("chat_name", usernameEl.value.trim());
});

const setStatus = (text, type = "") => {
  statusEl.textContent = text;
  statusEl.style.color = type === "error" ? "#ed4245" : type === "live" ? "#23a559" : "var(--text-muted)";
};

const setUploadStatus = (text, isError = false) => {
  uploadStatusEl.textContent = text;
  uploadStatusEl.style.color = isError ? "#ed4245" : "var(--text-muted)";
};

const messageManager = createMessageManager({
  messagesEl,
  usernameEl,
  clientUserId,
  replyBar,
  onUnreadChange: (counts) => updateUnreadBadges({ currentRoom: messageManager.currentRoom, unreadCounts: counts })
});

let presenceChannel = null;
const presenceUsers = {};
let typingTimeout = null;

const updatePresenceInfo = () => {
  const count = Object.keys(presenceUsers).length;
  if (onlineCountEl) onlineCountEl.textContent = count;
  if (!onlineMembersListEl) return;

  const memberHtml = Object.values(presenceUsers).map((user) => `
    <div class="member">
      <div class="member-avatar">
        <div class="avatar" style="background-color:${getAvatarColor(user.username)}"></div>
        <div class="status-dot"></div>
      </div>
      <div class="member-name">${escapeHtml(user.username)}</div>
    </div>
  `).join("");

  if (onlineMembersListEl) onlineMembersListEl.innerHTML = memberHtml;
  const mobileList = document.getElementById("onlineMembersListMobile");
  if (mobileList) mobileList.innerHTML = memberHtml;

  const mobileCount = document.getElementById("onlineCountMobile");
  if (mobileCount) mobileCount.textContent = count;
};

const updateTypingIndicator = () => {
  const typingUsers = Object.values(presenceUsers)
    .filter((u) => u.typing && u.username !== (usernameEl.value.trim() || "guest"))
    .map((u) => u.username);

  if (typingUsers.length === 0) {
    typingIndicatorEl.style.display = "none";
    return;
  }
  typingTextEl.textContent = typingUsers.length === 1
    ? `${typingUsers[0]} đang gõ...`
    : `${typingUsers.length} người đang gõ...`;
  typingIndicatorEl.style.display = "block";
};

const broadcastTyping = async (isTyping) => {
  if (!presenceChannel) return;
  await presenceChannel.track({
    username: usernameEl.value.trim() || "guest",
    room: messageManager.currentRoom,
    typing: isTyping,
    online_at: new Date().toISOString()
  });
};

const setupPresence = (room) => {
  if (presenceChannel) supabase.removeChannel(presenceChannel);

  presenceChannel = supabase.channel(`chat-presence:${room}`, {
    config: { broadcast: { ack: true }, presence: { key: clientUserId } }
  });

  const syncPresence = () => {
    presenceUsers.clear();
    Object.entries(presenceChannel.presenceState()).forEach(([key, states]) => {
      if (Array.isArray(states) && states[0]?.room === room) {
        presenceUsers[key] = states[0];
      }
    });
    updatePresenceInfo();
    updateTypingIndicator();
  };

  presenceChannel
    .on("presence", { event: "sync" }, syncPresence)
    .on("presence", { event: "join" }, syncPresence)
    .on("presence", { event: "leave" }, syncPresence)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          username: usernameEl.value.trim() || "guest",
          room,
          typing: false,
          online_at: new Date().toISOString()
        });
      }
    });
};

const switchRoom = async (room) => {
  await messageManager.switchRoom(room);
  messageManager.markRoomRead(room);
  if (chatTitleEl) chatTitleEl.innerHTML = `<span>#</span> ${room}`;
  messageInputEl.placeholder = `Gửi tin nhắn đến #${room}`;
  document.querySelectorAll(".channel[data-room]").forEach((el) => {
    el.classList.toggle("active", el.dataset.room === room);
  });
  setupPresence(room);
  updateUnreadBadges({ currentRoom: room, unreadCounts: messageManager.unreadCounts });
};

const uploadAndSendFile = async (file) => {
  if (!file) return;
  const username = usernameEl.value.trim() || "guest";
  localStorage.setItem("chat_name", username);

  const safeName = sanitizeFilename(file.name);
  const objectPath = `${messageManager.currentRoom}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  attachBtnEl.disabled = true;
  setUploadStatus(`Đang tải lên ${file.name}...`);

  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream"
  });

  attachBtnEl.disabled = false;

  if (uploadError) {
    setUploadStatus("");
    showError("Không thể tải file lên. Kiểm tra kết nối.", "Tải lên thất bại");
    return;
  }

  const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  const { encodeAttachmentMarker } = await import("./utils.js");
  const marker = encodeAttachmentMarker({
    name: file.name,
    mime: file.type || "application/octet-stream",
    url: publicData.publicUrl
  });

  const payload = messageManager.buildMessagePayload(marker, replyBar.getReply());
  const insertError = await messageManager.tryInsertMessage(payload);

  if (insertError) {
    showError("Gửi file thất bại.", "Lỗi gửi tin");
    return;
  }

  replyBar.setReply(null);
  showSuccess(`Đã gửi ${file.name}`);
  fileInputEl.value = "";
  messageInputEl.focus();
  setUploadStatus("");
};

attachBtnEl.addEventListener("click", () => fileInputEl.click());
fileInputEl.addEventListener("change", () => uploadAndSendFile(fileInputEl.files?.[0]));

const emojiAnchor = document.getElementById("emojiInputAnchor");
if (emojiAnchor) {
  const { toggle } = createEmojiPicker({
    anchorEl: emojiAnchor,
    onSelect: (emoji) => {
      messageInputEl.value += emoji;
      messageInputEl.focus();
    }
  });
  document.getElementById("emojiInputBtn")?.addEventListener("click", toggle);
}

messageInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerEl.requestSubmit();
  }
});

messageInputEl.addEventListener("input", () => {
  const hasText = messageInputEl.value.trim().length > 0;
  if (hasText) {
    broadcastTyping(true);
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => broadcastTyping(false), 1500);
  } else {
    broadcastTyping(false);
  }
});

composerEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInputEl.value.trim();
  if (!content) return;

  localStorage.setItem("chat_name", usernameEl.value.trim() || "guest");
  messageInputEl.value = "";
  messageInputEl.style.height = "auto";

  const reply = replyBar.getReply();
  const payload = messageManager.buildMessagePayload(content, reply);
  const error = await messageManager.tryInsertMessage(payload);

  if (error) {
    messageInputEl.value = content;
    if (!navigator.onLine) showNetworkError();
    else showError("Không gửi được tin nhắn. Thử lại.", "Gửi thất bại");
    return;
  }

  replyBar.setReply(null);
  messageInputEl.focus();
});

const realtimeChannel = supabase
  .channel("realtime-chat-room")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
    messageManager.handleRealtimeInsert(payload.new);
    updateUnreadBadges({ currentRoom: messageManager.currentRoom, unreadCounts: messageManager.unreadCounts });
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
    messageManager.handleRealtimeUpdate(payload.new);
  })
  .subscribe((status) => {
    if (status === "SUBSCRIBED") setStatus("Realtime: Connected", "live");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      setStatus("Realtime Error", "error");
      showNetworkError();
    }
  });

window.addEventListener("offline", () => showNetworkError());
window.addEventListener("beforeunload", async () => {
  await supabase.removeChannel(realtimeChannel);
  if (presenceChannel) await supabase.removeChannel(presenceChannel);
});

const drawer = initMobileDrawer({
  channelList: document.querySelector(".channel-list"),
  channelOverlay: document.getElementById("channelOverlay"),
  channelToggle: document.getElementById("channelToggle"),
  chatArea: document.querySelector(".chat-area")
});

initMobileMenu();
initServerIcons();
initChannels({ onSwitchRoom: switchRoom, onDrawerClose: () => drawer.close() });
renderOfflineMembers(document.getElementById("offlineMembersList"), OFFLINE_MEMBERS);
renderOfflineMembers(document.getElementById("offlineMembersListMobile"), OFFLINE_MEMBERS);

messageManager.clearMessages();
messageManager.loadInitialMessages().then(() => {
  messageManager.markRoomRead(messageManager.currentRoom);
  setupPresence(messageManager.currentRoom);
  updateUnreadBadges({ currentRoom: messageManager.currentRoom, unreadCounts: messageManager.unreadCounts });
});

document.getElementById("offlineCount").textContent = OFFLINE_MEMBERS.length;
document.getElementById("offlineCountMobile").textContent = OFFLINE_MEMBERS.length;
