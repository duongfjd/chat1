/**
 * ==========================================================================
 * QUICKCHAT - GROUPS.JS
 * Quản lý Nhóm, Kênh chủ đề (Topics), Thành viên & Phân quyền,
 * Mã mời / QR Code nhóm, và Danh sách việc cần làm (To-dos) của nhóm.
 * ==========================================================================
 */

const Groups = (() => {
  return {
    /**
     * Mở hộp thoại tạo Nhóm mới
     */
    async openCreateGroupModal(onCreated) {
      const allUsers = await Storage.getAll('users');
      const currentUserId = Storage.getCurrentUserId();
      const otherUsers = allUsers.filter(u => u.id !== currentUserId);

      const content = document.createElement('div');
      content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">TÊN NHÓM *</label>
            <input type="text" id="new-group-name" placeholder="Ví dụ: Team Dự Án Phoenix..." style="
              width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-base); color: var(--text-main);
            " required />
          </div>

          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">MÔ TẢ HOẶC CHỦ ĐỀ</label>
            <input type="text" id="new-group-desc" placeholder="Mô tả mục tiêu của nhóm..." style="
              width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
              background: var(--bg-input); border: 1px solid var(--border-color);
              font-size: var(--font-size-sm); color: var(--text-main);
            " />
          </div>

          <div>
            <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">CHỌN THÀNH VIÊN BAN ĐẦU</label>
            <div style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px;">
              ${otherUsers.map(u => `
                <label style="display: flex; align-items: center; gap: 10px; padding: 6px; border-radius: var(--radius-sm); cursor: pointer; hover: background var(--bg-hover);">
                  <input type="checkbox" value="${u.id}" class="group-member-checkbox" checked />
                  ${UI.renderAvatar(u, 'xs')}
                  <span style="font-size: var(--font-size-sm); font-weight: 500;">${Utils.escapeHTML(u.name)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary modal-cancel-btn">Hủy bỏ</button>
        <button class="btn btn-primary modal-create-btn">Tạo nhóm ngay</button>
      `;

      const modal = UI.modal({
        title: 'Tạo Nhóm Mới',
        content,
        footer
      });

      modal.querySelector('.modal-cancel-btn').addEventListener('click', () => UI.closeModal());
      modal.querySelector('.modal-create-btn').addEventListener('click', async () => {
        const nameInput = modal.querySelector('#new-group-name');
        const name = nameInput.value.trim();
        if (!name) {
          UI.toast('Vui lòng nhập tên nhóm!', 'warning');
          nameInput.focus();
          return;
        }

        const checkedBoxes = modal.querySelectorAll('.group-member-checkbox:checked');
        const selectedMembers = Array.from(checkedBoxes).map(cb => cb.value);
        selectedMembers.push(currentUserId);

        const roles = {};
        roles[currentUserId] = 'owner';
        selectedMembers.forEach(mId => {
          if (mId !== currentUserId) roles[mId] = 'member';
        });

        const newGroup = {
          id: Utils.generateId('group'),
          type: 'group',
          name,
          avatar: '',
          color: Utils.getAvatarColor(name),
          members: selectedMembers,
          roles,
          topics: [
            { id: Utils.generateId('topic'), name: 'chung', order: 1 },
            { id: Utils.generateId('topic'), name: 'tài-liệu', order: 2 },
            { id: Utils.generateId('topic'), name: 'thông-báo', order: 3 }
          ],
          pinned: false,
          muted: false,
          archived: false,
          folder: 'Công việc',
          unread: 0,
          createdAt: Date.now()
        };

        await Storage.put('chats', newGroup);

        // Tạo tin nhắn hệ thống chào mừng
        const welcomeMsg = {
          id: Utils.generateId('msg'),
          chatId: newGroup.id,
          topicId: newGroup.topics[0].id,
          senderId: currentUserId,
          type: 'text',
          text: `🎉 Nhóm **${Utils.escapeHTML(name)}** đã được thành lập với các kênh #chung, #tài-liệu, #thông-báo. Bắt đầu trao đổi nào!`,
          attachments: [],
          reactions: {},
          status: 'sent',
          pinned: true,
          starred: false,
          createdAt: Date.now()
        };
        await Storage.put('messages', welcomeMsg);
        newGroup.lastMessageId = welcomeMsg.id;
        await Storage.put('chats', newGroup);

        if (window.FirebaseBridge) {
          if (typeof window.FirebaseBridge.sendCloudChat === 'function') {
            window.FirebaseBridge.sendCloudChat(newGroup);
          }
          if (typeof window.FirebaseBridge.sendCloudMessage === 'function') {
            window.FirebaseBridge.sendCloudMessage(welcomeMsg);
          }
        }

        UI.closeModal();
        UI.toast(`Đã tạo nhóm "${name}" thành công!`, 'success');
        if (typeof onCreated === 'function') onCreated(newGroup);
      });
    },

    /**
     * Mở hộp thoại thông tin nhóm, chia sẻ Link & QR Code
     */
    showGroupInviteModal(chat) {
      const inviteUrl = `https://quickchat.app/join/${chat.id}`;
      const content = document.createElement('div');
      content.style.textAlign = 'center';
      content.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 14px;">
          <canvas id="group-qr-canvas" width="180" height="180" style="border-radius: var(--radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);"></canvas>
          <div style="font-size: var(--font-size-xs); color: var(--text-muted);">Quét mã QR để tham gia nhóm <strong>${Utils.escapeHTML(chat.name)}</strong></div>
          <div style="
            display: flex; align-items: center; gap: 8px; width: 100%;
            background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
          ">
            <input type="text" readonly value="${inviteUrl}" style="flex: 1; font-size: var(--font-size-xs); color: var(--text-main);" />
            <button class="btn btn-secondary copy-link-btn" style="padding: 4px 10px; font-size: 11px;">Sao chép</button>
          </div>
        </div>
      `;

      const modal = UI.modal({
        title: 'Mời thành viên vào nhóm',
        content,
        maxWidth: '420px'
      });

      const canvas = modal.querySelector('#group-qr-canvas');
      Utils.renderCanvasQR(canvas, inviteUrl);

      modal.querySelector('.copy-link-btn').addEventListener('click', async () => {
        await Utils.copyToClipboard(inviteUrl);
        UI.toast('Đã sao chép liên kết mời nhóm vào khay nhớ tạm!', 'success');
      });
    },

    /**
     * Thêm kênh/chủ đề mới vào nhóm (#topic)
     */
    async addTopicToGroup(chat, topicName) {
      const cleanName = topicName.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
      if (!cleanName) return;

      if (!chat.topics) chat.topics = [];
      const newTopic = {
        id: Utils.generateId('topic'),
        name: cleanName,
        order: chat.topics.length + 1
      };
      chat.topics.push(newTopic);
      await Storage.put('chats', chat);
      UI.toast(`Đã thêm kênh #${cleanName}`, 'success');
      return newTopic;
    },

    /**
     * Quản lý công việc Todo của nhóm
     */
    async getGroupTodos(chatId) {
      const allTodos = await Storage.getAll('todos');
      return allTodos.filter(t => t.chatId === chatId);
    },

    async addTodo(chatId, text, assigneeId = null) {
      const todo = {
        id: Utils.generateId('todo'),
        chatId,
        text,
        done: false,
        assigneeId: assigneeId || Storage.getCurrentUserId(),
        createdAt: Date.now()
      };
      await Storage.put('todos', todo);
      if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudTodo === 'function') {
        window.FirebaseBridge.sendCloudTodo(todo);
      }
      Transport.emit('TODO_UPDATED', { todo });
      return todo;
    },

    async toggleTodo(todoId) {
      const todo = await Storage.get('todos', todoId);
      if (todo) {
        todo.done = !todo.done;
        await Storage.put('todos', todo);
        if (window.FirebaseBridge && typeof window.FirebaseBridge.sendCloudTodo === 'function') {
          window.FirebaseBridge.sendCloudTodo(todo);
        }
        Transport.emit('TODO_UPDATED', { todo });
        return todo;
      }
      return null;
    }
  };
})();
