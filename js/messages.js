import {
  escapeHtml,
  formatSmartTime,
  formatDateDivider,
  getAvatarColor,
  encodeAttachmentMarker,
  encodeReplyMarker,
  stripMarkers,
  getUnreadStorage,
  setUnreadStorage,
  getLastReadStorage,
  setLastReadStorage
} from "./utils.js";
import { processMessageContent } from "./markdown.js";
import {
  schemaFlags,
  tryInsertMessage,
  tryUpdateMessage,
  loadMessages,
  loadReactions,
  toggleReaction,
  deleteMessageContent
} from "./supabase-client.js";
import { createEmojiPicker, scrollToMessage } from "./ui.js";
import { showError, showSuccess } from "./toast.js";

export function createMessageManager({
  messagesEl,
  usernameEl,
  clientUserId,
  replyBar,
  onUnreadChange
}) {
  const renderedIds = new Set();
  const messageReactions = {};
  const messageCache = {};
  let currentRoom = "general";
  let lastDateKey = null;
  let unreadCounts = getUnreadStorage();
  let lastRead = getLastReadStorage();

  const getUsername = () => usernameEl.value.trim() || "guest";
  const isOwnMessage = (msg) => (msg.username || "") === getUsername();

  const ensureEmptyState = () => {
    if (!messagesEl.querySelector(".message[data-message-id]")) {
      const div = document.createElement("div");
      div.className = "empty-state";
      div.style.cssText = "padding:24px 16px;text-align:center;color:var(--text-muted)";
      div.textContent = `Chào mừng đến #${currentRoom} — Chưa có tin nhắn.`;
      messagesEl.appendChild(div);
    }
  };

  const clearMessages = () => {
    renderedIds.clear();
    lastDateKey = null;
    messagesEl.innerHTML = "";
    ensureEmptyState();
  };

  const maybeInsertDateDivider = (createdAt) => {
    const key = new Date(createdAt).toDateString();
    if (key === lastDateKey) return;
    lastDateKey = key;
    const div = document.createElement("div");
    div.className = "date-divider";
    div.innerHTML = `<span>${formatDateDivider(createdAt)}</span>`;
    messagesEl.appendChild(div);
  };

  const renderReactions = (contentWrapper, messageId) => {
    let zone = contentWrapper.querySelector(".reactions-zone");
    if (!zone) {
      zone = document.createElement("div");
      zone.className = "reactions-zone";
      contentWrapper.appendChild(zone);
    }
    zone.innerHTML = "";

    const reactions = messageReactions[messageId] || [];
    const grouped = {};
    reactions.forEach((r) => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });

    Object.entries(grouped).forEach(([emoji, count]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reaction-btn";
      btn.textContent = `${emoji} ${count}`;
      btn.onclick = (e) => { e.preventDefault(); handleReaction(messageId, emoji); };
      zone.appendChild(btn);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "emoji-picker-btn";
    addBtn.textContent = "😀";
    addBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const anchor = document.createElement("span");
      anchor.style.position = "relative";
      addBtn.replaceWith(anchor);
      const { picker, toggle } = createEmojiPicker({
        anchorEl: anchor,
        onSelect: (emoji) => {
          handleReaction(messageId, emoji);
          anchor.replaceWith(addBtn);
          renderReactions(contentWrapper, messageId);
        }
      });
      toggle(e);
    };
    zone.appendChild(addBtn);
  };

  const handleReaction = async (messageId, emoji) => {
    await toggleReaction(messageId, getUsername(), emoji);
    messageReactions[messageId] = await loadReactions(messageId);
    const el = document.querySelector(`[data-message-id="${messageId}"] .msg-content-wrapper`);
    if (el) renderReactions(el, messageId);
  };

  const updateMessageDom = (message) => {
    const msgEl = document.querySelector(`[data-message-id="${message.id}"]`);
    if (!msgEl) return;

    messageCache[message.id] = message;
    const isDeleted = message.content === "[deleted]";

    if (isDeleted) {
      msgEl.classList.add("deleted");
      const contentEl = msgEl.querySelector(".msg-content");
      if (contentEl) contentEl.textContent = "Tin nhắn này đã bị xóa.";
      return;
    }

    const contentEl = msgEl.querySelector(".msg-content");
    if (contentEl) {
      processMessageContent(message.content || "", contentEl, scrollToMessage);
    }

    const editedEl = msgEl.querySelector(".msg-edited");
    const wasEdited = message.edited_at || (message.content && message.content.includes("[[edited]]"));
    if (wasEdited) {
      if (!editedEl) {
        const header = msgEl.querySelector(".msg-header");
        const span = document.createElement("span");
        span.className = "msg-edited";
        span.textContent = "(đã chỉnh sửa)";
        header?.appendChild(span);
      }
    }
  };

  const startEdit = (message) => {
    const raw = stripMarkers(message.content || "");
    const newContent = prompt("Chỉnh sửa tin nhắn:", raw);
    if (newContent === null || newContent.trim() === raw) return;
    if (!newContent.trim()) {
      showError("Tin nhắn không được để trống.");
      return;
    }
    saveEdit(message.id, newContent.trim(), message);
  };

  const saveEdit = async (messageId, newContent, originalMessage) => {
    const payload = { content: newContent };
    if (schemaFlags.hasEditedAtColumn) {
      payload.edited_at = new Date().toISOString();
    }

    const error = await tryUpdateMessage(messageId, payload);
    if (error) {
      showError("Không thể chỉnh sửa tin nhắn. Thử lại sau.");
      return;
    }
    showSuccess("Đã cập nhật tin nhắn.");
    const updated = { ...originalMessage, content: newContent, edited_at: payload.edited_at };
    updateMessageDom(updated);
  };

  const handleDelete = async (messageId, messageUsername) => {
    if (messageUsername !== getUsername()) {
      showError("Chỉ có thể xóa tin nhắn của chính bạn.");
      return;
    }
    const { error } = await deleteMessageContent(messageId);
    if (error) showError("Xóa tin nhắn thất bại.");
  };

  const appendMessage = (message, { skipUnread = false } = {}) => {
    if (schemaFlags.hasRoomColumn && message.room_id !== currentRoom) {
      if (!skipUnread) markUnread(message.room_id);
      return;
    }
    if (!message || renderedIds.has(message.id)) return;

    messagesEl.querySelector(".empty-state")?.remove();
    renderedIds.add(message.id);
    messageCache[message.id] = message;

    const isDeleted = message.content === "[deleted]";
    const sender = message.username || message.user_id || "unknown";

    if (message.created_at) maybeInsertDateDivider(message.created_at);

    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    if (isDeleted) msgDiv.classList.add("deleted");
    msgDiv.dataset.messageId = message.id;

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "msg-avatar";
    avatarDiv.style.backgroundColor = getAvatarColor(sender);

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "msg-content-wrapper";

    const header = document.createElement("div");
    header.className = "msg-header";

    const authorSpan = document.createElement("span");
    authorSpan.className = "msg-author";
    authorSpan.textContent = sender;

    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = formatSmartTime(message.created_at);

    header.appendChild(authorSpan);
    header.appendChild(timeSpan);

    if (message.edited_at) {
      const editedSpan = document.createElement("span");
      editedSpan.className = "msg-edited";
      editedSpan.textContent = "(đã chỉnh sửa)";
      header.appendChild(editedSpan);
    }

    const contentEl = document.createElement("div");
    contentEl.className = "msg-content";

    if (isDeleted) {
      contentEl.textContent = "Tin nhắn này đã bị xóa.";
    } else {
      processMessageContent(message.content || message.message || "", contentEl, scrollToMessage);
    }

    contentWrapper.appendChild(header);
    contentWrapper.appendChild(contentEl);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "msg-actions";

    const replyBtn = document.createElement("div");
    replyBtn.className = "msg-action-btn";
    replyBtn.title = "Trả lời";
    replyBtn.textContent = "↩️";
    replyBtn.onclick = () => {
      replyBar.setReply({
        id: message.id,
        username: sender,
        preview: stripMarkers(message.content || "").slice(0, 80)
      });
    };

    const reactBtn = document.createElement("div");
    reactBtn.className = "msg-action-btn";
    reactBtn.title = "Thêm reaction";
    reactBtn.textContent = "😀";
    reactBtn.onclick = (e) => {
      const anchor = document.createElement("span");
      reactBtn.replaceWith(anchor);
      const { toggle } = createEmojiPicker({
        anchorEl: anchor,
        onSelect: (emoji) => {
          handleReaction(message.id, emoji);
          anchor.replaceWith(reactBtn);
        }
      });
      toggle(e);
    };

    actionsDiv.appendChild(replyBtn);
    actionsDiv.appendChild(reactBtn);

    if (isOwnMessage(message) && !isDeleted) {
      const editBtn = document.createElement("div");
      editBtn.className = "msg-action-btn";
      editBtn.title = "Chỉnh sửa";
      editBtn.textContent = "✏️";
      editBtn.onclick = () => startEdit(message);
      actionsDiv.appendChild(editBtn);
    }

    if (isOwnMessage(message)) {
      const deleteBtn = document.createElement("div");
      deleteBtn.className = "msg-action-btn delete";
      deleteBtn.title = "Xóa";
      deleteBtn.textContent = "🗑️";
      deleteBtn.onclick = () => handleDelete(message.id, message.username);
      actionsDiv.appendChild(deleteBtn);
    }

    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentWrapper);
    msgDiv.appendChild(actionsDiv);

    loadReactions(message.id).then((data) => {
      messageReactions[message.id] = data;
      renderReactions(contentWrapper, message.id);
    });

    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const markUnread = (room) => {
    if (!room || room === currentRoom) return;
    unreadCounts[room] = (unreadCounts[room] || 0) + 1;
    setUnreadStorage(unreadCounts);
    onUnreadChange?.(unreadCounts);
  };

  const markRoomRead = (room) => {
    delete unreadCounts[room];
    lastRead[room] = Date.now();
    setUnreadStorage(unreadCounts);
    setLastReadStorage(lastRead);
    onUnreadChange?.(unreadCounts);
  };

  const buildMessagePayload = (content, reply) => {
    let finalContent = content;
    const payload = {
      content: finalContent,
      username: getUsername(),
      room_id: currentRoom,
      user_id: clientUserId
    };

    if (reply) {
      const marker = encodeReplyMarker({
        id: reply.id,
        username: reply.username,
        preview: reply.preview
      });
      finalContent = `${marker}\n${content}`;
      payload.content = finalContent;
      if (schemaFlags.hasReplyToColumn) payload.reply_to_id = reply.id;
    }

    return payload;
  };

  const loadInitialMessages = async () => {
    const { data, error } = await loadMessages(currentRoom);
    if (error) {
      showError("Không thể tải tin nhắn.", "Lỗi tải dữ liệu");
      return;
    }
    data.forEach((m) => appendMessage(m, { skipUnread: true }));
  };

  const switchRoom = async (room) => {
    if (!room || room === currentRoom) return;
    currentRoom = room;
    markRoomRead(room);
    clearMessages();
    await loadInitialMessages();
    return currentRoom;
  };

  const handleRealtimeInsert = (message) => appendMessage(message);
  const handleRealtimeUpdate = (message) => updateMessageDom(message);

  return {
    get currentRoom() { return currentRoom; },
    set currentRoom(v) { currentRoom = v; },
    unreadCounts,
    clearMessages,
    appendMessage,
    loadInitialMessages,
    switchRoom,
    buildMessagePayload,
    tryInsertMessage,
    markRoomRead,
    markUnread,
    handleRealtimeInsert,
    handleRealtimeUpdate,
    getMessageCache: () => messageCache
  };
}
