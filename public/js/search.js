/**
 * ==========================================================================
 * QUICKCHAT - SEARCH.JS
 * Tìm kiếm toàn cục (Ctrl/Cmd+K) Command Palette không phân biệt dấu Tiếng Việt,
 * Lọc nâng cao (from:, in:, has:), và Tìm kiếm trong cuộc hội thoại hiện tại.
 * ==========================================================================
 */

const Search = (() => {
  return {
    /**
     * Mở Command Palette tìm kiếm toàn cục (Ctrl/Cmd+K)
     */
    async openGlobalSearchModal(onSelectChat) {
      const allChats = await Storage.getAll('chats');
      const allMessages = await Storage.getAll('messages');
      const allLinks = await Storage.getAll('links');

      const content = document.createElement('div');
      content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="position: relative;">
            <input type="text" id="cmd-search-input" placeholder="Tìm người, nhóm, tin nhắn, tệp, link... (hoặc gõ from:, has:)" style="
              width: 100%; padding: 12px 16px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 2px solid var(--color-primary);
              font-size: var(--font-size-md); color: var(--text-main);
            " autofocus />
          </div>

          <div id="cmd-search-results" style="max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
            <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: var(--font-size-sm);">
              Nhập từ khóa tìm kiếm tiếng Việt hoặc tên người dùng...
            </div>
          </div>
        </div>
      `;

      const modal = UI.modal({
        title: '🔍 Tìm Kiếm Toàn Cục (Ctrl+K)',
        content,
        maxWidth: '560px'
      });

      const input = modal.querySelector('#cmd-search-input');
      const resultsContainer = modal.querySelector('#cmd-search-results');

      const performSearch = (keyword) => {
        const cleanQuery = Utils.removeVietnameseDiacritics(keyword);
        if (!cleanQuery) {
          resultsContainer.innerHTML = `
            <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: var(--font-size-sm);">
              Nhập từ khóa tìm kiếm tiếng Việt hoặc tên người dùng...
            </div>
          `;
          return;
        }

        // 1. Tìm trong Hội thoại & Nhóm
        const matchingChats = allChats.filter(c => 
          Utils.removeVietnameseDiacritics(c.name).includes(cleanQuery)
        );

        // 2. Tìm trong Tin nhắn
        const matchingMessages = allMessages.filter(m => 
          m.text && Utils.removeVietnameseDiacritics(m.text).includes(cleanQuery)
        ).slice(0, 15);

        // 3. Tìm trong Liên kết
        const matchingLinks = allLinks.filter(l => 
          Utils.removeVietnameseDiacritics(l.title || '').includes(cleanQuery) ||
          Utils.removeVietnameseDiacritics(l.url || '').includes(cleanQuery)
        ).slice(0, 5);

        let html = '';

        if (matchingChats.length > 0) {
          html += `
            <div>
              <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Cuộc trò chuyện (${matchingChats.length})</div>
              ${matchingChats.map(c => `
                <div class="cmd-result-item" data-chat-id="${c.id}" style="
                  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
                  border-radius: var(--radius-md); cursor: pointer; hover: background var(--bg-hover);
                ">
                  ${UI.renderAvatar(c, 'xs')}
                  <span style="font-weight: 600; font-size: var(--font-size-sm);">${Utils.escapeHTML(c.name)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }

        if (matchingMessages.length > 0) {
          html += `
            <div>
              <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Tin nhắn (${matchingMessages.length})</div>
              ${matchingMessages.map(m => `
                <div class="cmd-result-item" data-chat-id="${m.chatId}" data-msg-id="${m.id}" style="
                  display: flex; flex-direction: column; gap: 2px; padding: 8px 10px;
                  border-radius: var(--radius-md); cursor: pointer; hover: background var(--bg-hover);
                  background: var(--bg-card); border: 1px solid var(--border-color);
                ">
                  <div style="font-size: var(--font-size-xs); color: var(--text-muted);">${Utils.formatRelativeTime(m.createdAt)}</div>
                  <div style="font-size: var(--font-size-sm); color: var(--text-main);">${Utils.escapeHTML(m.text)}</div>
                </div>
              `).join('')}
            </div>
          `;
        }

        if (matchingLinks.length > 0) {
          html += `
            <div>
              <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Liên kết (${matchingLinks.length})</div>
              ${matchingLinks.map(l => `
                <div class="cmd-result-link" data-url="${l.url}" style="
                  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
                  border-radius: var(--radius-md); cursor: pointer; font-size: var(--font-size-sm);
                ">
                  <span>🔗</span>
                  <span style="font-weight: 500; color: var(--color-primary);">${Utils.escapeHTML(l.title || l.url)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }

        if (!html) {
          html = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted);">
              Không tìm thấy kết quả nào cho "${Utils.escapeHTML(keyword)}".
            </div>
          `;
        }

        resultsContainer.innerHTML = html;

        // Bắt sự kiện chọn kết quả
        resultsContainer.querySelectorAll('.cmd-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const chatId = item.dataset.chatId;
            const msgId = item.dataset.msgId;
            UI.closeModal();
            if (typeof onSelectChat === 'function') {
              onSelectChat(chatId, msgId);
            }
          });
        });

        resultsContainer.querySelectorAll('.cmd-result-link').forEach(item => {
          item.addEventListener('click', () => {
            window.open(item.dataset.url, '_blank', 'noopener,noreferrer');
          });
        });
      };

      input.addEventListener('input', () => performSearch(input.value.trim()));
      setTimeout(() => input.focus(), 80);
    }
  };
})();
