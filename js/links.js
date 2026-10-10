/**
 * ==========================================================================
 * QUICKCHAT - LINKS.JS
 * Kho liên kết (Links Repository): Tự động gom link từ tin nhắn,
 * Thêm link thủ công, Phân loại Thư mục/Tag, Xem trước Card, Xuất/Nhập JSON.
 * ==========================================================================
 */

const Links = (() => {
  return {
    /**
     * Tự động quét và lưu đường link từ tin nhắn mới vào kho
     */
    async indexLinksFromMessage(message, chat) {
      const urls = Utils.extractUrls(message.text);
      if (urls.length === 0) return;

      for (const url of urls) {
        // Kiểm tra xem link đã tồn tại chưa
        const allLinks = await Storage.getAll('links');
        const exists = allLinks.some(l => l.url === url && l.chatId === message.chatId);
        if (!exists) {
          const domain = Utils.extractDomain(url);
          const linkObj = {
            id: Utils.generateId('link'),
            url,
            title: domain,
            description: `Liên kết được chia sẻ bởi ${chat ? chat.name : 'người dùng'}.`,
            domain,
            tags: ['Tự động', domain],
            folderId: chat ? (chat.folder || 'Công việc') : 'Chung',
            chatId: message.chatId,
            messageId: message.id,
            favorite: false,
            readLater: false,
            createdAt: message.createdAt || Date.now()
          };
          await Storage.put('links', linkObj);
          if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudLink === 'function') {
            window.FirebaseBridge.sendCloudLink(linkObj);
          }
        }
      }
    },

    /**
     * Mở modal thêm liên kết thủ công
     */
    openAddLinkModal(onAdded) {
      const content = document.createElement('div');
      content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">ĐƯỜNG DẪN URL *</label>
            <input type="url" id="link-url-input" placeholder="https://example.com" style="
              width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " required />
          </div>

          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">TIÊU ĐỀ LIÊN KẾT</label>
            <input type="text" id="link-title-input" placeholder="Tên bài viết hoặc tài liệu..." style="
              width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " />
          </div>

          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">MÔ TẢ CHI TIẾT</label>
            <textarea id="link-desc-input" placeholder="Ghi chú về nội dung trang này..." style="
              width: 100%; height: 60px; padding: 8px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main); resize: none;
            "></textarea>
          </div>

          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">THẺ TAGS (cách nhau bằng dấu phẩy)</label>
            <input type="text" id="link-tags-input" placeholder="Frontend, Tài liệu, Thiết kế..." style="
              width: 100%; padding: 8px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " />
          </div>

          <div style="display: flex; gap: 16px; align-items: center; padding-top: 4px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); cursor: pointer;">
              <input type="checkbox" id="link-fav-checkbox" />
              <span>⭐ Yêu thích</span>
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); cursor: pointer;">
              <input type="checkbox" id="link-readlater-checkbox" />
              <span>⏱️ Đọc sau</span>
            </label>
          </div>
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary modal-cancel-btn">Hủy bỏ</button>
        <button class="btn btn-primary modal-save-btn">Lưu vào Kho</button>
      `;

      const modal = UI.modal({
        title: 'Thêm Link Vào Kho',
        content,
        footer
      });

      modal.querySelector('.modal-cancel-btn').addEventListener('click', () => UI.closeModal());
      modal.querySelector('.modal-save-btn').addEventListener('click', async () => {
        let url = content.querySelector('#link-url-input').value.trim();
        if (!url) {
          UI.toast('Vui lòng nhập đường link!', 'warning');
          return;
        }
        if (!/^https?:\/\//i.test(url)) {
          url = 'https://' + url;
        }

        const domain = Utils.extractDomain(url);
        const title = content.querySelector('#link-title-input').value.trim() || domain;
        const description = content.querySelector('#link-desc-input').value.trim() || 'Liên kết lưu thủ công.';
        const tagsRaw = content.querySelector('#link-tags-input').value.trim();
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [domain];
        const favorite = content.querySelector('#link-fav-checkbox').checked;
        const readLater = content.querySelector('#link-readlater-checkbox').checked;

        const newLink = {
          id: Utils.generateId('link'),
          url,
          title,
          description,
          domain,
          tags,
          folderId: 'Cá nhân',
          chatId: null,
          messageId: null,
          favorite,
          readLater,
          createdAt: Date.now()
        };

        await Storage.put('links', newLink);
        if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudLink === 'function') {
          window.FirebaseBridge.sendCloudLink(newLink);
        }
        UI.closeModal();
        UI.toast('Đã lưu liên kết vào Kho Link!', 'success');
        if (typeof onAdded === 'function') onAdded(newLink);
      });
    },

    /**
     * Dựng toàn bộ giao diện Tab 🔗 Kho Link
     */
    async renderLinksRepoView(container) {
      const allLinks = await Storage.getAll('links');
      allLinks.sort((a, b) => b.createdAt - a.createdAt);

      container.innerHTML = `
        <div style="padding: 20px; max-width: 1000px; margin: 0 auto; width: 100%;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="font-size: var(--font-size-2xl); font-weight: 700;">🔗 Kho Link & Tài Liệu</h2>
              <p style="font-size: var(--font-size-sm); color: var(--text-muted);">Quản lý, đánh dấu và tìm kiếm tất cả liên kết quan trọng đã lưu.</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary export-links-btn">Xuất JSON</button>
              <button class="btn btn-primary add-link-btn">+ Thêm Link</button>
            </div>
          </div>

          <div style="display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px;">
            <button class="filter-pill active" data-filter="all">Tất cả (${allLinks.length})</button>
            <button class="filter-pill" data-filter="fav">⭐ Yêu thích</button>
            <button class="filter-pill" data-filter="readlater">⏱️ Đọc sau</button>
          </div>

          <div id="links-card-list" style="display: flex; flex-direction: column; gap: 10px;">
            ${this.buildLinksListHTML(allLinks)}
          </div>
        </div>
      `;

      // Nút thêm link
      container.querySelector('.add-link-btn').addEventListener('click', () => {
        this.openAddLinkModal(() => this.renderLinksRepoView(container));
      });

      // Xuất JSON
      container.querySelector('.export-links-btn').addEventListener('click', () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allLinks, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute('href', dataStr);
        dlAnchor.setAttribute('download', `quickchat_links_${Date.now()}.json`);
        dlAnchor.click();
        UI.toast('Đã xuất dữ liệu kho link thành công!', 'success');
      });

      // Bộ lọc
      container.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const filter = pill.dataset.filter;
          let filtered = allLinks;
          if (filter === 'fav') filtered = allLinks.filter(l => l.favorite);
          if (filter === 'readlater') filtered = allLinks.filter(l => l.readLater);

          container.querySelector('#links-card-list').innerHTML = this.buildLinksListHTML(filtered);
          this.bindLinkActionEvents(container);
        });
      });

      this.bindLinkActionEvents(container);
    },

    buildLinksListHTML(links) {
      if (links.length === 0) {
        return `
          <div style="text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
            <div style="font-size: 40px; margin-bottom: 8px;">🔗</div>
            <div>Chưa có liên kết nào trong danh mục này.</div>
          </div>
        `;
      }

      return links.map(link => `
        <div class="link-repo-item" data-id="${link.id}" style="
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          padding: 12px 16px; background: var(--bg-card); border-radius: var(--radius-md);
          border: 1px solid var(--border-color); box-shadow: var(--shadow-xs);
        ">
          <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0;">
            <img src="https://www.google.com/s2/favicons?domain=${link.domain}&sz=32"
                 onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\'><rect width=\\'24\\' height=\\'24\\' fill=\\'%235b6cff\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'white\\' font-size=\\'12\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>🔗</text></svg>'"
                 style="width: 24px; height: 24px; border-radius: 4px; margin-top: 2px;" />
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                <span style="font-weight: 600; font-size: var(--font-size-base); color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${Utils.escapeHTML(link.title)}
                </span>
                ${link.favorite ? '<span title="Yêu thích">⭐</span>' : ''}
                ${link.readLater ? '<span style="font-size: 11px; background: var(--bg-hover); padding: 1px 6px; border-radius: 4px;">Đọc sau</span>' : ''}
              </div>
              <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${Utils.escapeHTML(link.description)}
              </div>
              <div style="font-size: 11px; color: var(--color-primary);">
                ${Utils.escapeHTML(link.url)}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <button class="btn btn-secondary copy-link-url-btn" data-url="${link.url}" style="padding: 6px 10px; font-size: 12px;">Copy</button>
            <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;">Mở ↗</a>
            <button class="btn btn-secondary delete-link-btn" data-id="${link.id}" style="padding: 6px 8px; color: var(--color-danger);" title="Xóa">✕</button>
          </div>
        </div>
      `).join('');
    },

    bindLinkActionEvents(container) {
      container.querySelectorAll('.copy-link-url-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          await Utils.copyToClipboard(btn.dataset.url);
          UI.toast('Đã sao chép liên kết!', 'success');
        });
      });

      container.querySelectorAll('.delete-link-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const ok = await UI.confirm({
            title: 'Xóa liên kết',
            message: 'Bạn có chắc chắn muốn xóa link này khỏi kho lưu trữ?',
            isDanger: true
          });
          if (ok) {
            await Storage.delete('links', id);
            UI.toast('Đã xóa liên kết.', 'info');
            this.renderLinksRepoView(container);
          }
        });
      });
    }
  };
})();
