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
      // Khởi tạo dữ liệu người dùng cơ bản nếu chưa có
      const users = await this.getAll('users');
      if (!users || users.length === 0) {
        await this.seedInitialData();
      }
      // Bỏ hẳn bộ nhớ đệm cục bộ của các bảng dữ liệu đồng bộ
      // Xóa để đảm bảo luôn tải dữ liệu mới nhất từ Firebase, 
      // đồng thời xóa sạch dữ liệu mẫu cũ bị kẹt ở trình duyệt của người dùng.
      const syncStores = ['chats', 'messages', 'links', 'todos'];
      for (const st of syncStores) {
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

      // Xóa bỏ tất cả dummy data (chats, messages, links, todos) 
      // để app luôn trống trơn và chỉ lấy dữ liệu thật từ Firebase
    }
  };
})();
