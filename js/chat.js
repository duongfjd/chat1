/**
 * ==========================================================================
 * QUICKCHAT - CHAT.JS
 * Trọng tâm luồng trò chuyện: Render tin nhắn theo cụm, Cuộn thông minh,
 * Thao tác tin nhắn (Reply, Forward, Edit, Delete, Pin, Star, React),
 * Ghi âm MediaRecorder, Thăm dò bình chọn Poll, Bộ gõ Emoji và Lệnh "/".
 * ==========================================================================
 */

const Chat = (() => {
  let activeChat = null;
  let activeTopicId = null;
  let activeReplyTo = null;
  let activeEditingMessage = null;
  let isRecordingVoice = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimerInterval = null;
  let unreadNewCount = 0;

  return {
    getActiveChat() {
      return activeChat;
    },

    getActiveTopicId() {
      return activeTopicId;
    },

    /**
     * Mở và nạp một cuộc trò chuyện
     */
    async openConversation(chatId, topicId = null, highlightMsgId = null) {
      activeChat = await Storage.get('chats', chatId);
      if (!activeChat) return;

      activeTopicId = topicId;
      activeReplyTo = null;
      activeEditingMessage = null;
      unreadNewCount = 0;

      // Reset số tin chưa đọc của chat này về 0
      if (activeChat.unread > 0) {
        activeChat.unread = 0;
        await Storage.put('chats', activeChat);
        Transport.emit('CHAT_UPDATED', { chat: activeChat });
      }

      // Khôi phục bản nháp nếu có
      const draftText = Storage.getDraft(chatId);
      const textarea = document.getElementById('composer-input');
      if (textarea) {
        textarea.value = draftText;
        this.autoResizeTextarea(textarea);
      }

      // Ẩn thanh reply/edit đang dang dở
      this.cancelReplyOrEdit();

      // Cập nhật Header cuộc trò chuyện
      this.renderChatHeader();

      // Dựng danh sách tin nhắn
      await this.renderMessages(highlightMsgId);

      // Lắng nghe tin nhắn thời gian thực từ Firestore nếu đã đăng nhập
      if (window.FirebaseBridge && typeof window.FirebaseBridge.listenCloudMessages === 'function') {
        window.FirebaseBridge.listenCloudMessages(chatId, async (cloudMsgs) => {
          if (cloudMsgs && cloudMsgs.length > 0) {
            for (const cm of cloudMsgs) {
              await Storage.put('messages', cm);
            }
            if (activeChat && activeChat.id === chatId) {
              await this.renderMessages();
            }
          }
        });
      }

      // Cập nhật Panel thông tin bên phải nếu đang mở
      this.renderRightPanel();

      // Trên Mobile: Chuyển sang màn hình chat
      const chatView = document.getElementById('view-chat');
      if (chatView) {
        chatView.classList.add('active');
      }
    },

    /**
     * Dựng Header của khung chat chính
     */
    renderChatHeader() {
      const headerContainer = document.getElementById('chat-header-content');
      if (!headerContainer || !activeChat) return;

      const isGroup = activeChat.type === 'group';
      const memberCount = activeChat.members ? activeChat.members.length : 2;

      let subInfo = isGroup ? `${memberCount} thành viên` : 'Đang hoạt động';
      if (activeTopicId && activeChat.topics) {
        const topic = activeChat.topics.find(t => t.id === activeTopicId);
        if (topic) subInfo += ` • #${topic.name}`;
      }

      headerContainer.innerHTML = `
        <div class="chat-header-info" id="chat-header-info-click">
          ${UI.renderAvatar(activeChat, 'md')}
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 700; font-size: var(--font-size-base); color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${Utils.escapeHTML(activeChat.name)}
              </span>
              ${activeChat.pinned ? '<span title="Đã ghim">📌</span>' : ''}
            </div>
            <div style="font-size: var(--font-size-xs); color: var(--text-muted);">${subInfo}</div>
          </div>
        </div>

        <div class="chat-header-actions">
          <button class="composer-action-btn" id="btn-chat-search" title="Tìm trong cuộc hội thoại">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          <button class="composer-action-btn" id="btn-chat-call" title="Cuộc gọi thoại mô phỏng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
          <button class="composer-action-btn" id="btn-toggle-info-panel" title="Thông tin chi tiết">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>
        </div>
      `;

      // Bắt sự kiện
      headerContainer.querySelector('#chat-header-info-click').addEventListener('click', () => {
        this.toggleRightPanel();
      });
      headerContainer.querySelector('#btn-toggle-info-panel').addEventListener('click', () => {
        this.toggleRightPanel();
      });
      headerContainer.querySelector('#btn-chat-call').addEventListener('click', () => {
        UI.toast('Đang mô phỏng kết nối cuộc gọi âm thanh độ phân giải cao...', 'info');
      });
      headerContainer.querySelector('#btn-chat-search').addEventListener('click', () => {
        Search.openGlobalSearchModal((cId, mId) => this.openConversation(cId, null, mId));
      });
    },

    /**
     * Dựng luồng tin nhắn chính (Message List)
     */
    async renderMessages(highlightMsgId = null) {
      const container = document.getElementById('chat-messages-scroll');
      if (!container || !activeChat) return;

      const messages = await Storage.getMessagesByChat(activeChat.id, activeTopicId);
      const allUsers = await Storage.getAll('users');
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const currentUserId = Storage.getCurrentUserId();

      // Cập nhật thanh tin ghim
      this.renderPinnedBar(messages);

      if (messages.length === 0) {
        container.innerHTML = `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-muted); padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 12px;">💬</div>
            <h3 style="font-size: var(--font-size-lg); font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Bắt đầu trò chuyện</h3>
            <p style="font-size: var(--font-size-sm); max-width: 320px;">Gửi tin nhắn, chia sẻ hình ảnh, tài liệu hoặc tạo bình chọn ngay bên dưới.</p>
          </div>
        `;
        return;
      }

      let html = '';
      let lastDateStr = '';
      let lastSenderId = '';
      let lastTime = 0;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const dateStr = Utils.formatDateDivider(msg.createdAt);

        // Hiển thị divider ngày nếu sang ngày mới
        if (dateStr !== lastDateStr) {
          html += `
            <div class="date-divider">
              <span class="date-divider-pill">${dateStr}</span>
            </div>
          `;
          lastDateStr = dateStr;
          lastSenderId = '';
        }

        const isMe = msg.senderId === currentUserId;
        const sender = userMap.get(msg.senderId) || { name: 'Người dùng' };
        const isConsecutive = (msg.senderId === lastSenderId) && ((msg.createdAt - lastTime) < 180000);
        lastSenderId = msg.senderId;
        lastTime = msg.createdAt;

        html += this.buildMessageRowHTML(msg, isMe, sender, isConsecutive);
      }

      // Thêm container chỉ báo đang gõ
      html += `<div id="typing-container"></div>`;

      container.innerHTML = html;

      // Gắn sự kiện tương tác tin nhắn (click reply, reaction, long-press)
      this.bindMessageRowEvents(container);

      // Cuộn tới tin nhắn
      if (highlightMsgId) {
        setTimeout(() => {
          const target = container.querySelector(`[data-message-id="${highlightMsgId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('highlight');
          }
        }, 100);
      } else {
        this.scrollToBottom();
      }
    },

    /**
     * Dựng HTML cho từng tin nhắn đơn
     */
    buildMessageRowHTML(msg, isMe, sender, isConsecutive) {
      const isGroup = activeChat.type === 'group';
      const showSenderName = isGroup && !isMe && !isConsecutive;

      // Xử lý nội dung Reply
      let replyHtml = '';
      if (msg.replyTo) {
        replyHtml = `
          <div class="message-reply-preview" data-reply-id="${msg.replyTo.id}">
            <span class="reply-preview-sender">${Utils.escapeHTML(msg.replyTo.senderName)}</span>
            <span class="reply-preview-text">${Utils.escapeHTML(msg.replyTo.text || 'Tệp đính kèm')}</span>
          </div>
        `;
      }

      // Xử lý tệp đính kèm
      let attachmentsHtml = '';
      if (msg.attachments && msg.attachments.length > 0) {
        const count = msg.attachments.length;
        attachmentsHtml = `
          <div class="media-grid count-${Math.min(count, 4)}">
            ${msg.attachments.map(att => Files.renderAttachmentElement(att)).join('')}
          </div>
        `;
      }

      // Xử lý bình chọn Poll
      let pollHtml = '';
      if (msg.type === 'poll' && msg.poll) {
        pollHtml = this.buildPollHTML(msg);
      }

      // Xử lý Reactions
      let reactionsHtml = '';
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        reactionsHtml = `
          <div class="reactions-bar">
            ${Object.entries(msg.reactions).map(([emoji, users]) => `
              <button class="reaction-pill ${users.includes(Storage.getCurrentUserId()) ? 'user-reacted' : ''}" data-msg-id="${msg.id}" data-emoji="${emoji}">
                <span>${emoji}</span>
                <span>${users.length}</span>
              </button>
            `).join('')}
          </div>
        `;
      }

      return `
        <div class="message-row ${isMe ? 'me' : 'other'}" data-message-id="${msg.id}" style="${isConsecutive ? 'margin-bottom: 3px;' : ''}">
          ${(!isMe && !isConsecutive) ? UI.renderAvatar(sender, 'sm') : (!isMe ? '<div style="width: 34px;"></div>' : '')}
          
          <div class="message-bubble-wrapper">
            ${showSenderName ? `<span class="message-sender-name">${Utils.escapeHTML(sender.name)}</span>` : ''}

            <div class="message-bubble">
              ${replyHtml}
              ${attachmentsHtml}
              ${pollHtml}

              ${msg.text ? `
                <div class="message-text selectable">${Utils.parseSafeMarkdown(msg.text)}</div>
              ` : ''}

              <div class="message-meta">
                ${msg.edited ? '<span style="font-size: 10px; opacity: 0.8;">(đã sửa)</span>' : ''}
                <span>${Utils.formatTime(msg.createdAt)}</span>
                ${isMe ? UI.renderTick(msg.status) : ''}
              </div>
            </div>

            ${reactionsHtml}
          </div>
        </div>
      `;
    },

    /**
     * Dựng thẻ bình chọn Poll
     */
    buildPollHTML(msg) {
      const poll = msg.poll;
      const currentUserId = Storage.getCurrentUserId();
      let totalVotes = 0;
      poll.options.forEach(opt => totalVotes += (opt.votes ? opt.votes.length : 0));

      return `
        <div class="poll-card" data-msg-id="${msg.id}">
          <div class="poll-question">${Utils.escapeHTML(poll.question)}</div>
          ${poll.options.map(opt => {
            const votesCount = opt.votes ? opt.votes.length : 0;
            const percent = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
            const hasVoted = opt.votes && opt.votes.includes(currentUserId);

            return `
              <div class="poll-option ${hasVoted ? 'voted' : ''}" data-opt-id="${opt.id}">
                <div class="poll-progress-bar" style="width: ${percent}%;"></div>
                <div class="poll-option-content">
                  <span>${hasVoted ? '☑️' : '🔘'}</span>
                  <span>${Utils.escapeHTML(opt.text)}</span>
                </div>
                <span class="poll-option-percent">${percent}% (${votesCount})</span>
              </div>
            `;
          }).join('')}
          <div class="poll-footer">Tổng số: ${totalVotes} lượt bình chọn</div>
        </div>
      `;
    },

    /**
     * Dựng thanh Pinned Messages ở đầu khung chat
     */
    renderPinnedBar(messages) {
      let bar = document.getElementById('chat-pinned-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'chat-pinned-bar';
        bar.className = 'pinned-messages-bar';
        const msgContainer = document.getElementById('chat-messages-container-wrapper');
        if (msgContainer) msgContainer.prepend(bar);
      }

      const pinnedMessages = messages.filter(m => m.pinned);
      if (pinnedMessages.length === 0) {
        bar.style.display = 'none';
        return;
      }

      const latestPin = pinnedMessages[pinnedMessages.length - 1];
      bar.style.display = 'flex';
      bar.innerHTML = `
        <span style="font-size: 16px;">📌</span>
        <div style="flex: 1; min-width: 0;">
          <strong style="color: var(--color-primary);">Tin nhắn đã ghim (${pinnedMessages.length}):</strong>
          <span style="color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 80%;">
            ${Utils.escapeHTML(latestPin.text || 'Tệp đính kèm')}
          </span>
        </div>
      `;

      bar.onclick = () => {
        const target = document.querySelector(`[data-message-id="${latestPin.id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('highlight');
        }
      };
    },

    /**
     * Gắn sự kiện cho các hàng tin nhắn: Click reply quote, Vote poll, Thả reaction, Long-press
     */
    bindMessageRowEvents(container) {
      // 1. Nhấn trích dẫn cuộn tới tin gốc
      container.querySelectorAll('.message-reply-preview').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetId = el.dataset.replyId;
          const target = container.querySelector(`[data-message-id="${targetId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('highlight');
          }
        });
      });

      // 2. Bình chọn Poll
      container.querySelectorAll('.poll-option').forEach(opt => {
        opt.addEventListener('click', async (e) => {
          e.stopPropagation();
          const pollCard = opt.closest('.poll-card');
          const msgId = pollCard.dataset.msgId;
          const optId = opt.dataset.optId;
          await this.handleVotePoll(msgId, optId);
        });
      });

      // 3. Nhấp đúp vào bubble để thả tim ❤️
      container.querySelectorAll('.message-bubble').forEach(bubble => {
        bubble.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          const row = bubble.closest('.message-row');
          const msgId = row.dataset.messageId;
          await this.toggleReaction(msgId, '❤️');
          Utils.playSound('reaction');
        });

        // Chuột phải mở menu ngữ cảnh
        bubble.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const row = bubble.closest('.message-row');
          const msgId = row.dataset.messageId;
          this.openMessageContextMenu(msgId);
        });
      });

      // 4. Nhấp vào reaction pill
      container.querySelectorAll('.reaction-pill').forEach(pill => {
        pill.addEventListener('click', async (e) => {
          e.stopPropagation();
          const msgId = pill.dataset.msgId;
          const emoji = pill.dataset.emoji;
          await this.toggleReaction(msgId, emoji);
        });
      });
    },

    /**
     * Mở menu hành động cho tin nhắn (dạng Bottom Sheet trên mobile, modal/dropdown)
     */
    async openMessageContextMenu(msgId) {
      const msg = await Storage.get('messages', msgId);
      if (!msg) return;

      const isMe = msg.senderId === Storage.getCurrentUserId();

      const items = [
        {
          label: 'Trả lời (Reply)',
          icon: '↩️',
          action: () => this.setReplyTarget(msg)
        },
        {
          label: 'Sao chép văn bản',
          icon: '📋',
          action: async () => {
            await Utils.copyToClipboard(msg.text || '');
            UI.toast('Đã sao chép nội dung tin nhắn!', 'success');
          }
        },
        {
          label: 'Thả cảm xúc',
          icon: '😊',
          action: () => this.openReactionPicker(msg.id)
        },
        {
          label: msg.pinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn',
          icon: '📌',
          action: async () => {
            msg.pinned = !msg.pinned;
            await Storage.put('messages', msg);
            await this.renderMessages();
            UI.toast(msg.pinned ? 'Đã ghim tin nhắn.' : 'Đã bỏ ghim.', 'info');
          }
        },
        {
          label: msg.starred ? 'Bỏ lưu tin nhắn' : 'Lưu tin nhắn ⭐',
          icon: '⭐',
          action: async () => {
            msg.starred = !msg.starred;
            await Storage.put('messages', msg);
            UI.toast(msg.starred ? 'Đã lưu vào mục Đã lưu!' : 'Đã bỏ lưu.', 'info');
          }
        }
      ];

      if (isMe) {
        items.push({
          label: 'Chỉnh sửa tin nhắn',
          icon: '✏️',
          action: () => this.setEditTarget(msg)
        });
        items.push({
          label: 'Thu hồi / Xóa tin nhắn',
          icon: '🗑️',
          isDanger: true,
          action: async () => {
            const ok = await UI.confirm({
              title: 'Xóa tin nhắn',
              message: 'Bạn có chắc chắn muốn xóa tin nhắn này không?',
              confirmText: 'Xóa ngay',
              isDanger: true
            });
            if (ok) {
              await Storage.delete('messages', msg.id);
              if (window.FirebaseBridge && typeof window.FirebaseBridge.deleteCloudMessage === 'function') {
                window.FirebaseBridge.deleteCloudMessage(msg.id);
              }
              await this.renderMessages();
              UI.toast('Đã xóa tin nhắn.', 'info');
            }
          }
        });
      }

      UI.bottomSheet({
        title: 'Hành động tin nhắn',
        items
      });
    },

    /**
     * Bình chọn trong Poll
     */
    async handleVotePoll(msgId, optId) {
      const msg = await Storage.get('messages', msgId);
      if (!msg || !msg.poll) return;

      const currentUserId = Storage.getCurrentUserId();

      msg.poll.options.forEach(opt => {
        if (!opt.votes) opt.votes = [];
        if (opt.id === optId) {
          if (opt.votes.includes(currentUserId)) {
            // Huỷ bình chọn
            opt.votes = opt.votes.filter(id => id !== currentUserId);
          } else {
            opt.votes.push(currentUserId);
          }
        } else if (!msg.poll.multiple) {
          // Bỏ chọn các phương án khác nếu chỉ được chọn 1
          opt.votes = opt.votes.filter(id => id !== currentUserId);
        }
      });

      await Storage.put('messages', msg);
      if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudMessage === 'function') {
        window.FirebaseBridge.sendCloudMessage(msg);
      }
      Transport.emit('POLL_VOTED', { msgId, optId });
      await this.renderMessages();
    },

    /**
     * Bật / tắt cảm xúc Emoji cho tin nhắn
     */
    async toggleReaction(msgId, emoji) {
      const msg = await Storage.get('messages', msgId);
      if (!msg) return;

      const currentUserId = Storage.getCurrentUserId();
      if (!msg.reactions) msg.reactions = {};

      if (!msg.reactions[emoji]) {
        msg.reactions[emoji] = [];
      }

      const idx = msg.reactions[emoji].indexOf(currentUserId);
      if (idx !== -1) {
        msg.reactions[emoji].splice(idx, 1);
        if (msg.reactions[emoji].length === 0) {
          delete msg.reactions[emoji];
        }
      } else {
        msg.reactions[emoji].push(currentUserId);
      }

      await Storage.put('messages', msg);
      if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudMessage === 'function') {
        window.FirebaseBridge.sendCloudMessage(msg);
      }
      Transport.emit('REACTION_TOGGLED', { msgId, emoji });
      await this.renderMessages();
    },

    /**
     * Mở bộ chọn Emoji nhanh
     */
    openReactionPicker(msgId) {
      const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🙏'];
      const content = document.createElement('div');
      content.style.display = 'flex';
      content.style.flexWrap = 'wrap';
      content.style.gap = '10px';
      content.style.justifyContent = 'center';

      emojis.forEach(emo => {
        const btn = document.createElement('button');
        btn.textContent = emo;
        btn.style.fontSize = '26px';
        btn.style.padding = '8px';
        btn.style.borderRadius = 'var(--radius-md)';
        btn.style.backgroundColor = 'var(--bg-hover)';
        btn.onclick = async () => {
          UI.closeModal();
          await this.toggleReaction(msgId, emo);
          Utils.playSound('reaction');
        };
        content.appendChild(btn);
      });

      UI.modal({
        title: 'Thả cảm xúc',
        content,
        maxWidth: '340px'
      });
    },

    /**
     * Thiết lập Trả lời (Reply)
     */
    setReplyTarget(msg) {
      activeReplyTo = msg;
      activeEditingMessage = null;

      const replyBar = document.getElementById('composer-reply-bar');
      if (replyBar) {
        replyBar.style.display = 'flex';
        replyBar.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: var(--color-primary); font-size: 11px;">Đang trả lời:</div>
            <div style="color: var(--text-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${Utils.escapeHTML(msg.text || 'Tệp đính kèm')}
            </div>
          </div>
          <button id="cancel-reply-btn" style="color: var(--text-dim); padding: 4px;">✕</button>
        `;
        replyBar.querySelector('#cancel-reply-btn').addEventListener('click', () => {
          this.cancelReplyOrEdit();
        });
      }

      const input = document.getElementById('composer-input');
      if (input) input.focus();
    },

    /**
     * Thiết lập Chỉnh sửa tin nhắn (Edit)
     */
    setEditTarget(msg) {
      activeEditingMessage = msg;
      activeReplyTo = null;

      const replyBar = document.getElementById('composer-reply-bar');
      if (replyBar) {
        replyBar.style.display = 'flex';
        replyBar.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: var(--color-warning); font-size: 11px;">Đang sửa tin nhắn:</div>
            <div style="color: var(--text-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${Utils.escapeHTML(msg.text)}
            </div>
          </div>
          <button id="cancel-edit-btn" style="color: var(--text-dim); padding: 4px;">✕</button>
        `;
        replyBar.querySelector('#cancel-edit-btn').addEventListener('click', () => {
          this.cancelReplyOrEdit();
        });
      }

      const input = document.getElementById('composer-input');
      if (input) {
        input.value = msg.text;
        this.autoResizeTextarea(input);
        input.focus();
      }
    },

    cancelReplyOrEdit() {
      activeReplyTo = null;
      activeEditingMessage = null;
      const replyBar = document.getElementById('composer-reply-bar');
      if (replyBar) replyBar.style.display = 'none';
    },

    /**
     * Gửi tin nhắn mới hoặc lưu sửa đổi
     */
    async sendMessage() {
      const input = document.getElementById('composer-input');
      if (!input || !activeChat) return;

      const text = input.value.trim();
      if (!text && !activeEditingMessage) return;

      // 1. Chế độ Sửa tin nhắn
      if (activeEditingMessage) {
        activeEditingMessage.text = text;
        activeEditingMessage.edited = true;
        await Storage.put('messages', activeEditingMessage);
        if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudMessage === 'function') {
          window.FirebaseBridge.sendCloudMessage(activeEditingMessage);
        }
        this.cancelReplyOrEdit();
        input.value = '';
        this.autoResizeTextarea(input);
        Storage.setDraft(activeChat.id, '');
        await this.renderMessages();
        UI.toast('Đã cập nhật tin nhắn!', 'success');
        return;
      }

      // 2. Chế độ Gửi tin mới
      let replyToData = null;
      if (activeReplyTo) {
        const sender = await Storage.get('users', activeReplyTo.senderId);
        replyToData = {
          id: activeReplyTo.id,
          senderName: sender ? sender.name : 'Người dùng',
          text: activeReplyTo.text
        };
      }

      const currentUserId = Storage.getCurrentUserId();

      const newMsg = {
        id: Utils.generateId('msg'),
        chatId: activeChat.id,
        topicId: activeTopicId || null,
        senderId: currentUserId,
        type: 'text',
        text: text,
        attachments: [],
        replyTo: replyToData,
        reactions: {},
        status: 'sent',
        pinned: false,
        starred: false,
        createdAt: Date.now()
      };

      // Lưu tin nhắn vào IndexedDB
      await Storage.put('messages', newMsg);

      // Cập nhật cuộc hội thoại
      activeChat.lastMessageId = newMsg.id;
      await Storage.put('chats', activeChat);

      // Tự động gom link từ tin nhắn vào kho Link
      await Links.indexLinksFromMessage(newMsg, activeChat);

      // Xóa ô nhập và huỷ reply
      input.value = '';
      this.autoResizeTextarea(input);
      this.cancelReplyOrEdit();
      Storage.setDraft(activeChat.id, '');

      // Phát âm thanh gửi tin
      Utils.playSound('send');

      // Gửi qua Transport và kích hoạt phản hồi Bot nếu có
      await Transport.send(newMsg, activeChat);

      // Render lại giao diện
      await this.renderMessages();
    },

    /**
     * Gửi tệp đính kèm đã chọn
     */
    async sendAttachments(processedFiles, caption = '') {
      if (!activeChat || !processedFiles || processedFiles.length === 0) return;

      const attachments = [];
      for (const item of processedFiles) {
        attachments.push({
          id: Utils.generateId('att'),
          name: item.name,
          size: item.size,
          mime: item.type,
          dataUrl: item.previewUrl,
          width: item.width,
          height: item.height
        });
      }

      const currentUserId = Storage.getCurrentUserId();
      const newMsg = {
        id: Utils.generateId('msg'),
        chatId: activeChat.id,
        topicId: activeTopicId || null,
        senderId: currentUserId,
        type: attachments[0].mime.startsWith('image/') ? 'image' : 'file',
        text: caption,
        attachments: attachments,
        replyTo: null,
        reactions: {},
        status: 'sent',
        pinned: false,
        starred: false,
        createdAt: Date.now()
      };

      await Storage.put('messages', newMsg);
      activeChat.lastMessageId = newMsg.id;
      await Storage.put('chats', activeChat);

      Utils.playSound('send');
      await Transport.send(newMsg, activeChat);
      await this.renderMessages();
      UI.toast(`Đã gửi ${attachments.length} tệp thành công!`, 'success');
    },

    /**
     * Tạo và gửi cuộc bình chọn Poll mới
     */
    openCreatePollModal() {
      const content = document.createElement('div');
      content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">CÂU HỎI BÌNH CHỌN *</label>
            <input type="text" id="poll-q-input" placeholder="Ví dụ: Chọn thời gian họp sprint?" style="
              width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " required />
          </div>

          <div id="poll-options-container" style="display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block;">CÁC PHƯƠNG ÁN LỰA CHỌN</label>
            <input type="text" class="poll-opt-input" placeholder="Lựa chọn 1..." style="
              width: 100%; padding: 8px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " />
            <input type="text" class="poll-opt-input" placeholder="Lựa chọn 2..." style="
              width: 100%; padding: 8px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " />
          </div>

          <button id="add-poll-opt-btn" class="btn btn-secondary" style="font-size: 12px; align-self: flex-start;">+ Thêm lựa chọn</button>
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary modal-cancel-btn">Hủy bỏ</button>
        <button class="btn btn-primary modal-create-btn">Tạo bình chọn</button>
      `;

      const modal = UI.modal({
        title: 'Tạo Bình Chọn (Poll)',
        content,
        footer
      });

      content.querySelector('#add-poll-opt-btn').addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'poll-opt-input';
        inp.placeholder = `Lựa chọn tiếp theo...`;
        inp.style.cssText = `
          width: 100%; padding: 8px 12px; border-radius: var(--radius-md);
          background: var(--bg-input); border: 1px solid var(--border-color);
          font-size: var(--font-size-sm); color: var(--text-main);
        `;
        content.querySelector('#poll-options-container').appendChild(inp);
      });

      modal.querySelector('.modal-cancel-btn').addEventListener('click', () => UI.closeModal());
      modal.querySelector('.modal-create-btn').addEventListener('click', async () => {
        const question = content.querySelector('#poll-q-input').value.trim();
        if (!question) {
          UI.toast('Vui lòng nhập câu hỏi bình chọn!', 'warning');
          return;
        }

        const optInputs = content.querySelectorAll('.poll-opt-input');
        const options = [];
        optInputs.forEach((inp, idx) => {
          const val = inp.value.trim();
          if (val) {
            options.push({
              id: `opt_${idx + 1}`,
              text: val,
              votes: []
            });
          }
        });

        if (options.length < 2) {
          UI.toast('Vui lòng nhập ít nhất 2 lựa chọn!', 'warning');
          return;
        }

        const newMsg = {
          id: Utils.generateId('msg'),
          chatId: activeChat.id,
          topicId: activeTopicId || null,
          senderId: Storage.getCurrentUserId(),
          type: 'poll',
          text: '',
          poll: {
            question,
            options,
            multiple: false
          },
          attachments: [],
          replyTo: null,
          reactions: {},
          status: 'sent',
          pinned: false,
          starred: false,
          createdAt: Date.now()
        };

        await Storage.put('messages', newMsg);
        activeChat.lastMessageId = newMsg.id;
        await Storage.put('chats', activeChat);

        UI.closeModal();
        Utils.playSound('send');
        await Transport.send(newMsg, activeChat);
        await this.renderMessages();
      });
    },

    /**
     * Bắt đầu / Dừng ghi âm giọng nói (Voice Note) bằng MediaRecorder
     */
    async toggleVoiceRecording() {
      const recordBtn = document.getElementById('btn-voice-record');
      if (!recordBtn) return;

      if (!isRecordingVoice) {
        // Bắt đầu ghi âm
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(track => track.stop());
            await this.sendVoiceMessage(audioBlob);
          };

          mediaRecorder.start();
          isRecordingVoice = true;
          recordBtn.style.color = 'var(--color-danger)';
          recordBtn.innerHTML = '⏹️';
          UI.toast('Đang ghi âm... Nhấn lại để gửi.', 'info');
        } catch {
          UI.toast('Không thể truy cập Microphone thiết bị.', 'error');
        }
      } else {
        // Dừng và gửi
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        isRecordingVoice = false;
        recordBtn.style.color = 'var(--text-muted)';
        recordBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
      }
    },

    async sendVoiceMessage(audioBlob) {
      if (!activeChat) return;

      const voiceAtt = {
        id: Utils.generateId('voice'),
        name: `Voice_${Date.now()}.webm`,
        size: audioBlob.size,
        mime: 'audio/webm',
        url: URL.createObjectURL(audioBlob)
      };

      const newMsg = {
        id: Utils.generateId('msg'),
        chatId: activeChat.id,
        topicId: activeTopicId || null,
        senderId: Storage.getCurrentUserId(),
        type: 'voice',
        text: '🎤 Tin nhắn thoại',
        attachments: [voiceAtt],
        reactions: {},
        status: 'sent',
        createdAt: Date.now()
      };

      await Storage.put('messages', newMsg);
      activeChat.lastMessageId = newMsg.id;
      await Storage.put('chats', activeChat);

      Utils.playSound('send');
      await Transport.send(newMsg, activeChat);
      await this.renderMessages();
      UI.toast('Đã gửi tin nhắn thoại thành công!', 'success');
    },

    /**
     * Dựng nội dung Panel thông tin bên phải (Right Info Panel)
     */
    async renderRightPanel() {
      const panel = document.getElementById('chat-info-panel');
      if (!panel || !activeChat) return;

      const allUsers = await Storage.getAll('users');
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const isGroup = activeChat.type === 'group';

      let topicsHtml = '';
      if (isGroup && activeChat.topics && activeChat.topics.length > 0) {
        topicsHtml = `
          <div style="margin-bottom: 18px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Kênh chủ đề (#Topics)</span>
              <button id="btn-add-topic" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;">+ Kênh</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <button class="topic-item-btn ${!activeTopicId ? 'active' : ''}" data-topic-id="" style="
                text-align: left; padding: 6px 10px; border-radius: var(--radius-sm);
                font-size: var(--font-size-sm); font-weight: 600;
                background: ${!activeTopicId ? 'var(--color-primary-light)' : 'transparent'};
                color: ${!activeTopicId ? 'var(--color-primary)' : 'var(--text-main)'};
              "># tất-cả-kênh</button>
              ${activeChat.topics.map(t => `
                <button class="topic-item-btn ${activeTopicId === t.id ? 'active' : ''}" data-topic-id="${t.id}" style="
                  text-align: left; padding: 6px 10px; border-radius: var(--radius-sm);
                  font-size: var(--font-size-sm); font-weight: 500;
                  background: ${activeTopicId === t.id ? 'var(--color-primary-light)' : 'transparent'};
                  color: ${activeTopicId === t.id ? 'var(--color-primary)' : 'var(--text-muted)'};
                "># ${Utils.escapeHTML(t.name)}</button>
              `).join('')}
            </div>
          </div>
        `;
      }

      let membersHtml = '';
      if (isGroup && activeChat.members) {
        membersHtml = `
          <div style="margin-bottom: 18px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Thành viên (${activeChat.members.length})</span>
              <button id="btn-invite-members" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;">+ Mời / QR</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${activeChat.members.map(mId => {
                const u = userMap.get(mId) || { name: 'Người dùng', id: mId };
                const role = activeChat.roles ? activeChat.roles[mId] : 'member';
                let roleTag = '';
                if (role === 'owner') roleTag = '<span style="font-size: 10px; background: var(--color-primary-light); color: var(--color-primary); padding: 1px 6px; border-radius: 4px;">Trưởng nhóm</span>';
                if (role === 'admin') roleTag = '<span style="font-size: 10px; background: var(--bg-hover); color: var(--text-muted); padding: 1px 6px; border-radius: 4px;">Quản trị</span>';

                return `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      ${UI.renderAvatar(u, 'xs')}
                      <span style="font-size: var(--font-size-sm); font-weight: 500;">${Utils.escapeHTML(u.name)}</span>
                    </div>
                    ${roleTag}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // Todos của nhóm
      const todos = await Groups.getGroupTodos(activeChat.id);
      let todosHtml = `
        <div style="margin-bottom: 18px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Việc cần làm (${todos.length})</span>
            <button id="btn-add-todo" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;">+ Việc</button>
          </div>
          <div id="group-todo-list" style="display: flex; flex-direction: column; gap: 6px;">
            ${todos.map(td => `
              <label style="display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; cursor: pointer;">
                <input type="checkbox" class="todo-check" data-todo-id="${td.id}" ${td.done ? 'checked' : ''} style="margin-top: 3px;" />
                <span style="font-size: var(--font-size-sm); ${td.done ? 'text-decoration: line-through; color: var(--text-dim);' : ''}">${Utils.escapeHTML(td.text)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;

      panel.innerHTML = `
        <div style="padding: 18px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
          <h3 style="font-size: var(--font-size-md); font-weight: 700;">Thông Tin</h3>
          <button id="btn-close-info-panel" class="composer-action-btn" title="Đóng">✕</button>
        </div>
        <div style="padding: 18px; overflow-y: auto; flex: 1;">
          <div style="display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 20px;">
            ${UI.renderAvatar(activeChat, 'xl')}
            <h4 style="font-size: var(--font-size-lg); font-weight: 700; margin-top: 10px;">${Utils.escapeHTML(activeChat.name)}</h4>
            <span style="font-size: var(--font-size-xs); color: var(--text-muted);">${isGroup ? 'Nhóm trao đổi' : 'Hội thoại trực tiếp'}</span>
          </div>

          ${topicsHtml}
          ${membersHtml}
          ${todosHtml}
        </div>
      `;

      // Bắt sự kiện Panel
      panel.querySelector('#btn-close-info-panel').addEventListener('click', () => {
        this.toggleRightPanel(false);
      });

      if (isGroup) {
        const btnAddTopic = panel.querySelector('#btn-add-topic');
        if (btnAddTopic) {
          btnAddTopic.addEventListener('click', async () => {
            const topicName = prompt('Nhập tên kênh chủ đề mới (VD: ke-hoach):');
            if (topicName) {
              await Groups.addTopicToGroup(activeChat, topicName);
              this.renderRightPanel();
            }
          });
        }

        const btnInvite = panel.querySelector('#btn-invite-members');
        if (btnInvite) {
          btnInvite.addEventListener('click', () => {
            Groups.showGroupInviteModal(activeChat);
          });
        }

        // Chuyển kênh #Topic
        panel.querySelectorAll('.topic-item-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            activeTopicId = btn.dataset.topicId || null;
            this.renderChatHeader();
            await this.renderMessages();
            this.renderRightPanel();
          });
        });
      }

      // Checkbox To-do
      panel.querySelectorAll('.todo-check').forEach(chk => {
        chk.addEventListener('change', async () => {
          await Groups.toggleTodo(chk.dataset.todoId);
          this.renderRightPanel();
        });
      });

      const btnAddTodo = panel.querySelector('#btn-add-todo');
      if (btnAddTodo) {
        btnAddTodo.addEventListener('click', async () => {
          const text = prompt('Nhập công việc cần làm mới:');
          if (text) {
            await Groups.addTodo(activeChat.id, text.trim());
            this.renderRightPanel();
          }
        });
      }
    },

    toggleRightPanel(forceState) {
      const panel = document.getElementById('chat-info-panel');
      if (!panel) return;
      if (typeof forceState === 'boolean') {
        panel.classList.toggle('hidden', !forceState);
      } else {
        panel.classList.toggle('hidden');
      }
    },

    /**
     * Tự động giãn chiều cao Textarea soạn tin
     */
    autoResizeTextarea(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    },

    /**
     * Cuộn mượt xuống đáy tin nhắn
     */
    scrollToBottom(smooth = true) {
      const container = document.getElementById('chat-messages-scroll');
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto'
        });
      }
    }
  };
})();
