/**
 * ==========================================================================
 * QUICKCHAT - UTILS.JS
 * Các tiện ích dùng chung: XSS escape, Xử lý Tiếng Việt, Định dạng thời gian,
 * Âm thanh Web Audio API, Nén ảnh Canvas, QR code Canvas.
 * ==========================================================================
 */

const Utils = (() => {
  // Bộ tạo âm thanh tức thì bằng Web Audio API (không cần tải file audio)
  let audioCtx = null;
  const getAudioContext = () => {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  };

  return {
    /**
     * Tạo ID ngẫu nhiên định dạng tiền tố
     */
    generateId(prefix = 'id') {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    },

    /**
     * Chống XSS triệt để bằng cách escape ký tự HTML
     */
    escapeHTML(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /**
     * Chuẩn hoá chuỗi Tiếng Việt không dấu phục vụ tìm kiếm thông minh
     */
    removeVietnameseDiacritics(str) {
      if (!str) return '';
      return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
    },

    /**
     * Định dạng giờ phút (VD: 14:35)
     */
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    },

    /**
     * Định dạng ngày phân cách cho luồng tin nhắn (Hôm nay, Hôm qua, 10/10/2026)
     */
    formatDateDivider(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Hôm nay';
      }
      if (date.toDateString() === yesterday.toDateString()) {
        return 'Hôm qua';
      }
      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    },

    /**
     * Định dạng thời gian tương đối cho danh sách chat (14:35, T2, 05/10)
     */
    formatRelativeTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return this.formatTime(timestamp);
      }
      if (diffDays === 1) {
        return 'Hôm qua';
      }
      if (diffDays < 7) {
        const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        return days[date.getDay()];
      }
      return `${date.getDate()}/${date.getMonth() + 1}`;
    },

    /**
     * Định dạng dung lượng tệp (KB, MB, GB)
     */
    formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    /**
     * Tạo màu nền avatar cố định theo hash chuỗi tên
     */
    getAvatarColor(name) {
      const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
        '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'
      ];
      if (!name) return colors[0];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    },

    /**
     * Lấy 1-2 chữ cái đầu làm Avatar viết tắt
     */
    getInitials(name) {
      if (!name) return '?';
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    /**
     * Bộ phát âm thanh tự sinh với Web Audio API
     */
    playSound(type = 'send') {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'send') {
          // Âm gửi tin nhắn: "pop" nhẹ
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
        } else if (type === 'receive') {
          // Âm nhận tin nhắn: chuông đôi vui tai
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.08); // A5
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.22);
        } else if (type === 'reaction') {
          // Âm thả tim / react
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.06);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.start(now);
          osc.stop(now + 0.06);
        }
      } catch {
        // Trình duyệt chưa cấp quyền phát âm thanh
      }
    },

    /**
     * Nén ảnh và xuất Thumbnail bằng Canvas
     */
    async compressImage(file, maxWidth = 1280, maxHeight = 1280, quality = 0.82) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              if (width / height > maxWidth / maxHeight) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              } else {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              resolve({
                blob,
                width,
                height,
                dataUrl: canvas.toDataURL('image/jpeg', 0.6)
              });
            }, 'image/jpeg', quality);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /**
     * Parser Markdown mini an toàn (Bắt buộc escape HTML trước)
     */
    parseSafeMarkdown(rawText) {
      if (!rawText) return '';
      let text = this.escapeHTML(rawText);

      // Khối mã (Code block) ```language ... ```
      text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

      // Inline code `code`
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Đậm **text**
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Nghiêng *text*
      text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

      // Gạch ngang ~~text~~
      text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

      // Trích dẫn > quote
      text = text.replace(/^>(.*)$/gm, '<blockquote>$1</blockquote>');

      // Nhận diện link http/https an toàn
      const urlRegex = /(https?:\/\/[^\s<]+)/g;
      text = text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });

      // Xuống dòng chuyển thành <br>
      text = text.replace(/\n/g, '<br>');

      return text;
    },

    /**
     * Rút trích tất cả đường link URL từ văn bản
     */
    extractUrls(text) {
      if (!text) return [];
      const regex = /(https?:\/\/[^\s<]+)/g;
      return text.match(regex) || [];
    },

    /**
     * Lấy tên miền từ URL
     */
    extractDomain(url) {
      try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    },

    /**
     * Vẽ mã QR đơn giản trên Canvas (mô phỏng chia sẻ liên kết nhóm)
     */
    renderCanvasQR(canvas, text) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const size = canvas.width || 200;
      canvas.width = size;
      canvas.height = size;

      // Nền trắng
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      // Sinh ma trận mã QR tương đối đẹp mắt từ hash chuỗi
      const moduleCount = 25;
      const cellSize = Math.floor(size / moduleCount);
      const offset = Math.floor((size - moduleCount * cellSize) / 2);

      ctx.fillStyle = '#0f172a';

      // 3 mắt định vị QR Code góc
      const drawEye = (x, y) => {
        ctx.fillRect(offset + x * cellSize, offset + y * cellSize, 7 * cellSize, 7 * cellSize);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(offset + (x + 1) * cellSize, offset + (y + 1) * cellSize, 5 * cellSize, 5 * cellSize);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(offset + (x + 2) * cellSize, offset + (y + 2) * cellSize, 3 * cellSize, 3 * cellSize);
      };

      drawEye(0, 0);
      drawEye(moduleCount - 7, 0);
      drawEye(0, moduleCount - 7);

      // Điền các điểm data giả lập theo chuỗi
      let seed = 0;
      for (let i = 0; i < text.length; i++) {
        seed = (seed * 31 + text.charCodeAt(i)) & 0xffffffff;
      }

      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          // Bỏ qua 3 góc mắt định vị
          const inEye1 = r < 8 && c < 8;
          const inEye2 = r < 8 && c >= moduleCount - 8;
          const inEye3 = r >= moduleCount - 8 && c < 8;
          if (inEye1 || inEye2 || inEye3) continue;

          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          if (seed % 3 === 0) {
            ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
          }
        }
      }
    },

    /**
     * Sao chép văn bản vào Clipboard
     */
    async copyToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          textArea.remove();
          return true;
        } catch {
          textArea.remove();
          return false;
        }
      }
    }
  };
})();
