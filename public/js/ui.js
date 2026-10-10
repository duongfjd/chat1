/**
 * ==========================================================================
 * QUICKCHAT - UI.JS
 * Trình dựng giao diện, Hộp thoại Modal, Toast thông báo, Bottom Sheet mobile,
 * Lightbox xem ảnh/video toàn màn hình, và Helpers sinh phần tử DOM.
 * ==========================================================================
 */

const UI = (() => {
  let activeModal = null;

  return {
    /**
     * Hiển thị Toast thông báo nhẹ nhàng ở góc màn hình
     */
    toast(message, type = 'info', duration = 3200) {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }

      const toastEl = document.createElement('div');
      toastEl.className = `toast toast-${type}`;

      let icon = 'ℹ️';
      if (type === 'success') icon = '✅';
      if (type === 'error') icon = '⚠️';
      if (type === 'warning') icon = '🔔';

      toastEl.innerHTML = `<span>${icon}</span> <span>${Utils.escapeHTML(message)}</span>`;
      container.appendChild(toastEl);

      setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(10px)';
        toastEl.style.transition = 'all 0.25s ease';
        setTimeout(() => toastEl.remove(), 250);
      }, duration);
    },

    /**
     * Mở hộp thoại Modal chuẩn với Focus Trap và phím ESC
     */
    modal({ title, content, footer, onClose, maxWidth = '480px' }) {
      this.closeModal();

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active';
      overlay.id = 'active-modal-overlay';

      const card = document.createElement('div');
      card.className = 'modal-card';
      card.style.maxWidth = maxWidth;

      card.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">${Utils.escapeHTML(title)}</h3>
          <button class="composer-action-btn modal-close-btn" aria-label="Đóng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body"></div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      `;

      const bodyEl = card.querySelector('.modal-body');
      if (typeof content === 'string') {
        bodyEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        bodyEl.appendChild(content);
      }

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      activeModal = overlay;

      const handleClose = () => {
        this.closeModal();
        if (typeof onClose === 'function') onClose();
      };

      card.querySelector('.modal-close-btn').addEventListener('click', handleClose);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleClose();
      });

      // Lắng nghe phím ESC
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          handleClose();
          document.removeEventListener('keydown', onKeyDown);
        }
      };
      document.addEventListener('keydown', onKeyDown);

      return overlay;
    },

    /**
     * Đóng modal đang mở
     */
    closeModal() {
      if (activeModal) {
        activeModal.classList.remove('active');
        setTimeout(() => {
          if (activeModal && activeModal.parentNode) {
            activeModal.parentNode.removeChild(activeModal);
          }
          activeModal = null;
        }, 180);
      }
    },

    /**
     * Hộp thoại xác nhận 2 bước bằng Promise
     */
    async confirm({ title = 'Xác nhận', message, confirmText = 'Đồng ý', cancelText = 'Hủy bỏ', isDanger = false }) {
      return new Promise((resolve) => {
        const content = `<p style="font-size: var(--font-size-base); color: var(--text-muted); line-height: 1.5;">${Utils.escapeHTML(message)}</p>`;
        const footer = `
          <button class="btn btn-secondary modal-cancel-btn">${Utils.escapeHTML(cancelText)}</button>
          <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} modal-confirm-btn">${Utils.escapeHTML(confirmText)}</button>
        `;

        const modal = this.modal({
          title,
          content,
          footer,
          onClose: () => resolve(false)
        });

        modal.querySelector('.modal-cancel-btn').addEventListener('click', () => {
          this.closeModal();
          resolve(false);
        });

        modal.querySelector('.modal-confirm-btn').addEventListener('click', () => {
          this.closeModal();
          resolve(true);
        });
      });
    },

    /**
     * Mở Bottom Sheet ngữ cảnh cho Mobile (Hành động tin nhắn, menu lựa chọn)
     */
    bottomSheet({ title = '', items = [] }) {
      let sheetOverlay = document.getElementById('active-bottom-sheet');
      if (sheetOverlay) sheetOverlay.remove();

      sheetOverlay = document.createElement('div');
      sheetOverlay.id = 'active-bottom-sheet';
      sheetOverlay.className = 'modal-overlay active';
      sheetOverlay.style.alignItems = 'flex-end';
      sheetOverlay.style.padding = '0';

      const sheetContent = document.createElement('div');
      sheetContent.className = 'modal-card';
      sheetContent.style.maxWidth = '100vw';
      sheetContent.style.borderRadius = 'var(--radius-xl) var(--radius-xl) 0 0';
      sheetContent.style.padding = '12px 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px';
      sheetContent.style.transform = 'translateY(0)';

      let listHtml = items.map((it, idx) => `
        <button class="sheet-action-item" data-idx="${idx}" style="
          width: 100%; display: flex; align-items: center; gap: 14px;
          padding: 12px 14px; border-radius: var(--radius-md);
          font-size: var(--font-size-base); font-weight: 500;
          color: ${it.isDanger ? 'var(--color-danger)' : 'var(--text-main)'};
          text-align: left;
        ">
          <span style="font-size: 18px;">${it.icon || '•'}</span>
          <span>${Utils.escapeHTML(it.label)}</span>
        </button>
      `).join('');

      sheetContent.innerHTML = `
        <div style="width: 36px; height: 4px; background: var(--border-color); border-radius: 4px; margin: 4px auto 14px auto;"></div>
        ${title ? `<div style="font-weight: 700; font-size: var(--font-size-md); margin-bottom: 8px; padding-left: 6px;">${Utils.escapeHTML(title)}</div>` : ''}
        <div style="display: flex; flex-direction: column; gap: 4px;">${listHtml}</div>
      `;

      sheetOverlay.appendChild(sheetContent);
      document.body.appendChild(sheetOverlay);

      const closeSheet = () => {
        sheetOverlay.classList.remove('active');
        setTimeout(() => sheetOverlay.remove(), 200);
      };

      sheetOverlay.addEventListener('click', (e) => {
        if (e.target === sheetOverlay) closeSheet();
      });

      sheetContent.querySelectorAll('.sheet-action-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          closeSheet();
          if (items[idx] && typeof items[idx].action === 'function') {
            items[idx].action();
          }
        });
      });
    },

    /**
     * Mở Lightbox xem toàn màn hình cho ảnh/video
     */
    openLightbox(src, type = 'image', title = '') {
      let lightbox = document.getElementById('lightbox');
      if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox';
        document.body.appendChild(lightbox);
      }

      lightbox.innerHTML = `
        <div class="lightbox-toolbar">
          <a href="${src}" download="${title || 'quickchat_file'}" class="composer-action-btn" style="color: #fff;" title="Tải về">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </a>
          <button class="composer-action-btn lightbox-close-btn" style="color: #fff;" title="Đóng">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        ${type === 'video' 
          ? `<video src="${src}" class="lightbox-content" controls autoplay></video>`
          : `<img src="${src}" class="lightbox-content" alt="${Utils.escapeHTML(title)}" />`
        }
      `;

      lightbox.classList.add('active');

      const closeLb = () => {
        lightbox.classList.remove('active');
      };

      lightbox.querySelector('.lightbox-close-btn').addEventListener('click', closeLb);
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLb();
      });

      const onEsc = (e) => {
        if (e.key === 'Escape') {
          closeLb();
          document.removeEventListener('keydown', onEsc);
        }
      };
      document.addEventListener('keydown', onEsc);
    },

    /**
     * Dựng thẻ Avatar HTML chuẩn cho Người dùng hoặc Nhóm
     */
    renderAvatar(item, size = 'md') {
      const name = item.name || 'QuickChat';
      const color = item.color || Utils.getAvatarColor(name);
      const initials = Utils.getInitials(name);
      const status = item.status || 'offline';

      let innerContent = initials;
      if (item.avatar) {
        innerContent = `<img src="${item.avatar}" alt="${Utils.escapeHTML(name)}" />`;
      }

      const showBadge = item.type !== 'group' && item.type !== 'self';

      return `
        <div class="avatar avatar-${size}" style="background-color: ${color};" title="${Utils.escapeHTML(name)}">
          ${innerContent}
          ${showBadge ? `<span class="avatar-badge ${status}"></span>` : ''}
        </div>
      `;
    },

    /**
     * Dựng biểu tượng trạng thái gửi (đang gửi, đã gửi, đã nhận, đã xem)
     */
    renderTick(status) {
      if (status === 'sending') {
        return `<span class="tick-icon" title="Đang gửi">🕒</span>`;
      }
      if (status === 'sent') {
        return `
          <span class="tick-icon" title="Đã gửi">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        `;
      }
      if (status === 'delivered') {
        return `
          <span class="tick-icon" title="Đã nhận">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="18 6 9 17 4 12"></polyline>
              <polyline points="22 10 13 21 8 16"></polyline>
            </svg>
          </span>
        `;
      }
      if (status === 'read') {
        return `
          <span class="tick-icon tick-read" title="Đã xem">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="18 6 9 17 4 12"></polyline>
              <polyline points="22 10 13 21 8 16"></polyline>
            </svg>
          </span>
        `;
      }
      return '';
    }
  };
})();
