/**
 * ==========================================================================
 * QUICKCHAT - FIREBASE BRIDGE (Standalone Browser Version)
 * Kết nối Firebase Firestore & Authentication hoạt động trực tiếp trên mọi trình duyệt
 * (Sử dụng Compat API để tránh lỗi CORS khi mở bằng file://)
 * ==========================================================================
 */

const firebaseConfig = {
  apiKey: "AIzaSyAU73F8fy4xckY_TW6Swqder9v1N1igVE4",
  authDomain: "quickchat-2-71087.firebaseapp.com",
  projectId: "quickchat-2-71087",
  storageBucket: "quickchat-2-71087.firebasestorage.app",
  messagingSenderId: "1018146838092",
  appId: "1:1018146838092:web:bad81824cad4c6c65286e9",
  measurementId: "G-H7M6HDY3P2"
};

// Khởi tạo Firebase
let app = null;
let db = null;
let auth = null;

try {
  if (typeof firebase !== 'undefined') {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    
    // Đăng nhập Ẩn danh mặc định nếu chưa đăng nhập Google
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        localStorage.setItem('qc_current_user_id', user.uid);
        if (window.Storage) {
          await Storage.put('users', {
            id: user.uid,
            name: user.displayName || 'Khách (Online)',
            avatar: user.photoURL || '',
            color: '#10b981',
            type: 'self'
          });
        }
      } else {
        auth.signInAnonymously().catch(() => {});
      }
    });

    console.log('🔥 Firebase Bridge đã kết nối tới dự án quickchat-2-71087 thành công!');
  } else {
    console.error('❌ Thư viện Firebase chưa được tải!');
  }
} catch (err) {
  console.error('❌ Lỗi khởi tạo Firebase:', err);
}

const FirebaseBridge = {
  isAvailable: !!db,
  projectId: firebaseConfig.projectId,

  getAuthUser() {
    return auth ? auth.currentUser : null;
  },

  onAuthStateChanged(callback) {
    if (!auth) return () => {};
    return auth.onAuthStateChanged(callback);
  },

  async loginWithGoogle() {
    if (!auth) throw new Error('Firebase Auth chưa sẵn sàng');
    const provider = new firebase.auth.GoogleAuthProvider();
    const res = await auth.signInWithPopup(provider);
    const user = res.user;

    localStorage.setItem('qc_current_user_id', user.uid);

    const userDocRef = db.collection('users').doc(user.uid);
    const userData = {
      id: user.uid,
      name: user.displayName || 'Google User',
      avatar: user.photoURL || '',
      email: user.email || '',
      color: '#5b6cff',
      status: 'online',
      statusText: 'Đã kết nối qua Google Cloud',
      createdAt: Date.now()
    };
    
    await userDocRef.set(userData, { merge: true });
    if (window.Storage) {
      await Storage.put('users', userData);
    }

    return user;
  },

  async logout() {
    if (!auth) return;
    localStorage.removeItem('qc_current_user_id');
    return auth.signOut();
  },

  async sendCloudMessage(message) {
    if (!db) return;
    try {
      const msgRef = db.collection('messages').doc(message.id);
      const payload = { ...message };
      if (auth && auth.currentUser) {
        payload.cloudSenderId = auth.currentUser.uid;
        payload.cloudSenderEmail = auth.currentUser.email;
      }
      await msgRef.set(payload, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi tin nhắn Cloud:', err);
      if (window.UI && typeof window.UI.toast === 'function' && err && err.code === 'permission-denied') {
        window.UI.toast('🔒 Vui lòng vào tab Rules trên Firebase Console mở allow read, write!', 'error');
      }
    }
  },

  async sendCloudChat(chat) {
    if (!db) return;
    try {
      const chatRef = db.collection('chats').doc(chat.id);
      await chatRef.set(chat, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi chat Cloud:', err);
      if (window.UI && typeof window.UI.toast === 'function' && err && err.code === 'permission-denied') {
        window.UI.toast('🔒 Vui lòng vào tab Rules trên Firebase Console mở allow read, write!', 'error');
      }
    }
  },

  async deleteCloudMessage(messageId) {
    if (!db) return;
    try {
      const msgRef = db.collection('messages').doc(messageId);
      await msgRef.set({ deleted: true, text: 'Tin nhắn đã bị xóa' }, { merge: true });
    } catch (err) {
      console.error('Lỗi xóa tin nhắn Cloud:', err);
    }
  },

  async sendCloudLink(link) {
    if (!db) return;
    try {
      const linkRef = db.collection('links').doc(link.id);
      await linkRef.set(link, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi link Cloud:', err);
    }
  },

  async sendCloudTodo(todo) {
    if (!db) return;
    try {
      const todoRef = db.collection('todos').doc(todo.id);
      await todoRef.set(todo, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi todo Cloud:', err);
    }
  },

  listenAllCloudChats(onChatsUpdate) {
    if (!db) return null;
    try {
      return db.collection('chats').onSnapshot((snapshot) => {
        const chats = [];
        snapshot.forEach((d) => chats.push(d.data()));
        onChatsUpdate(chats);
      }, (err) => {
        console.error('Lỗi lắng nghe Chats Cloud:', err);
        if (window.UI && typeof window.UI.toast === 'function') {
          if (err.code === 'permission-denied') {
            window.UI.toast('🔒 Lỗi quyền truy cập Firebase. Hãy mở allow read, write trong tab Rules!', 'error');
          } else {
            window.UI.toast('Lỗi Firebase: ' + err.message, 'error');
          }
        }
      });
    } catch (err) {
      console.error('Lỗi khởi tạo query Chats Cloud:', err);
      return null;
    }
  },

  listenAllCloudMessages(onMessagesUpdate) {
    if (!db) return null;
    try {
      return db.collection('messages').onSnapshot((snapshot) => {
        const msgs = [];
        snapshot.forEach((d) => msgs.push(d.data()));
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        onMessagesUpdate(msgs);
      }, (err) => {
        console.error('Lỗi lắng nghe Messages Cloud:', err);
        if (window.UI && typeof window.UI.toast === 'function') {
          if (err.code === 'permission-denied') {
            window.UI.toast('🔒 Lỗi quyền truy cập Firebase. Hãy mở allow read, write trong tab Rules!', 'error');
          } else {
            window.UI.toast('Lỗi Firebase: ' + err.message, 'error');
          }
        }
      });
    } catch (err) {
      console.error('Lỗi khởi tạo query Messages Cloud:', err);
      return null;
    }
  },

  listenAllCloudLinks(onLinksUpdate) {
    if (!db) return null;
    try {
      return db.collection('links').onSnapshot((snapshot) => {
        const links = [];
        snapshot.forEach((d) => links.push(d.data()));
        onLinksUpdate(links);
      }, (err) => {
        console.error('Lỗi lắng nghe Links Cloud:', err);
      });
    } catch (err) {
      console.error('Lỗi khởi tạo query Links Cloud:', err);
      return null;
    }
  },

  listenAllCloudTodos(onTodosUpdate) {
    if (!db) return null;
    try {
      return db.collection('todos').onSnapshot((snapshot) => {
        const todos = [];
        snapshot.forEach((d) => todos.push(d.data()));
        onTodosUpdate(todos);
      }, (err) => {
        console.error('Lỗi lắng nghe Todos Cloud:', err);
      });
    } catch (err) {
      console.error('Lỗi khởi tạo query Todos Cloud:', err);
      return null;
    }
  },

  async syncAllLocalToCloud() {
    if (!db || !window.Storage) return;
    try {
      const chats = await Storage.getAll('chats');
      for (const c of chats) {
        await this.sendCloudChat(c);
      }
      const messages = await Storage.getAll('messages');
      for (const m of messages) {
        await this.sendCloudMessage(m);
      }
      const links = await Storage.getAll('links');
      for (const l of links) {
        await this.sendCloudLink(l);
      }
      const todos = await Storage.getAll('todos');
      for (const t of todos) {
        await this.sendCloudTodo(t);
      }
      console.log('✨ Đã đồng bộ toàn bộ dữ liệu cục bộ lên Firestore Cloud!');
    } catch (err) {
      console.error('Lỗi đẩy dữ liệu lên Firestore:', err);
    }
  }
};

window.FirebaseBridge = FirebaseBridge;
window.dispatchEvent(new CustomEvent('firebaseBridgeReady', { detail: FirebaseBridge }));
