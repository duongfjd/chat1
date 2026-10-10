/**
 * ==========================================================================
 * QUICKCHAT - TRANSPORT.JS
 * Lớp mạng trừu tượng: Đồng bộ tab bằng BroadcastChannel (fallback storage),
 * Giao diện send() / onMessage(), và Trợ lý tự động QuickBot thông minh.
 * ==========================================================================
 */

const Transport = (() => {
  const CHANNEL_NAME = 'quickchat_broadcast_v1';
  let channel = null;
  const listeners = new Map();

  // Khởi tạo BroadcastChannel nếu trình duyệt hỗ trợ
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        handleIncomingEvent(event.data);
      };
    } else {
      // Fallback bằng Storage event cho các trình duyệt cũ
      window.addEventListener('storage', (e) => {
        if (e.key === 'qc_broadcast_fallback' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            handleIncomingEvent(data);
          } catch {
            // bỏ qua
          }
        }
      });
    }
  } catch {
    // Không hỗ trợ BroadcastChannel
  }

  const handleIncomingEvent = (eventData) => {
    if (!eventData || !eventData.type) return;

    // Kích hoạt tất cả hàm đăng ký lắng nghe
    const callbacks = listeners.get(eventData.type) || [];
    callbacks.forEach(cb => {
      try {
        cb(eventData.payload, eventData);
      } catch (err) {
        console.error('Lỗi khi xử lý sự kiện transport:', err);
      }
    });

    // Lắng nghe chung wildcard
    const wildcardCallbacks = listeners.get('*') || [];
    wildcardCallbacks.forEach(cb => {
      try {
        cb(eventData);
      } catch (err) {
        console.error('Lỗi wildcard transport:', err);
      }
    });
  };

  /**
   * Bộ não mô phỏng phản hồi của QuickBot (Trợ lý tự động)
   */
  const handleQuickBotAutoReply = async (message, chat) => {
    if (message.senderId === 'user_bot') return;

    // Chỉ phản hồi nếu là chat 1-1 với Bot hoặc tin nhắn trong nhóm có nhắc tới @bot / QuickBot
    const isDirectWithBot = chat.type === 'direct' && chat.members.includes('user_bot');
    const isMentionedInGroup = chat.type === 'group' && (
      message.text.toLowerCase().includes('bot') ||
      message.text.toLowerCase().includes('quickbot') ||
      message.text.startsWith('/')
    );

    if (!isDirectWithBot && !isMentionedInGroup) return;

    // 1. Gửi tín hiệu Bot đang gõ...
    Transport.emit('TYPING', {
      chatId: chat.id,
      userId: 'user_bot',
      userName: 'QuickBot (Trợ lý AI)',
      isTyping: true
    });

    // 2. Độ trễ ngẫu nhiên mô phỏng suy nghĩ thực tế (800ms - 1300ms)
    setTimeout(async () => {
      // Tắt trạng thái đang gõ
      Transport.emit('TYPING', {
        chatId: chat.id,
        userId: 'user_bot',
        userName: 'QuickBot',
        isTyping: false
      });

      const text = message.text.trim();
      let botResponse = '';

      if (text.startsWith('/shrug')) {
        botResponse = '¯\\_(ツ)_/¯';
      } else if (text.startsWith('/poll')) {
        botResponse = '💡 Bạn có thể dùng nút biểu tượng Bình chọn ở góc dưới hoặc gõ nội dung câu hỏi để mình hỗ trợ nhé!';
      } else if (text.startsWith('/todo')) {
        botResponse = '✅ Việc cần làm đã được ghi nhận vào danh sách công việc chung của nhóm.';
      } else if (text.startsWith('/remind')) {
        botResponse = '⏰ Đã thiết lập nhắc nhở cho bạn!';
      } else if (text.startsWith('/clear')) {
        botResponse = '🧹 Đã dọn dẹp các thông báo tạm thời.';
      } else if (text.toLowerCase().includes('chào') || text.toLowerCase().includes('hello')) {
        botResponse = 'Chào bạn! Mình là **QuickBot** 🤖. Bạn cần mình hỗ trợ tìm kiếm tài liệu, lưu link hay tạo cuộc bình chọn không?';
      } else if (text.toLowerCase().includes('link') || text.toLowerCase().includes('tài liệu')) {
        botResponse = '📚 Bạn có thể xem các đường link và tài liệu đã lưu ở thanh điều hướng bên trái (tab 📁 và 🔗). Mọi dữ liệu đều được lưu an toàn trong IndexedDB của máy bạn!';
      } else if (text.toLowerCase().includes('f5') || text.toLowerCase().includes('reload') || text.toLowerCase().includes('offline')) {
        botResponse = '⚡ QuickChat hoạt động hoàn toàn offline! Bạn có thể ngắt mạng hoặc mở thêm nhiều tab khác để thử nghiệm tính năng đồng bộ thời gian thực qua BroadcastChannel.';
      } else {
        const replies = [
          'Mình đã nhận được tin nhắn của bạn: "' + Utils.escapeHTML(text) + '". Mọi thứ đang vận hành mượt mà!',
          'Rất hay! Ý kiến này đã được lưu vào hệ thống để team tiện theo dõi.',
          'Đồng ý nhé! Cần mình tạo checklist việc cần làm cho mục này không?',
          'Tuyệt vời! Bản cập nhật mới của QuickChat đã tối ưu IndexedDB và hỗ trợ cử chỉ vuốt trên di động.'
        ];
        botResponse = replies[Math.floor(Math.random() * replies.length)];
      }

      const botMsg = {
        id: Utils.generateId('msg'),
        chatId: chat.id,
        topicId: message.topicId || null,
        senderId: 'user_bot',
        type: 'text',
        text: botResponse,
        attachments: [],
        reactions: {},
        status: 'delivered',
        pinned: false,
        starred: false,
        createdAt: Date.now()
      };

      // Lưu tin nhắn Bot vào IndexedDB
      await Storage.put('messages', botMsg);

      // Cập nhật lastMessageId của chat
      chat.lastMessageId = botMsg.id;
      await Storage.put('chats', chat);

      // Phát sự kiện tin nhắn mới tới giao diện và các tab
      Transport.emit('NEW_MESSAGE', {
        message: botMsg,
        chat: chat
      });

      // Phát âm thanh nhận tin nếu người dùng hiện tại không phải là bot
      Utils.playSound('receive');
    }, 1100);
  };

  return {
    /**
     * Phát sự kiện tới các tab và component nội bộ
     */
    emit(eventType, payload) {
      const eventData = {
        type: eventType,
        payload: payload,
        timestamp: Date.now()
      };

      // Gửi qua BroadcastChannel
      if (channel) {
        try {
          channel.postMessage(eventData);
        } catch {
          // Bỏ qua lỗi postMessage nếu kênh bị đóng
        }
      } else {
        // Fallback localStorage
        try {
          localStorage.setItem('qc_broadcast_fallback', JSON.stringify(eventData));
        } catch {
          // Bỏ qua
        }
      }

      // Tự kích hoạt cho chính tab hiện tại
      handleIncomingEvent(eventData);
    },

    /**
     * Gửi tin nhắn mới (Phương thức tiện lợi chuẩn interface)
     */
    async send(message, chat) {
      // Phát sự kiện tin nhắn mới
      this.emit('NEW_MESSAGE', { message, chat });

      // Nếu đang kết nối Firebase, đồng bộ tin nhắn và cuộc hội thoại lên Firestore Cloud
      if (window.FirebaseBridge) {
        if (typeof window.FirebaseBridge.sendCloudMessage === 'function') {
          window.FirebaseBridge.sendCloudMessage(message);
        }
        if (typeof window.FirebaseBridge.sendCloudChat === 'function') {
          window.FirebaseBridge.sendCloudChat(chat);
        }
      }

      // Gọi trợ lý ảo QuickBot phản hồi tự động nếu áp dụng
      handleQuickBotAutoReply(message, chat);
    },

    /**
     * Đăng ký lắng nghe sự kiện
     */
    on(eventType, callback) {
      if (!listeners.has(eventType)) {
        listeners.set(eventType, []);
      }
      listeners.get(eventType).push(callback);
    },

    /**
     * Hủy đăng ký lắng nghe sự kiện
     */
    off(eventType, callback) {
      if (!listeners.has(eventType)) return;
      const list = listeners.get(eventType);
      const index = list.indexOf(callback);
      if (index !== -1) {
        list.splice(index, 1);
      }
    },

    /**
     * Chuẩn hóa onMessage để dễ dàng thay bằng WebSocket / Firebase sau này
     */
    onMessage(callback) {
      this.on('NEW_MESSAGE', (payload) => {
        if (payload && payload.message) {
          callback(payload.message, payload.chat);
        }
      });
    }
  };
})();
