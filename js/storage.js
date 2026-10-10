/**
 * ==========================================================================
 * QUICKCHAT - STORAGE.JS
 * Lớp trừu tượng lưu trữ: IndexedDB (Tin nhắn, Blob tệp, Hội thoại, Nhóm)
 * kết hợp LocalStorage (Cài đặt, Người dùng hiện tại, Cấu hình).
 * ==========================================================================
 */

const Storage = (() => {
  const DB_NAME = 'quickchat_db';
  const DB_VERSION = 1;
  let dbInstance = null;

  /**
   * Mở hoặc nâng cấp cơ sở dữ liệu IndexedDB
   */
  const openDB = () => {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Bảng Users
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }

        // Bảng Chats
        if (!db.objectStoreNames.contains('chats')) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('type', 'type', { unique: false });
        }

        // Bảng Messages
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('chatId', 'chatId', { unique: false });
          msgStore.createIndex('topicId', 'topicId', { unique: false });
          msgStore.createIndex('createdAt', 'createdAt', { unique: false });
          msgStore.createIndex('chat_time', ['chatId', 'createdAt'], { unique: false });
        }

        // Bảng Attachments (lưu trữ Blob file gốc và thumbnail)
        if (!db.objectStoreNames.contains('attachments')) {
          const attStore = db.createObjectStore('attachments', { keyPath: 'id' });
          attStore.createIndex('messageId', 'messageId', { unique: false });
        }

        // Bảng Links (kho liên kết)
        if (!db.objectStoreNames.contains('links')) {
          const linkStore = db.createObjectStore('links', { keyPath: 'id' });
          linkStore.createIndex('chatId', 'chatId', { unique: false });
          linkStore.createIndex('favorite', 'favorite', { unique: false });
        }

        // Bảng Todos (việc cần làm của nhóm)
        if (!db.objectStoreNames.contains('todos')) {
          const todoStore = db.createObjectStore('todos', { keyPath: 'id' });
          todoStore.createIndex('chatId', 'chatId', { unique: false });
        }

        // Bảng Folders
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  };

  /**
   * Helper thực thi giao dịch Transaction với Promise
   */
  const transaction = async (storeName, mode, callback) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = callback(store);

      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = (e) => reject(e.target.error);
    });
  };

  return {
    async init() {
      await openDB();
      // Bỏ hẳn bộ nhớ đệm cục bộ cũ: Xóa toàn bộ dữ liệu trên IndexedDB khi khởi động
      const stores = ['users', 'chats', 'messages', 'attachments', 'links', 'todos', 'folders'];
      for (const st of stores) {
        await this.clearStore(st);
      }
    },

    /* ========================================================================
       CÁC HÀM CRUD TỔNG QUÁT TRÊN INDEXEDDB
       ======================================================================== */
    async get(storeName, key) {
      return transaction(storeName, 'readonly', (store) => store.get(key));
    },

    async getAll(storeName) {
      return transaction(storeName, 'readonly', (store) => store.getAll());
    },

    async put(storeName, item) {
      return transaction(storeName, 'readwrite', (store) => store.put(item));
    },

    async delete(storeName, key) {
      return transaction(storeName, 'readwrite', (store) => store.delete(key));
    },

    async clearStore(storeName) {
      return transaction(storeName, 'readwrite', (store) => store.clear());
    },

    /* ========================================================================
       TRUY VẤN NÂNG CAO CHO TIN NHẮN
       ======================================================================== */
    async getMessagesByChat(chatId, topicId = null) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('chatId');
        const request = index.getAll(chatId);

        request.onsuccess = () => {
          let messages = request.result || [];
          if (topicId) {
            messages = messages.filter(m => m.topicId === topicId);
          }
          // Sắp xếp theo thời gian tăng dần
          messages.sort((a, b) => a.createdAt - b.createdAt);
          resolve(messages);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    },

    async getStarredMessages() {
      const all = await this.getAll('messages');
      return all.filter(m => m.starred).sort((a, b) => b.createdAt - a.createdAt);
    },

    /* ========================================================================
       CÀI ĐẶT & LOCALSTORAGE
       ======================================================================== */
    getSetting(key, defaultValue = null) {
      try {
        const val = localStorage.getItem(`qc_setting_${key}`);
        return val !== null ? JSON.parse(val) : defaultValue;
      } catch {
        return defaultValue;
      }
    },

    setSetting(key, value) {
      try {
        localStorage.setItem(`qc_setting_${key}`, JSON.stringify(value));
      } catch {
        // LocalStorage có thể bị giới hạn hoặc vô hiệu hóa
      }
    },

    getCurrentUserId() {
      return this.getSetting('current_user_id', 'user_me');
    },

    setCurrentUserId(userId) {
      this.setSetting('current_user_id', userId);
    },

    getDraft(chatId) {
      return this.getSetting(`draft_${chatId}`, '');
    },

    setDraft(chatId, text) {
      if (!text || text.trim() === '') {
        localStorage.removeItem(`qc_setting_draft_${chatId}`);
      } else {
        this.setSetting(`draft_${chatId}`, text);
      }
    },

    /* ========================================================================
       ƯỚC LƯỢNG VÀ QUẢN LÝ DUNG LƯỢNG BỘ NHỚ
       ======================================================================== */
    async estimateStorageUsage() {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        return {
          usage: est.usage || 0,
          quota: est.quota || 0,
          usageFormatted: Utils.formatFileSize(est.usage || 0),
          quotaFormatted: Utils.formatFileSize(est.quota || 0)
        };
      }
      return { usage: 0, quota: 0, usageFormatted: '0 B', quotaFormatted: 'Không rõ' };
    },

    /**
     * Dọn dẹp cache tệp đính kèm không cần thiết
     */
    async cleanAttachmentCache() {
      await this.clearStore('attachments');
    },

    /**
     * Xoá toàn bộ dữ liệu ứng dụng về trạng thái xuất xưởng
     */
    async resetAllData() {
      const stores = ['users', 'chats', 'messages', 'attachments', 'links', 'todos', 'folders'];
      for (const st of stores) {
        await this.clearStore(st);
      }
      localStorage.clear();
      await this.seedInitialData();
    },

    /* ========================================================================
       DỮ LIỆU MẪU SINH ĐỘNG (SEED INITIAL DATA)
       ======================================================================== */
    async seedInitialData() {
      const now = Date.now();

      // Danh sách người dùng cục bộ
      const users = [
        {
          id: 'user_me',
          name: 'Tôi (Dương)',
          avatar: '',
          color: '#5b6cff',
          status: 'online',
          statusText: 'Đang xây dựng QuickChat 🚀',
          createdAt: now - 86400000 * 30
        },
        {
          id: 'user_minh',
          name: 'Nguyễn Minh (Lead)',
          avatar: '',
          color: '#10b981',
          status: 'online',
          statusText: 'Review PR & Sprint Planning',
          createdAt: now - 86400000 * 20
        },
        {
          id: 'user_mai',
          name: 'Trần Mai (Designer)',
          avatar: '',
          color: '#f43f5e',
          status: 'away',
          statusText: 'Figma update v3.4 🎨',
          createdAt: now - 86400000 * 15
        },
        {
          id: 'user_hoang',
          name: 'Lê Hoàng (Dev)',
          avatar: '',
          color: '#f59e0b',
          status: 'offline',
          statusText: 'Offline - Gặp lại ngày mai',
          createdAt: now - 86400000 * 10
        },
        {
          id: 'user_bot',
          name: 'QuickBot (Trợ lý AI)',
          avatar: '',
          color: '#8b5cf6',
          status: 'online',
          statusText: 'Tự động phản hồi & Hỗ trợ công việc 🤖',
          createdAt: now - 86400000 * 60
        }
      ];

      for (const u of users) {
        await this.put('users', u);
      }

      // Danh mục nhóm
      const chats = [
        {
          id: 'chat_group_phoenix',
          type: 'group',
          name: 'Team Dự Án Phoenix 🔥',
          avatar: '',
          color: '#5b6cff',
          members: ['user_me', 'user_minh', 'user_mai', 'user_hoang', 'user_bot'],
          roles: { user_minh: 'owner', user_me: 'admin', user_mai: 'member', user_hoang: 'member', user_bot: 'member' },
          topics: [
            { id: 'topic_general', name: 'chung', order: 1 },
            { id: 'topic_docs', name: 'tài-liệu', order: 2 },
            { id: 'topic_links', name: 'link-tham-khảo', order: 3 },
            { id: 'topic_announcements', name: 'thông-báo', order: 4 }
          ],
          pinned: true,
          muted: false,
          archived: false,
          folder: 'Công việc',
          unread: 2,
          lastMessageId: 'msg_phoenix_4',
          createdAt: now - 86400000 * 7
        },
        {
          id: 'chat_saved_notes',
          type: 'self',
          name: 'Ghi Chú Của Tôi ⭐',
          avatar: '',
          color: '#eab308',
          members: ['user_me'],
          pinned: true,
          muted: false,
          archived: false,
          folder: 'Cá nhân',
          unread: 0,
          lastMessageId: 'msg_saved_1',
          createdAt: now - 86400000 * 30
        },
        {
          id: 'chat_direct_bot',
          type: 'direct',
          name: 'QuickBot (Trợ lý AI)',
          avatar: '',
          color: '#8b5cf6',
          members: ['user_me', 'user_bot'],
          pinned: false,
          muted: false,
          archived: false,
          folder: 'Công việc',
          unread: 0,
          lastMessageId: 'msg_bot_2',
          createdAt: now - 86400000 * 5
        },
        {
          id: 'chat_direct_mai',
          type: 'direct',
          name: 'Trần Mai (Designer)',
          avatar: '',
          color: '#f43f5e',
          members: ['user_me', 'user_mai'],
          pinned: false,
          muted: false,
          archived: false,
          folder: 'Công việc',
          unread: 1,
          lastMessageId: 'msg_mai_2',
          createdAt: now - 86400000 * 3
        },
        {
          id: 'chat_group_family',
          type: 'group',
          name: 'Gia Đình Thân Yêu 🏡',
          avatar: '',
          color: '#10b981',
          members: ['user_me', 'user_minh', 'user_mai'],
          roles: { user_me: 'owner', user_minh: 'member', user_mai: 'member' },
          topics: [
            { id: 'topic_family_main', name: 'chuyện-nhà', order: 1 },
            { id: 'topic_family_weekend', name: 'kế-hoạch-cuối-tuần', order: 2 }
          ],
          pinned: false,
          muted: false,
          archived: false,
          folder: 'Gia đình',
          unread: 0,
          lastMessageId: 'msg_family_1',
          createdAt: now - 86400000 * 14
        }
      ];

      for (const c of chats) {
        await this.put('chats', c);
      }

      // Tin nhắn mẫu sinh động
      const messages = [
        // Nhóm Phoenix
        {
          id: 'msg_phoenix_1',
          chatId: 'chat_group_phoenix',
          topicId: 'topic_general',
          senderId: 'user_minh',
          type: 'text',
          text: 'Chào cả team! Bản thiết kế và đặc tả kỹ thuật cho **QuickChat Web App** đã hoàn thiện trên Figma.',
          attachments: [],
          reactions: { '👍': ['user_me', 'user_mai'] },
          status: 'read',
          pinned: true,
          starred: false,
          createdAt: now - 3600000 * 4
        },
        {
          id: 'msg_phoenix_2',
          chatId: 'chat_group_phoenix',
          topicId: 'topic_general',
          senderId: 'user_mai',
          type: 'text',
          text: 'Mình vừa cập nhật hệ thống Design Tokens và bộ icon SVG inline trong kho link: https://github.com/quickchat-app',
          attachments: [],
          reactions: { '❤️': ['user_me'] },
          status: 'read',
          pinned: false,
          starred: true,
          createdAt: now - 3600000 * 3
        },
        {
          id: 'msg_phoenix_3',
          chatId: 'chat_group_phoenix',
          topicId: 'topic_general',
          senderId: 'user_me',
          type: 'poll',
          text: 'Bình chọn giao diện mặc định cho phiên bản phát hành đầu tiên:',
          poll: {
            question: 'Bạn thích giao diện màu chủ đạo nào nhất?',
            options: [
              { id: 'opt_1', text: 'Xanh Tím Hiện Đại (#5b6cff)', votes: ['user_me', 'user_minh'] },
              { id: 'opt_2', text: 'Xanh Ngọc Emerald (#10b981)', votes: ['user_mai'] },
              { id: 'opt_3', text: 'Tối Giản OLED Tinh Tế', votes: ['user_hoang'] }
            ],
            multiple: false
          },
          reactions: {},
          status: 'read',
          pinned: false,
          starred: false,
          createdAt: now - 3600000 * 2
        },
        {
          id: 'msg_phoenix_4',
          chatId: 'chat_group_phoenix',
          topicId: 'topic_general',
          senderId: 'user_bot',
          type: 'text',
          text: '🤖 *Thông báo tự động*: To-do list sprint tuần này đã được ghim trong mục công việc nhóm Phoenix.',
          attachments: [],
          reactions: { '✨': ['user_me'] },
          status: 'read',
          pinned: false,
          starred: false,
          createdAt: now - 1800000
        },

        // Ghi chú của tôi
        {
          id: 'msg_saved_1',
          chatId: 'chat_saved_notes',
          topicId: null,
          senderId: 'user_me',
          type: 'text',
          text: 'Ý tưởng tối ưu QuickChat: Dùng IndexedDB lưu trữ Blob offline kết hợp BroadcastChannel để đồng bộ tab siêu tốc! 💡',
          attachments: [],
          reactions: {},
          status: 'read',
          pinned: true,
          starred: true,
          createdAt: now - 86400000 * 2
        },

        // Chat với QuickBot
        {
          id: 'msg_bot_1',
          chatId: 'chat_direct_bot',
          topicId: null,
          senderId: 'user_me',
          type: 'text',
          text: 'Chào QuickBot, hướng dẫn tôi các lệnh thao tác nhanh nhé!',
          attachments: [],
          reactions: {},
          status: 'read',
          createdAt: now - 3600000
        },
        {
          id: 'msg_bot_2',
          chatId: 'chat_direct_bot',
          topicId: null,
          senderId: 'user_bot',
          type: 'text',
          text: 'Dạ chào bạn! Bạn có thể gõ `/` trong ô soạn tin để xem các lệnh:\n- `/poll` Tạo câu hỏi bình chọn\n- `/todo` Thêm việc cần làm\n- `/remind` Đặt nhắc hẹn\n- `/shrug` Gửi biểu tượng ¯\\_(ツ)_/¯\n- `/clear` Dọn màn hình chat.',
          attachments: [],
          reactions: { '👍': ['user_me'] },
          status: 'read',
          createdAt: now - 3500000
        },

        // Chat với Trần Mai
        {
          id: 'msg_mai_1',
          chatId: 'chat_direct_mai',
          topicId: null,
          senderId: 'user_me',
          type: 'text',
          text: 'Mai ơi, bảng màu Dark Mode mới dịu mắt và đẹp lắm!',
          attachments: [],
          reactions: {},
          status: 'read',
          createdAt: now - 7200000
        },
        {
          id: 'msg_mai_2',
          chatId: 'chat_direct_mai',
          topicId: null,
          senderId: 'user_mai',
          type: 'text',
          text: 'Cảm ơn anh! Em vừa điều chỉnh lại độ bo cong bubble đạt 18px để tạo cảm giác thân thiện.',
          attachments: [],
          reactions: { '❤️': ['user_me'] },
          status: 'delivered',
          createdAt: now - 3600000
        },

        // Gia đình
        {
          id: 'msg_family_1',
          chatId: 'chat_group_family',
          topicId: 'topic_family_main',
          senderId: 'user_minh',
          type: 'text',
          text: 'Cuối tuần này cả nhà về ăn cơm với ông bà nhé!',
          attachments: [],
          reactions: { '❤️': ['user_me'] },
          status: 'read',
          createdAt: now - 86400000
        }
      ];

      for (const m of messages) {
        await this.put('messages', m);
      }

      // Kho link mẫu
      const sampleLinks = [
        {
          id: 'link_1',
          url: 'https://github.com/quickchat-app',
          title: 'Kho mã nguồn dự án QuickChat Web App',
          description: 'Hệ thống chat và lưu trữ offline thuần Vanilla JavaScript, CSS3 và HTML5.',
          domain: 'github.com',
          tags: ['Mã nguồn', 'Frontend', 'VanillaJS'],
          folderId: 'Công việc',
          chatId: 'chat_group_phoenix',
          messageId: 'msg_phoenix_2',
          favorite: true,
          readLater: false,
          createdAt: now - 3600000 * 3
        },
        {
          id: 'link_2',
          url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API',
          title: 'MDN Web Docs: IndexedDB API Guide',
          description: 'Tài liệu chuẩn kiến trúc lưu trữ dữ liệu dạng đối tượng và nhị phân Blob trên trình duyệt.',
          domain: 'developer.mozilla.org',
          tags: ['Tài liệu', 'Học tập'],
          folderId: 'Học tập',
          chatId: 'chat_saved_notes',
          messageId: 'msg_saved_1',
          favorite: true,
          readLater: true,
          createdAt: now - 86400000
        }
      ];

      for (const l of sampleLinks) {
        await this.put('links', l);
      }

      // Công việc nhóm (Todos)
      const sampleTodos = [
        {
          id: 'todo_1',
          chatId: 'chat_group_phoenix',
          text: 'Hoàn thiện giao diện responsive Mobile và cử chỉ vuốt',
          done: true,
          assigneeId: 'user_me',
          dueAt: now + 86400000 * 2
        },
        {
          id: 'todo_2',
          chatId: 'chat_group_phoenix',
          text: 'Kiểm thử bộ phát âm thanh Web Audio API và ghi âm thoại',
          done: false,
          assigneeId: 'user_mai',
          dueAt: now + 86400000 * 3
        },
        {
          id: 'todo_3',
          chatId: 'chat_group_phoenix',
          text: 'Tích hợp Service Worker chạy hoàn toàn offline PWA',
          done: true,
          assigneeId: 'user_hoang',
          dueAt: now + 86400000 * 1
        }
      ];

      for (const t of sampleTodos) {
        await this.put('todos', t);
      }

      if (window.FirebaseBridge) {
        for (const c of chats) {
          if (typeof window.FirebaseBridge.sendCloudChat === 'function') {
            await window.FirebaseBridge.sendCloudChat(c);
          }
        }
        for (const m of messages) {
          if (typeof window.FirebaseBridge.sendCloudMessage === 'function') {
            await window.FirebaseBridge.sendCloudMessage(m);
          }
        }
        for (const l of sampleLinks) {
          if (typeof window.FirebaseBridge.sendCloudLink === 'function') {
            await window.FirebaseBridge.sendCloudLink(l);
          }
        }
        for (const t of sampleTodos) {
          if (typeof window.FirebaseBridge.sendCloudTodo === 'function') {
            await window.FirebaseBridge.sendCloudTodo(t);
          }
        }
      }
    }
  };
})();
