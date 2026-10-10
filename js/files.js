/**
 * ==========================================================================
 * QUICKCHAT - FILES.JS
 * Xử lý Tệp, Nén ảnh Canvas, Lưu trữ Blob IndexedDB, Kéo thả & Dán clipboard,
 * và Tab Thư viện tệp (File Library) toàn diện.
 * ==========================================================================
 */

const Files = (() => {
  return {
    /**
     * Xử lý danh sách file được chọn và mở modal xem trước trước khi gửi
     */
    async handleFileSelection(fileList, chatId, topicId, onSendFiles) {
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);
      const processedFiles = [];

      for (const file of files) {
        const isImage = file.type.startsWith('image/');
        let previewUrl = '';
        let width = null;
        let height = null;

        if (isImage) {
          const comp = await Utils.compressImage(file);
          previewUrl = comp.dataUrl;
          width = comp.width;
          height = comp.height;
        }

        processedFiles.push({
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          isImage,
          previewUrl,
          width,
          height
        });
      }

      this.showUploadPreviewModal(processedFiles, (caption) => {
        if (typeof onSendFiles === 'function') {
          onSendFiles(processedFiles, caption);
        }
      });
    },

    /**
     * Hộp thoại xem trước nhiều tệp trước khi gửi
     */
    showUploadPreviewModal(fileItems, onConfirm) {
      let items = [...fileItems];

      const renderList = () => {
        return items.map((item, idx) => `
          <div class="upload-preview-item" style="
            display: flex; align-items: center; gap: 10px; padding: 8px 10px;
            background: var(--bg-hover); border-radius: var(--radius-md); margin-bottom: 6px;
          ">
            ${item.isImage 
              ? `<img src="${item.previewUrl}" style="width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius-sm);" />`
              : `<div class="doc-icon" style="width: 40px; height: 40px; font-size: 16px;">📄</div>`
            }
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: var(--font-size-sm); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${Utils.escapeHTML(item.name)}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${Utils.formatFileSize(item.size)}</div>
            </div>
            <button class="remove-upload-item-btn" data-idx="${idx}" style="color: var(--color-danger); padding: 4px;" title="Bỏ tệp">✕</button>
          </div>
        `).join('');
      };

      const content = document.createElement('div');
      content.innerHTML = `
        <div id="upload-preview-list" style="max-height: 240px; overflow-y: auto; margin-bottom: 12px;">
          ${renderList()}
        </div>
        <div>
          <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">CHÚ THÍCH (CAPTION)</label>
          <input type="text" id="upload-caption-input" placeholder="Nhập lời nhắn kèm tệp..." style="
            width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
            background: var(--bg-input); border: 1px solid var(--border-color);
            font-size: var(--font-size-sm); color: var(--text-main);
          " />
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary modal-cancel-btn">Hủy bỏ</button>
        <button class="btn btn-primary modal-send-btn">Gửi ${items.length} tệp</button>
      `;

      const modal = UI.modal({
        title: 'Xem trước tệp gửi',
        content,
        footer,
        maxWidth: '460px'
      });

      const bindEvents = () => {
        content.querySelectorAll('.remove-upload-item-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            items.splice(idx, 1);
            if (items.length === 0) {
              UI.closeModal();
              return;
            }
            content.querySelector('#upload-preview-list').innerHTML = renderList();
            modal.querySelector('.modal-send-btn').textContent = `Gửi ${items.length} tệp`;
            bindEvents();
          });
        });
      };
      bindEvents();

      modal.querySelector('.modal-cancel-btn').addEventListener('click', () => UI.closeModal());
      modal.querySelector('.modal-send-btn').addEventListener('click', () => {
        const caption = content.querySelector('#upload-caption-input').value.trim();
        UI.closeModal();
        if (onConfirm) onConfirm(caption);
      });
    },

    /**
     * Dựng thẻ tệp đính kèm trong danh sách tin nhắn
     */
    renderAttachmentElement(att) {
      if (att.mime && att.mime.startsWith('image/')) {
        return `
          <div class="media-grid-item" onclick="UI.openLightbox('${att.dataUrl || att.url}', 'image', '${Utils.escapeHTML(att.name)}')">
            <img src="${att.dataUrl || att.url}" alt="${Utils.escapeHTML(att.name)}" loading="lazy" />
          </div>
        `;
      }
      if (att.mime && att.mime.startsWith('video/')) {
        return `
          <div class="media-grid-item" onclick="UI.openLightbox('${att.dataUrl || att.url}', 'video', '${Utils.escapeHTML(att.name)}')">
            <video src="${att.dataUrl || att.url}"></video>
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.35);">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: #ffffff; color: var(--color-primary); display: flex; align-items: center; justify-content: center;">▶</div>
            </div>
          </div>
        `;
      }
      return `
        <div class="doc-card">
          <div class="doc-icon">📁</div>
          <div class="doc-info">
            <div class="doc-name">${Utils.escapeHTML(att.name)}</div>
            <div class="doc-size">${Utils.formatFileSize(att.size)}</div>
          </div>
          <div class="doc-actions">
            <a href="${att.dataUrl || att.url || '#'}" download="${Utils.escapeHTML(att.name)}" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;">Tải về</a>
          </div>
        </div>
      `;
    },

    /**
     * Dựng nội dung cho Tab 📁 Thư viện File
     */
    async renderFileLibraryView(container) {
      const messages = await Storage.getAll('messages');
      const allAttachments = [];

      messages.forEach(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          msg.attachments.forEach(att => {
            allAttachments.push({
              ...att,
              chatId: msg.chatId,
              messageId: msg.id,
              createdAt: msg.createdAt
            });
          });
        }
      });

      // Sắp xếp theo ngày giảm dần
      allAttachments.sort((a, b) => b.createdAt - a.createdAt);

      container.innerHTML = `
        <div style="padding: 20px; max-width: 1100px; margin: 0 auto; width: 100%;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: var(--font-size-2xl); font-weight: 700;">📁 Thư Viện Tệp</h2>
              <p style="font-size: var(--font-size-sm); color: var(--text-muted);">Tổng hợp hình ảnh, tài liệu và phương tiện từ tất cả hội thoại.</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="lib-search-input" placeholder="Tìm tên tệp..." style="
                padding: 8px 14px; border-radius: var(--radius-md); background: var(--bg-card);
                border: 1px solid var(--border-color); font-size: var(--font-size-sm); color: var(--text-main);
              " />
            </div>
          </div>

          <div style="display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px;">
            <button class="filter-pill active" data-type="all">Tất cả (${allAttachments.length})</button>
            <button class="filter-pill" data-type="image">Hình ảnh</button>
            <button class="filter-pill" data-type="video">Video</button>
            <button class="filter-pill" data-type="doc">Tài liệu</button>
          </div>

          <div id="file-lib-grid" style="
            display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px;
          ">
            ${this.buildFileGridItems(allAttachments)}
          </div>
        </div>
      `;

      // Xử lý bộ lọc loại tệp
      container.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const type = pill.dataset.type;
          let filtered = allAttachments;
          if (type === 'image') filtered = allAttachments.filter(a => a.mime && a.mime.startsWith('image/'));
          else if (type === 'video') filtered = allAttachments.filter(a => a.mime && a.mime.startsWith('video/'));
          else if (type === 'doc') filtered = allAttachments.filter(a => !a.mime || (!a.mime.startsWith('image/') && !a.mime.startsWith('video/')));
          
          container.querySelector('#file-lib-grid').innerHTML = this.buildFileGridItems(filtered);
        });
      });

      // Xử lý tìm kiếm tên tệp
      const searchInput = container.querySelector('#lib-search-input');
      searchInput.addEventListener('input', () => {
        const query = Utils.removeVietnameseDiacritics(searchInput.value.trim());
        const filtered = allAttachments.filter(a => Utils.removeVietnameseDiacritics(a.name).includes(query));
        container.querySelector('#file-lib-grid').innerHTML = this.buildFileGridItems(filtered);
      });
    },

    buildFileGridItems(list) {
      if (list.length === 0) {
        return `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 8px;">📂</div>
            <div>Chưa có tệp nào phù hợp.</div>
          </div>
        `;
      }

      return list.map(item => {
        const isImage = item.mime && item.mime.startsWith('image/');
        return `
          <div class="file-card" style="
            background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color);
            overflow: hidden; display: flex; flex-direction: column; transition: transform var(--transition-fast);
          ">
            <div style="height: 120px; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; cursor: pointer;"
                 onclick="${isImage ? `UI.openLightbox('${item.dataUrl || item.url}', 'image', '${Utils.escapeHTML(item.name)}')` : ''}">
              ${isImage
                ? `<img src="${item.dataUrl || item.url}" style="width: 100%; height: 100%; object-fit: cover;" />`
                : `<div style="font-size: 36px;">📄</div>`
              }
            </div>
            <div style="padding: 10px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
              <div style="font-size: var(--font-size-xs); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${Utils.escapeHTML(item.name)}">
                ${Utils.escapeHTML(item.name)}
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--text-dim);">
                <span>${Utils.formatFileSize(item.size)}</span>
                <a href="${item.dataUrl || item.url || '#'}" download="${Utils.escapeHTML(item.name)}" style="color: var(--color-primary); font-weight: 600;">Tải</a>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  };
})();
