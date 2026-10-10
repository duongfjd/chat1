/**
 * ==========================================================================
 * QUICKCHAT - FIREBASE BRIDGE (Standalone Browser Version)
 * Kết nối Firebase Firestore & Authentication hoạt động trực tiếp trên mọi trình duyệt
 * ==========================================================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously,
  signOut as fbSignOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  query, 
  onSnapshot, 
  deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
  projectId: "gen-lang-client-0740689685",
  appId: "1:1015239187118:web:1265d9b4729f54e8cb2b3f",
  apiKey: "AIzaSyBYQkXM-DvJGdSrhaVXBkGhgtlBItzVVKA",
  authDomain: "gen-lang-client-0740689685.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-quickchatwebappn-a41e44ba-404a-49ba-a2f2-f36bf325f6f1",
  storageBucket: "gen-lang-client-0740689685.firebasestorage.app",
  messagingSenderId: "1015239187118"
};

// Khởi tạo Firebase
let app = null;
let db = null;
let auth = null;

try {
  app = initializeApp(firebaseConfig);
  try {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch {
    db = getFirestore(app);
  }
  auth = getAuth(app);
  signInAnonymously(auth).catch(() => {});
  console.log('🔥 Firebase Bridge đã khởi tạo thành công!');
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
    return onAuthStateChanged(auth, callback);
  },

  async loginWithGoogle() {
    if (!auth) throw new Error('Firebase Auth chưa sẵn sàng');
    const provider = new GoogleAuthProvider();
    const res = await signInWithPopup(auth, provider);
    const user = res.user;

    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, {
      id: user.uid,
      name: user.displayName || 'Google User',
      avatar: user.photoURL || '',
      email: user.email || '',
      color: '#5b6cff',
      status: 'online',
      statusText: 'Đã kết nối qua Google Cloud',
      createdAt: Date.now()
    }, { merge: true });

    return user;
  },

  async logout() {
    if (!auth) return;
    return fbSignOut(auth);
  },

  async sendCloudMessage(message) {
    if (!db) return;
    try {
      const msgRef = doc(db, 'messages', message.id);
      const payload = { ...message };
      if (auth && auth.currentUser) {
        payload.cloudSenderId = auth.currentUser.uid;
        payload.cloudSenderEmail = auth.currentUser.email;
      }
      await setDoc(msgRef, payload, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi tin nhắn Cloud:', err);
    }
  },

  async sendCloudChat(chat) {
    if (!db) return;
    try {
      const chatRef = doc(db, 'chats', chat.id);
      await setDoc(chatRef, chat, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi chat Cloud:', err);
    }
  },

  async deleteCloudMessage(messageId) {
    if (!db) return;
    try {
      const msgRef = doc(db, 'messages', messageId);
      await setDoc(msgRef, { deleted: true, text: 'Tin nhắn đã bị xóa' }, { merge: true });
    } catch (err) {
      console.error('Lỗi xóa tin nhắn Cloud:', err);
    }
  },

  async sendCloudLink(link) {
    if (!db) return;
    try {
      const linkRef = doc(db, 'links', link.id);
      await setDoc(linkRef, link, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi link Cloud:', err);
    }
  },

  async sendCloudTodo(todo) {
    if (!db) return;
    try {
      const todoRef = doc(db, 'todos', todo.id);
      await setDoc(todoRef, todo, { merge: true });
    } catch (err) {
      console.error('Lỗi gửi todo Cloud:', err);
    }
  },

  listenAllCloudChats(onChatsUpdate) {
    if (!db) return null;
    try {
      const q = query(collection(db, 'chats'));
      return onSnapshot(q, (snapshot) => {
        const chats = [];
        snapshot.forEach((d) => chats.push(d.data()));
        onChatsUpdate(chats);
      }, (err) => {
        console.error('Lỗi lắng nghe Chats Cloud:', err);
      });
    } catch (err) {
      console.error('Lỗi khởi tạo query Chats Cloud:', err);
      return null;
    }
  },

  listenAllCloudMessages(onMessagesUpdate) {
    if (!db) return null;
    try {
      const q = query(collection(db, 'messages'));
      return onSnapshot(q, (snapshot) => {
        const msgs = [];
        snapshot.forEach((d) => msgs.push(d.data()));
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        onMessagesUpdate(msgs);
      }, (err) => {
        console.error('Lỗi lắng nghe Messages Cloud:', err);
      });
    } catch (err) {
      console.error('Lỗi khởi tạo query Messages Cloud:', err);
      return null;
    }
  },

  listenAllCloudLinks(onLinksUpdate) {
    if (!db) return null;
    try {
      const q = query(collection(db, 'links'));
      return onSnapshot(q, (snapshot) => {
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
      const q = query(collection(db, 'todos'));
      return onSnapshot(q, (snapshot) => {
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
export default FirebaseBridge;
