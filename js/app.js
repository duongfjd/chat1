/**
 * ==========================================================================
 * QUICKCHAT - APP.JS
 * Trình điều phối trung tâm: Khởi tạo Storage, Router Tab, Quản lý Sidebar,
 * Phím tắt bàn phím, Drag & Drop tệp, Dán ảnh Clipboard, PWA và Offline banner.
 * ==========================================================================
 */

const App = (() => {
  let activeTab = 'chats'; // 'chats' | 'groups' | 'files' | 'links' | 'saved' | 'settings'
  let activeFilter = 'all'; // 'all' | 'unread' | 'groups' | 'direct'
  let pwaDeferredPrompt = null;

  return {
    /**
     * Khởi động toàn bộ ứng dụng
     */
    async init() {
      // 1. Khởi tạo IndexedDB và dữ liệu mẫu
      await Storage.init();

      // 2. Áp dụng giao diện đã lưu (Dark mode, Accent, Font size...)
      Settings.applyStoredSettings();

      // 3. Khởi tạo các sự kiện toàn cục
      this.bindNavigationEvents();
      this.bindComposerEvents();
      this.bindKeyboardShortcuts();
      this.bindNetworkAndPWAEvents();
      this.bindTransportEvents();
      this.bindCloudSync();

      // 4. Dựng danh sách hội thoại ban đầu
      await this.renderSidebarChatList();

      // 5. Mở cuộc hội thoại đầu tiên mặc định
      const chats = await Storage.getAll('chats');
      if (chats.length > 0) {
        Chat.openConversation(chats[0].id);
      }

      console.log('⚡ QuickChat đã khởi động hoàn tất và sẵn sàng!');
    },

    /**
     * Gắn sự kiện chuyển Tab điều hướng (Rail và Mobile Bottom Nav)
     */
    bindNavigationEvents() {
      // Desktop Rail
      document.querySelectorAll('.rail-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          if (tab) this.switchTab(tab);
        });
      });

      // Mobile Bottom Nav
      document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          if (tab) this.switchTab(tab);
        });
      });

      // Bộ lọc Sidebar (Tất cả / Chưa đọc / Nhóm / Cá nhân)
      document.querySelectorAll('.sidebar-filters-scroll .filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('.sidebar-filters-scroll .filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          activeFilter = pill.dataset.filter;
          this.renderSidebarChatList();
        });
      });

      // Ô tìm kiếm nhanh trong Sidebar
      const sidebarSearch = document.getElementById('sidebar-search-input');
      if (sidebarSearch) {
        sidebarSearch.addEventListener('input', () => {
          this.renderSidebarChatList(sidebarSearch.value.trim());
        });
      }

      // Nút tạo mới trong Sidebar & Mobile FAB
      const btnNewChat = document.getElementById('btn-new-chat');
      const mobileFab = document.getElementById('mobile-fab-btn');
      const handleCreateChat = () => {
        UI.bottomSheet({
          title: 'Tạo mới',
          items: [
            {
              label: 'Tạo nhóm trao đổi mới',
              icon: '👥',
              action: () => Groups.openCreateGroupModal((g) => {
                this.renderSidebarChatList();
                Chat.openConversation(g.id);
              })
            },
            {
              label: 'Thêm liên kết vào kho',
              icon: '🔗',
              action: () => Links.openAddLinkModal()
            }
          ]
        });
      };

      if (btnNewChat) btnNewChat.addEventListener('click', handleCreateChat);
      if (mobileFab) mobileFab.addEventListener('click', handleCreateChat);

      // Mobile Back button (Quay lại từ khung chat ra danh sách)
      const btnMobileBack = document.getElementById('btn-mobile-back');
      if (btnMobileBack) {
        btnMobileBack.addEventListener('click', () => {
          const chatView = document.getElementById('view-chat');
          if (chatView) chatView.classList.remove('active');
        });
      }
    },

    /**
     * Chuyển đổi giữa các màn hình tính năng chính
     */
    async switchTab(tabName) {
      activeTab = tabName;

      // Cập nhật trạng thái active trên Rail & Bottom Nav
      document.querySelectorAll('.rail-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabName);
      });
      document.querySelectorAll('.mobile-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabName);
      });

      const mainView = document.getElementById('app-main-content');
      const sidebar = document.getElementById('view-sidebar');

      if (tabName === 'chats' || tabName === 'groups') {
        sidebar.style.display = 'flex';
        mainView.style.display = 'flex';
        const customContainer = document.getElementById('custom-tab-view');
        if (customContainer) customContainer.style.display = 'none';

        activeFilter = (tabName === 'groups') ? 'groups' : 'all';
        await this.renderSidebarChatList();
      } else {
        // Ẩn main chat, hiển thị view tab chuyên biệt (Files, Links, Settings)
        mainView.style.display = 'none';
        let customContainer = document.getElementById('custom-tab-view');
        if (!customContainer) {
          customContainer = document.createElement('div');
          customContainer.id = 'custom-tab-view';
          customContainer.style.flex = '1';
          customContainer.style.height = '100%';
          customContainer.style.overflowY = 'auto';
          customContainer.style.backgroundColor = 'var(--bg-main)';
          document.getElementById('app').appendChild(customContainer);
        }
        customContainer.style.display = 'block';

        if (tabName === 'files') {
          await Files.renderFileLibraryView(customContainer);
        } else if (tabName === 'links') {
          await Links.renderLinksRepoView(customContainer);
        } else if (tabName === 'saved') {
          await this.renderSavedMessagesView(customContainer);
        } else if (tabName === 'settings') {
          await Settings.renderSettingsView(customContainer, (newUserId) => {
            this.renderSidebarChatList();
            if (Chat.getActiveChat()) {
              Chat.openConversation(Chat.getActiveChat().id);
            }
          });
        }
      }
    },

    /**
     * Dựng danh sách hội thoại trong Sidebar
     */
    async renderSidebarChatList(searchQuery = '') {
      const container = document.getElementById('sidebar-chat-list');
      if (!container) return;

      let chats = await Storage.getAll('chats');
      const allMessages = await Storage.getAll('messages');
      const msgMap = new Map(allMessages.map(m => [m.id, m]));

      // 1. Áp dụng bộ lọc
      if (activeFilter === 'unread') {
        chats = chats.filter(c => (c.unread || 0) > 0);
      } else if (activeFilter === 'groups') {
        chats = chats.filter(c => c.type === 'group');
      } else if (activeFilter === 'direct') {
        chats = chats.filter(c => c.type === 'direct');
      }

      // 2. Tìm kiếm theo tên không dấu Tiếng Việt
      if (searchQuery) {
        const cleanQ = Utils.removeVietnameseDiacritics(searchQuery);
        chats = chats.filter(c => Utils.removeVietnameseDiacritics(c.name).includes(cleanQ));
      }

      // 3. Sắp xếp: Tin ghim lên đầu, sau đó theo tin nhắn gần nhất
      chats.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const msgA = msgMap.get(a.lastMessageId);
        const msgB = msgMap.get(b.lastMessageId);
        const timeA = msgA ? msgA.createdAt : (a.createdAt || 0);
        const timeB = msgB ? msgB.createdAt : (b.createdAt || 0);
        return timeB - timeA;
      });

      if (chats.length === 0) {
        container.innerHTML = `
          <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: var(--font-size-sm);">
            Không có cuộc trò chuyện nào phù hợp.
          </div>
        `;
        return;
      }

      const activeChat = Chat.getActiveChat();

      container.innerHTML = chats.map(chat => {
        const lastMsg = msgMap.get(chat.lastMessageId);
        const draft = Storage.getDraft(chat.id);
        const isActive = activeChat && activeChat.id === chat.id;

        let previewText = 'Chưa có tin nhắn';
        let isDraft = false;

        if (draft) {
          previewText = `Bản nháp: ${draft}`;
          isDraft = true;
        } else if (lastMsg) {
          previewText = lastMsg.text || (lastMsg.attachments && lastMsg.attachments.length > 0 ? '📷 Đã gửi tệp đính kèm' : 'Tin nhắn mới');
        }

        const timeStr = lastMsg ? Utils.formatRelativeTime(lastMsg.createdAt) : '';

        return `
          <div class="chat-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
            ${UI.renderAvatar(chat, 'md')}
            <div class="chat-item-content">
              <div class="chat-item-top">
                <span class="chat-item-name">${Utils.escapeHTML(chat.name)}</span>
                <span class="chat-item-time">${timeStr}</span>
              </div>
              <div class="chat-item-bottom">
                <span class="chat-item-preview ${isDraft ? 'draft' : ''}">
                  ${Utils.escapeHTML(previewText)}
                </span>
                <div class="chat-item-badges">
                  ${chat.pinned ? '<span class="pin-icon">📌</span>' : ''}
                  ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Gắn sự kiện chọn cuộc hội thoại
      container.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', () => {
          const chatId = item.dataset.chatId;
          Chat.openConversation(chatId);
          this.renderSidebarChatList();
        });
      });
    },

    /**
     * Dựng màn hình Tin nhắn đã lưu ⭐
     */
    async renderSavedMessagesView(container) {
      const starred = await Storage.getStarredMessages();

      container.innerHTML = `
        <div style="padding: 24px 20px; max-width: 800px; margin: 0 auto; width: 100%;">
          <h2 style="font-size: var(--font-size-2xl); font-weight: 700; margin-bottom: 6px;">⭐ Tin Nhắn Đã Lưu & Ghim</h2>
          <p style="font-size: var(--font-size-sm); color: var(--text-muted); margin-bottom: 20px;">Kho lưu trữ nhanh các tin nhắn quan trọng bạn đã đánh dấu sao.</p>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${starred.length === 0 ? `
              <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <div style="font-size: 40px; margin-bottom: 8px;">⭐</div>
                <div>Bạn chưa gắn sao tin nhắn nào. Nhấp chuột phải vào tin nhắn để lưu!</div>
              </div>
            ` : starred.map(m => `
              <div style="
                background: var(--bg-card); padding: 14px 16px; border-radius: var(--radius-md);
                border: 1px solid var(--border-color); box-shadow: var(--shadow-xs);
              ">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; color: var(--text-muted);">
                  <span>${Utils.formatTime(m.createdAt)} - ${Utils.formatDateDivider(m.createdAt)}</span>
                  <button class="remove-star-btn" data-id="${m.id}" style="color: var(--color-warning);">⭐ Bỏ lưu</button>
                </div>
                <div style="font-size: var(--font-size-sm); color: var(--text-main);">${Utils.parseSafeMarkdown(m.text || 'Tệp đính kèm')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      container.querySelectorAll('.remove-star-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const m = await Storage.get('messages', btn.dataset.id);
          if (m) {
            m.starred = false;
            await Storage.put('messages', m);
            UI.toast('Đã bỏ lưu tin nhắn.', 'info');
            this.renderSavedMessagesView(container);
          }
        });
      });
    },

    /**
     * Gắn sự kiện cho Khung soạn thảo tin nhắn (Composer)
     */
    bindComposerEvents() {
      const textarea = document.getElementById('composer-input');
      const btnSend = document.getElementById('btn-send-message');
      const fileInput = document.getElementById('file-upload-input');
      const btnAttach = document.getElementById('btn-attach-file');
      const btnVoice = document.getElementById('btn-voice-record');
      const btnPoll = document.getElementById('btn-create-poll');
      const btnEmoji = document.getElementById('btn-emoji-picker');

      if (!textarea) return;

      // Tự giãn chiều cao khi gõ
      textarea.addEventListener('input', () => {
        Chat.autoResizeTextarea(textarea);

        // Lưu bản nháp tự động
        const chat = Chat.getActiveChat();
        if (chat) {
          Storage.setDraft(chat.id, textarea.value);
        }

        // Bắn tín hiệu đang gõ... tới các tab khác
        if (chat && textarea.value.length > 0) {
          Transport.emit('TYPING', {
            chatId: chat.id,
            userId: Storage.getCurrentUserId(),
            userName: 'Tôi',
            isTyping: true
          });
        }
      });

      // Nhấn Enter để gửi, Shift+Enter xuống dòng
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          Chat.sendMessage();
        }
      });

      // Nút gửi
      if (btnSend) {
        btnSend.addEventListener('click', () => Chat.sendMessage());
      }

      // Nút đính kèm tệp 📎
      if (btnAttach && fileInput) {
        btnAttach.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
          const chat = Chat.getActiveChat();
          if (chat && fileInput.files.length > 0) {
            Files.handleFileSelection(fileInput.files, chat.id, Chat.getActiveTopicId(), (files, caption) => {
              Chat.sendAttachments(files, caption);
            });
            fileInput.value = '';
          }
        });
      }

      // Kéo thả tệp vào khung chat
      const chatArea = document.getElementById('chat-messages-scroll');
      if (chatArea) {
        chatArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          chatArea.style.backgroundColor = 'var(--bg-hover)';
        });
        chatArea.addEventListener('dragleave', () => {
          chatArea.style.backgroundColor = 'var(--bg-main)';
        });
        chatArea.addEventListener('drop', (e) => {
          e.preventDefault();
          chatArea.style.backgroundColor = 'var(--bg-main)';
          const chat = Chat.getActiveChat();
          if (chat && e.dataTransfer.files.length > 0) {
            Files.handleFileSelection(e.dataTransfer.files, chat.id, Chat.getActiveTopicId(), (files, caption) => {
              Chat.sendAttachments(files, caption);
            });
          }
        });
      }

      // Dán ảnh từ Clipboard (Ctrl+V)
      window.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        const chat = Chat.getActiveChat();
        if (!chat) return;

        const files = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) files.push(blob);
          }
        }

        if (files.length > 0) {
          Files.handleFileSelection(files, chat.id, Chat.getActiveTopicId(), (procFiles, caption) => {
            Chat.sendAttachments(procFiles, caption);
          });
        }
      });

      // Ghi âm giọng nói 🎙️
      if (btnVoice) {
        btnVoice.addEventListener('click', () => Chat.toggleVoiceRecording());
      }

      // Tạo bình chọn 📊
      if (btnPoll) {
        btnPoll.addEventListener('click', () => Chat.openCreatePollModal());
      }

      // Bộ chọn Emoji 😊
      if (btnEmoji) {
        btnEmoji.addEventListener('click', () => {
          const emojis = ['😀', '😂', '😍', '🥳', '😎', '👍', '🔥', '🎉', '🚀', '❤️', '💡', '✨'];
          const content = document.createElement('div');
          content.style.display = 'grid';
          content.style.gridTemplateColumns = 'repeat(4, 1fr)';
          content.style.gap = '8px';

          emojis.forEach(emo => {
            const b = document.createElement('button');
            b.textContent = emo;
            b.style.fontSize = '26px';
            b.style.padding = '8px';
            b.style.borderRadius = 'var(--radius-sm)';
            b.onclick = () => {
              textarea.value += emo;
              Chat.autoResizeTextarea(textarea);
              UI.closeModal();
            };
            content.appendChild(b);
          });

          UI.modal({
            title: 'Chọn Emoji',
            content,
            maxWidth: '300px'
          });
        });
      }
    },

    /**
     * Bàn phím & Phím tắt nhanh
     */
    bindKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K: Tìm kiếm toàn cục
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          Search.openGlobalSearchModal((chatId, msgId) => {
            Chat.openConversation(chatId, null, msgId);
          });
        }

        // Ctrl/Cmd + /: Bảng phím tắt
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
          e.preventDefault();
          this.showShortcutsModal();
        }

        // Esc: Huỷ reply hoặc đóng modal
        if (e.key === 'Escape') {
          Chat.cancelReplyOrEdit();
          UI.closeModal();
        }
      });
    },

    showShortcutsModal() {
      const content = `
        <div style="display: flex; flex-direction: column; gap: 10px; font-size: var(--font-size-sm);">
          <div style="display: flex; justify-content: space-between;"><span>Tìm kiếm toàn cục</span><kbd style="background: var(--bg-hover); padding: 2px 6px; border-radius: 4px;">Ctrl + K</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Gửi tin nhắn</span><kbd style="background: var(--bg-hover); padding: 2px 6px; border-radius: 4px;">Enter</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Xuống dòng</span><kbd style="background: var(--bg-hover); padding: 2px 6px; border-radius: 4px;">Shift + Enter</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Đóng hộp thoại / Hủy reply</span><kbd style="background: var(--bg-hover); padding: 2px 6px; border-radius: 4px;">Esc</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Mở bảng phím tắt</span><kbd style="background: var(--bg-hover); padding: 2px 6px; border-radius: 4px;">Ctrl + /</kbd></div>
        </div>
      `;
      UI.modal({
        title: '⌨️ Danh Sách Phím Tắt',
        content,
        maxWidth: '400px'
      });
    },

    /**
     * Quản lý trạng thái mạng Offline & Cài đặt PWA
     */
    bindNetworkAndPWAEvents() {
      const banner = document.getElementById('offline-banner');

      const updateOnlineStatus = () => {
        if (!navigator.onLine) {
          if (banner) banner.classList.add('active');
        } else {
          if (banner) banner.classList.remove('active');
        }
      };

      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      updateOnlineStatus();

      // PWA Install prompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        pwaDeferredPrompt = e;
        const installBtn = document.getElementById('btn-pwa-install');
        if (installBtn) {
          installBtn.style.display = 'flex';
          installBtn.onclick = async () => {
            if (pwaDeferredPrompt) {
              pwaDeferredPrompt.prompt();
              const { outcome } = await pwaDeferredPrompt.userChoice;
              if (outcome === 'accepted') {
                installBtn.style.display = 'none';
              }
              pwaDeferredPrompt = null;
            }
          };
        }
      });

      // Đăng ký Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {
          // Bỏ qua lỗi nếu chạy trên môi trường sandbox không hỗ trợ worker
        });
      }
    },

    /**
     * Lắng nghe các sự kiện thời gian thực từ Transport
     */
    bindTransportEvents() {
      Transport.on('NEW_MESSAGE', async ({ message, chat }) => {
        const activeChat = Chat.getActiveChat();
        if (activeChat && activeChat.id === message.chatId) {
          await Chat.renderMessages();
        } else {
          // Tăng huy hiệu chưa đọc
          const c = await Storage.get('chats', message.chatId);
          if (c) {
            c.unread = (c.unread || 0) + 1;
            c.lastMessageId = message.id;
            await Storage.put('chats', c);
          }
        }
        await this.renderSidebarChatList();
      });

      Transport.on('TYPING', ({ chatId, userName, isTyping }) => {
        const activeChat = Chat.getActiveChat();
        if (activeChat && activeChat.id === chatId) {
          const typingContainer = document.getElementById('typing-container');
          if (typingContainer) {
            if (isTyping) {
              typingContainer.innerHTML = `
                <div class="typing-indicator" style="margin-left: 44px;">
                  <span style="font-size: 11px; color: var(--text-muted); margin-right: 4px;">${Utils.escapeHTML(userName)} đang soạn</span>
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                </div>
              `;
            } else {
              typingContainer.innerHTML = '';
            }
          }
      });
    },

    /**
     * Lắng nghe và đồng bộ dữ liệu đám mây thời gian thực từ Firebase Firestore
     */
    bindCloudSync() {
      let isInitialized = false;

      const initListeners = () => {
        if (isInitialized || !window.FirebaseBridge) return;
        isInitialized = true;

        // 1. Đồng bộ danh sách cuộc hội thoại (Chats)
        if (typeof window.FirebaseBridge.listenAllCloudChats === 'function') {
          window.FirebaseBridge.listenAllCloudChats(async (cloudChats) => {
            if (cloudChats && cloudChats.length > 0) {
              const cloudIds = new Set(cloudChats.map(c => c.id));
              const localChats = await Storage.getAll('chats');
              for (const lc of localChats) {
                if (!cloudIds.has(lc.id)) {
                  await Storage.delete('chats', lc.id);
                }
              }
              for (const c of cloudChats) {
                await Storage.put('chats', c);
              }
              await this.renderSidebarChatList();
            } else if (typeof window.FirebaseBridge.syncAllLocalToCloud === 'function') {
              await window.FirebaseBridge.syncAllLocalToCloud();
            }
          });
        }

        // 2. Đồng bộ luồng tin nhắn (Messages)
        if (typeof window.FirebaseBridge.listenAllCloudMessages === 'function') {
          window.FirebaseBridge.listenAllCloudMessages(async (cloudMsgs) => {
            if (cloudMsgs && cloudMsgs.length > 0) {
              const cloudIds = new Set(cloudMsgs.map(m => m.id));
              const localMsgs = await Storage.getAll('messages');
              for (const lm of localMsgs) {
                if (!cloudIds.has(lm.id)) {
                  await Storage.delete('messages', lm.id);
                }
              }
              for (const m of cloudMsgs) {
                await Storage.put('messages', m);
              }
              const activeChat = Chat.getActiveChat();
              if (activeChat) {
                await Chat.renderMessages();
              } else {
                const chats = await Storage.getAll('chats');
                if (chats.length > 0) {
                  Chat.openConversation(chats[0].id);
                }
              }
              await this.renderSidebarChatList();
            }
          });
        }

        // 3. Đồng bộ Kho liên kết (Links)
        if (typeof window.FirebaseBridge.listenAllCloudLinks === 'function') {
          window.FirebaseBridge.listenAllCloudLinks(async (cloudLinks) => {
            if (cloudLinks && cloudLinks.length > 0) {
              for (const l of cloudLinks) {
                await Storage.put('links', l);
              }
            }
          });
        }

        // 4. Đồng bộ Công việc nhóm (Todos)
        if (typeof window.FirebaseBridge.listenAllCloudTodos === 'function') {
          window.FirebaseBridge.listenAllCloudTodos(async (cloudTodos) => {
            if (cloudTodos && cloudTodos.length > 0) {
              for (const t of cloudTodos) {
                await Storage.put('todos', t);
              }
            }
          });
        }
      };

      if (window.FirebaseBridge) {
        initListeners();
      } else {
        window.addEventListener('firebaseBridgeReady', () => {
          initListeners();
        });
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (window.FirebaseBridge) {
            clearInterval(interval);
            initListeners();
          } else if (attempts > 30) {
            clearInterval(interval);
          }
        }, 150);
      }
    }
  };
})();

// Tự khởi chạy ứng dụng khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
