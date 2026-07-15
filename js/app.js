import { STORAGE_BUCKET, OFFLINE_MEMBERS, FILE_CONFIG } from "./config.js";
import { 
  getClientUserId, 
  sanitizeFilename, 
  getAvatarColor, 
  escapeHtml, 
  formatFileSize,
  isValidFileSize,
  isValidFileType,
  encodeAttachmentMarker
} from "./utils.js";
import { supabase } from "./supabase-client.js";
import { createMessageManager } from "./messages.js";
import { showError, showSuccess, showNetworkError, showWarning } from "./toast.js";
import { setupContextMenu } from "./context-menu.js";
import {
  createEmojiPicker,
  initMobileDrawer,
  initMobileMenu,
  initServerIcons,
  initChannels,
  updateUnreadBadges,
  renderOfflineMembers,
  setupReplyBar,
  setupAutoResizeTextarea,
  setupCharacterCounter,
  showFilePreview,
  hideFilePreview,
  initRightSidebar,
  initProfileCard,
  initPopups
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
setupCharacterCounter(messageInputEl, FILE_CONFIG.MAX_MESSAGE_LENGTH);

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

  const memberHtml = Object.values(presenceUsers).map((user) => {
    let badgeHtml = "";
    const nameStr = user.username || "";
    if (nameStr.toLowerCase() === "admin") badgeHtml = `<span class="badge badge-admin">ADMIN</span>`;
    
    return `
    <div class="member">
      <div class="member-avatar">
        <div class="avatar" style="background-color:${getAvatarColor(user.username)}"></div>
        <div class="status-dot"></div>
      </div>
      <div class="member-name-wrapper">
        <div class="member-name">${escapeHtml(user.username)}</div>
        ${badgeHtml}
      </div>
    </div>
  `}).join("");

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
  if (!file) {
    console.warn("⚠️ No file selected");
    return;
  }

  try {
    console.log("📎 Processing file:", file.name, "Size:", file.size);

    // Validate file size
    const sizeCheck = isValidFileSize(file.size, FILE_CONFIG.MAX_FILE_SIZE);
    if (!sizeCheck.valid) {
      console.warn("❌ Size check failed:", sizeCheck.reason);
      showError(sizeCheck.reason, "File quá lớn");
      fileInputEl.value = "";
      hideFilePreview();
      return;
    }

    // Check all allowed types
    const allowedMimes = [
      ...FILE_CONFIG.ALLOWED_TYPES.image,
      ...FILE_CONFIG.ALLOWED_TYPES.document,
      ...FILE_CONFIG.ALLOWED_TYPES.archive
    ];

    const typeCheck = isValidFileType(file, FILE_CONFIG.ALLOWED_EXTENSIONS, allowedMimes);
    if (!typeCheck.valid) {
      console.warn("❌ Type check failed:", typeCheck.reason);
      showError(typeCheck.reason, "Định dạng file không hợp lệ");
      fileInputEl.value = "";
      hideFilePreview();
      return;
    }

    console.log("✅ File validation passed");

    const username = usernameEl.value.trim() || "guest";
    localStorage.setItem("chat_name", username);

    const safeName = sanitizeFilename(file.name);
    const objectPath = `${messageManager.currentRoom}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    attachBtnEl.disabled = true;
    messageInputEl.disabled = true;
    setUploadStatus(`⏳ Đang tải lên ${file.name}...`);

    const progressContainer = document.getElementById("fileProgressContainer");
    const progressBar = document.getElementById("fileProgressBar");
    const closeBtn = document.querySelector(".preview-close");
    if (progressContainer && progressBar) {
      progressContainer.style.display = "block";
      progressBar.style.width = "20%";
      if (closeBtn) closeBtn.style.display = "none";
    }

    let retries = 3;
    let uploadSuccess = false;

    // Simulate progress
    const progressInterval = setInterval(() => {
      if (progressBar && parseInt(progressBar.style.width) < 85) {
        progressBar.style.width = (parseInt(progressBar.style.width) + 15) + "%";
      }
    }, 500);

    while (retries > 0) {
      try {
        console.log(`📤 Upload attempt ${4 - retries}/3...`);
        const result = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });

        if (!result.error) {
          uploadSuccess = true;
          if (progressBar) progressBar.style.width = "100%";
          console.log("✅ Upload successful");
          break;
        }

        console.warn("⚠️ Upload error:", result.error?.message);
        retries--;

        if (retries > 0) {
          setUploadStatus(`⏳ Thử lại (${4 - retries}/3)...`);
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        console.error("❌ Upload exception:", err);
        retries--;

        if (retries > 0) {
          setUploadStatus(`⏳ Thử lại (${4 - retries}/3)...`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    clearInterval(progressInterval);
    attachBtnEl.disabled = false;
    messageInputEl.disabled = false;

    if (!uploadSuccess) {
      console.error("❌ Upload failed after 3 retries");
      setUploadStatus("");
      showError("Không thể tải file lên. Kiểm tra kết nối và thử lại.", "Tải lên thất bại");
      fileInputEl.value = "";
      hideFilePreview();
      return;
    }

    console.log("📝 Creating message with file attachment...");

    const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
    if (!publicData?.publicUrl) {
      throw new Error("Could not get public URL for uploaded file");
    }

    const marker = encodeAttachmentMarker({
      name: file.name,
      mime: file.type || "application/octet-stream",
      url: publicData.publicUrl
    });

    const content = messageInputEl.value.trim();
    const finalContent = content ? `${content}\n${marker}` : marker;

    const payload = messageManager.buildMessagePayload(finalContent, replyBar.getReply());
    const insertError = await messageManager.tryInsertMessage(payload);

    if (insertError) {
      console.error("❌ Message insert failed:", insertError);
      showError("Gửi file thất bại. Thử lại sau.", "Lỗi gửi tin");
      return;
    }

    console.log("✅ File message sent successfully!");

    // Cleanup on success
    replyBar.setReply(null);
    showSuccess(`✅ Đã gửi ${file.name}`);
    fileInputEl.value = "";
    messageInputEl.value = "";
    messageInputEl.style.height = "auto";
    messageInputEl.focus();
    setUploadStatus("");
    hideFilePreview();

  } catch (err) {
    console.error("❌ Unexpected error during file upload:", err);
    showError("Lỗi xử lý file. Thử lại.", "Lỗi hệ thống");
    attachBtnEl.disabled = false;
    messageInputEl.disabled = false;
    setUploadStatus("");
    fileInputEl.value = "";
    hideFilePreview();
  }
};

attachBtnEl.addEventListener("click", () => fileInputEl.click());
fileInputEl.addEventListener("change", () => {
  const file = fileInputEl.files?.[0];
  if (file) {
    showFilePreview(file);
  }
});

// Drag and drop upload logic
let dragCounter = 0;
const dropOverlay = document.getElementById("dropOverlay");

window.addEventListener("dragover", (e) => {
  e.preventDefault();
});

window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (e.dataTransfer.types.includes("Files")) {
    dragCounter++;
    dropOverlay.classList.add("active");
  }
});

window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove("active");
  }
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove("active");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInputEl.files = dataTransfer.files;
    fileInputEl.dispatchEvent(new Event("change"));
  }
});

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

  try {
    // Check if file is selected
    const file = fileInputEl.files?.[0];
    if (file) {
      console.log("📎 File selected:", file.name, file.size);
      await uploadAndSendFile(file);
      return;
    }

    const content = messageInputEl.value.trim();

    // Validate message
    if (!content) {
      showWarning("Nhập tin nhắn trước khi gửi", "Tin nhắn trống");
      return;
    }

    if (content.length > FILE_CONFIG.MAX_MESSAGE_LENGTH) {
      showError(
        `Tin nhắn quá dài. Tối đa ${FILE_CONFIG.MAX_MESSAGE_LENGTH} ký tự, hiện tại ${content.length}.`,
        "Tin nhắn quá dài"
      );
      return;
    }

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
  } catch (error) {
    console.error("❌ Form submit error:", error);
    showError("Lỗi xử lý form. Thử lại sau.", "Lỗi hệ thống");
  }
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
initRightSidebar();
initProfileCard();
initPopups();
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

// Setup context menu actions
setupContextMenu((action, messageId, msgEl) => {
  const msgCache = messageManager.getMessageCache()[messageId];
  const isOwn = msgCache && msgCache.username === (usernameEl.value.trim() || "guest");

  switch (action) {
    case "reaction":
      msgEl.querySelector(".msg-action-btn:nth-child(2)")?.click();
      break;
    case "reply":
      msgEl.querySelector(".msg-action-btn:nth-child(1)")?.click();
      break;
    case "copy":
      if (msgCache?.content) {
        navigator.clipboard.writeText(msgCache.content.replace(/\[\[.*?\]\]/g, "").trim());
        showSuccess("Đã copy tin nhắn");
      }
      break;
    case "pin":
      showSuccess("Đã ghim tin nhắn (Demo)");
      break;
    case "edit":
      if (isOwn) msgEl.querySelector(".msg-action-btn:nth-child(3)")?.click();
      else showError("Bạn không thể sửa tin nhắn này");
      break;
    case "delete":
      if (isOwn) msgEl.querySelector(".delete")?.click();
      else showError("Bạn không thể xóa tin nhắn này");
      break;
    case "copylink":
      showSuccess("Đã copy link tin nhắn (Demo)");
      break;
  }
});

// Thread Sidebar logic
window.openThread = (messageId, sender, content) => {
  const threadPanel = document.getElementById("threadPanel");
  const memberListPanel = document.getElementById("memberListPanel");
  const channelInfoPanel = document.getElementById("channelInfoPanel");
  const rightSidebar = document.getElementById("rightSidebar");
  
  if (memberListPanel) memberListPanel.classList.remove("active");
  if (channelInfoPanel) channelInfoPanel.classList.remove("active");
  
  if (threadPanel && rightSidebar) {
    rightSidebar.style.display = "flex";
    threadPanel.classList.add("active");
    
    const threadContent = threadPanel.querySelector(".thread-content");
    if (threadContent) {
      threadContent.innerHTML = `
        <div class="message" style="background:var(--input-bg); padding:12px; border-radius:8px; margin-bottom:16px;">
          <div class="msg-header">
            <span class="msg-author">${escapeHtml(sender)}</span>
          </div>
          <div class="msg-content">${escapeHtml(content)}</div>
        </div>
        <div style="text-align:center; color:var(--text-muted); font-size:12px; margin:20px 0;">
          Đây là bắt đầu của Thread.
        </div>
      `;
    }
  }
};
