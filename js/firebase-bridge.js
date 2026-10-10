/**
 * ==========================================================================
 * QUICKCHAT - FIREBASE BRIDGE (REBUILT WITH ON-SCREEN DEBUGGER)
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

// --- ON-SCREEN DEBUGGER ---
function logDebug(msg, isError = false) {
  console[isError ? 'error' : 'log'](msg);
  let panel = document.getElementById('firebase-debug-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'firebase-debug-panel';
    panel.style.cssText = 'position:fixed;bottom:10px;left:10px;width:320px;height:200px;background:rgba(0,0,0,0.85);color:#0f0;font-family:monospace;font-size:11px;padding:10px;overflow-y:auto;z-index:99999;border-radius:8px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    document.body.appendChild(panel);
  }
  const line = document.createElement('div');
  line.style.color = isError ? '#ff4444' : '#00ff00';
  line.style.marginBottom = '4px';
  line.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
  line.style.paddingBottom = '2px';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

// --- FIREBASE INIT ---
let app = null, db = null, auth = null;

try {
  logDebug('Đang khởi tạo Firebase...');
  if (typeof firebase !== 'undefined') {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    logDebug('Firebase Core & Firestore OK.');
    
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        logDebug(`Auth hợp lệ: ${user.uid}`);
        localStorage.setItem('qc_setting_current_user_id', JSON.stringify(user.uid));
        window.dispatchEvent(new CustomEvent('firebaseBridgeAuthReady', { detail: user }));
      } else {
        logDebug('Chưa Auth, đang thử ẩn danh...');
        auth.signInAnonymously().catch((err) => {
          logDebug(`LỖI AUTH: ${err.message}`, true);
          alert('Firebase Auth Lỗi: ' + err.message);
        });
      }
    });
  } else {
    logDebug('LỖI: firebase SDK không tồn tại!', true);
  }
} catch (err) {
  logDebug(`LỖI INIT: ${err.message}`, true);
}

const FirebaseBridge = {
  isAvailable: !!db,
  
  onAuthStateChanged(cb) {
    if (!auth) return;
    auth.onAuthStateChanged(cb);
  },

  async sendCloudMessage(message) {
    if (!db) return;
    try {
      logDebug(`Đang gửi tin nhắn: ${message.id}...`);
      const payload = { ...message };
      if (auth && auth.currentUser) {
        payload.senderId = auth.currentUser.uid;
      }
      await db.collection('messages').doc(message.id).set(payload, { merge: true });
      logDebug(`Gửi tin nhắn OK: ${message.id}`);
    } catch (err) {
      logDebug(`LỖI gửi tin nhắn: ${err.message}`, true);
    }
  },

  async sendCloudChat(chat) {
    if (!db) return;
    try {
      logDebug(`Đang tạo/cập nhật chat: ${chat.id}...`);
      await db.collection('chats').doc(chat.id).set(chat, { merge: true });
      logDebug(`Cập nhật chat OK: ${chat.id}`);
    } catch (err) {
      logDebug(`LỖI gửi chat: ${err.message}`, true);
    }
  },

  listenAllCloudChats(onUpdate) {
    if (!db) return;
    logDebug('Bắt đầu lắng nghe Chats...');
    return db.collection('chats').onSnapshot((snap) => {
      const arr = [];
      snap.forEach(d => arr.push(d.data()));
      logDebug(`Nhận ${arr.length} chats từ Cloud.`);
      onUpdate(arr);
    }, (err) => {
      logDebug(`LỖI nghe Chats: ${err.message}`, true);
    });
  },

  listenAllCloudMessages(onUpdate) {
    if (!db) return;
    logDebug('Bắt đầu lắng nghe Messages...');
    return db.collection('messages').onSnapshot((snap) => {
      const arr = [];
      snap.forEach(d => arr.push(d.data()));
      arr.sort((a, b) => a.createdAt - b.createdAt);
      logDebug(`Nhận ${arr.length} messages từ Cloud.`);
      onUpdate(arr);
    }, (err) => {
      logDebug(`LỖI nghe Messages: ${err.message}`, true);
    });
  }
};

window.FirebaseBridge = FirebaseBridge;
logDebug('Cầu nối Firebase Bridge sẵn sàng.');
