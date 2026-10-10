/**
 * ==========================================================================
 * QUICKCHAT - FIREBASE BRIDGE
 * Kết nối Firebase Firestore & Google Authentication cho QuickChat
 * ==========================================================================
 */

// Import stylesheet toàn bộ ứng dụng
import '../css/base.css';
import '../css/themes.css';
import '../css/layout.css';
import '../css/components.css';

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  getDocFromServer,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Khởi tạo Firebase App
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

// Kiểm tra kết nối Firestore Server theo chuẩn kỹ thuật
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('✅ Kết nối Firestore Database thành công!');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Vui lòng kiểm tra cấu hình mạng hoặc Firebase offline.");
    }
  }
}
testConnection();

// Chuẩn hóa bắt lỗi Firestore
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

// Cầu nối toàn cục Window.FirebaseBridge
let activeMessageUnsub: Unsubscribe | null = null;
let activeChatUnsub: Unsubscribe | null = null;

const FirebaseBridge = {
  isAvailable: true,
  projectId: firebaseConfig.projectId,

  getAuthUser(): FirebaseUser | null {
    return auth.currentUser;
  },

  onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(auth, (user) => {
      callback(user);
    });
  },

  async loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      const user = res.user;

      // Đồng bộ thông tin người dùng vào Firestore
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
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
      throw err;
    }
  },

  async logout() {
    return fbSignOut(auth);
  },

  async sendCloudMessage(message: any) {
    if (!auth.currentUser) return;
    try {
      const msgRef = doc(db, 'messages', message.id);
      await setDoc(msgRef, {
        ...message,
        senderId: auth.currentUser.uid,
        senderEmail: auth.currentUser.email
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `messages/${message.id}`);
    }
  },

  listenCloudMessages(chatId: string, onMessagesUpdate: (messages: any[]) => void) {
    if (activeMessageUnsub) {
      activeMessageUnsub();
      activeMessageUnsub = null;
    }

    if (!auth.currentUser) return;

    try {
      const q = query(
        collection(db, 'messages'),
        where('chatId', '==', chatId)
      );

      activeMessageUnsub = onSnapshot(q, (snapshot) => {
        const msgs: any[] = [];
        snapshot.forEach((d) => msgs.push(d.data()));
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        onMessagesUpdate(msgs);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'messages');
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'messages');
    }
  },

  stopListeningMessages() {
    if (activeMessageUnsub) {
      activeMessageUnsub();
      activeMessageUnsub = null;
    }
  }
};

(window as any).FirebaseBridge = FirebaseBridge;
