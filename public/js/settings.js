/**
 * ==========================================================================
 * QUICKCHAT - SETTINGS.JS
 * Cài đặt Giao diện (Sáng/Tối/OLED, Màu nhấn, Cỡ chữ, Mật độ, Hình nền),
 * Chuyển đổi Hồ sơ người dùng cục bộ, Âm báo, Sao lưu/Khôi phục & Dọn dẹp bộ nhớ.
 * ==========================================================================
 */

const Settings = (() => {
  return {
    /**
     * Áp dụng các cài đặt đã lưu vào Document
     */
    applyStoredSettings() {
      const theme = Storage.getSetting('theme', 'light');
      const accent = Storage.getSetting('accent', 'default');
      const fontSize = Storage.getSetting('font_size', 'medium');
      const density = Storage.getSetting('density', 'comfortable');
      const bubbleRadius = Storage.getSetting('bubble_radius', 'normal');

      document.documentElement.setAttribute('data-theme', theme);
      if (accent !== 'default') {
        document.documentElement.setAttribute('data-accent', accent);
      } else {
        document.documentElement.removeAttribute('data-accent');
      }
      document.documentElement.setAttribute('data-font-size', fontSize);
      document.documentElement.setAttribute('data-density', density);
      document.documentElement.setAttribute('data-bubble-radius', bubbleRadius);
    },

    /**
     * Dựng nội dung Tab ⚙️ Cài Đặt
     */
    async renderSettingsView(container, onProfileChanged) {
      const currentUserId = Storage.getCurrentUserId();
      const allUsers = await Storage.getAll('users');
      const currentUser = allUsers.find(u => u.id === currentUserId) || allUsers[0];

      const currentTheme = Storage.getSetting('theme', 'light');
      const currentAccent = Storage.getSetting('accent', 'default');
      const currentFontSize = Storage.getSetting('font_size', 'medium');
      const currentDensity = Storage.getSetting('density', 'comfortable');
      const currentWallpaper = Storage.getSetting('wallpaper', 'default');
      const currentBubbleRadius = Storage.getSetting('bubble_radius', 'normal');
      const soundEnabled = Storage.getSetting('sound_enabled', true);

      const storageInfo = await Storage.estimateStorageUsage();

      container.innerHTML = `
        <div style="padding: 24px 20px; max-width: 800px; margin: 0 auto; width: 100%; overflow-y: auto;">
          <h2 style="font-size: var(--font-size-2xl); font-weight: 700; margin-bottom: 20px;">⚙️ Cài Đặt Hệ Thống</h2>

          <!-- 1. HỒ SƠ & CHUYỂN ĐỔI NGƯỜI DÙNG -->
          <div class="settings-card" style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 18px; border: 1px solid var(--border-color); margin-bottom: 20px;">
            <h3 style="font-size: var(--font-size-md); font-weight: 700; margin-bottom: 12px;">👤 Hồ sơ người dùng hiện tại</h3>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 12px;">
                ${UI.renderAvatar(currentUser, 'lg')}
                <div>
                  <div style="font-size: var(--font-size-lg); font-weight: 700;">${Utils.escapeHTML(currentUser.name)}</div>
                  <div style="font-size: var(--font-size-xs); color: var(--text-muted);">${Utils.escapeHTML(currentUser.statusText || 'Online')}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <label style="font-size: var(--font-size-sm); color: var(--text-muted);">Đổi tài khoản:</label>
                <select id="switch-user-select" style="
                  padding: 8px 12px; border-radius: var(--radius-md); background: var(--bg-input);
                  border: 1px solid var(--border-color); font-size: var(--font-size-sm); color: var(--text-main);
                ">
                  ${allUsers.map(u => `
                    <option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
                      ${Utils.escapeHTML(u.name)}
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>
          </div>

          <!-- FIREBASE CLOUD SYNC -->
          <div class="settings-card" style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 18px; border: 1px solid var(--border-color); margin-bottom: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <h3 style="font-size: var(--font-size-md); font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <span>🔥</span>
                <span>Firebase Cloud Database</span>
              </h3>
              <span style="font-size: 11px; padding: 2px 8px; border-radius: 99px; background: rgba(16, 185, 129, 0.15); color: var(--color-success); font-weight: 600;">Đã kết nối Firestore</span>
            </div>
            <p style="font-size: var(--font-size-xs); color: var(--text-muted); margin-bottom: 14px;">
              Dự án <strong>gen-lang-client-0740689685</strong> đã kích hoạt Firestore. Đăng nhập tài khoản Google để đồng bộ tin nhắn đám mây xuyên thiết bị.
            </p>
            <div id="firebase-auth-section" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <button class="btn btn-primary fb-login-btn" style="display: flex; align-items: center; gap: 8px;">
                <span>🔐 Đăng nhập tài khoản Google</span>
              </button>
            </div>
          </div>

          <!-- 2. GIAO DIỆN & MÀU SẮC -->
          <div class="settings-card" style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 18px; border: 1px solid var(--border-color); margin-bottom: 20px;">
            <h3 style="font-size: var(--font-size-md); font-weight: 700; margin-bottom: 14px;">🎨 Giao diện & Màu sắc</h3>

            <!-- Chế độ màu -->
            <div style="margin-bottom: 16px;">
              <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">CHẾ ĐỘ SÁNG / TỐI</label>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="theme-select-btn btn ${currentTheme === 'light' ? 'btn-primary' : 'btn-secondary'}" data-theme="light">☀️ Sáng</button>
                <button class="theme-select-btn btn ${currentTheme === 'dark' ? 'btn-primary' : 'btn-secondary'}" data-theme="dark">🌙 Tối (Slate)</button>
                <button class="theme-select-btn btn ${currentTheme === 'oled' ? 'btn-primary' : 'btn-secondary'}" data-theme="oled">🖤 OLED</button>
              </div>
            </div>

            <!-- Bảng màu nhấn -->
            <div style="margin-bottom: 16px;">
              <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">MÀU SẮC CHỦ ĐẠO (ACCENT)</label>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${[
                  { id: 'default', color: '#5b6cff', label: 'Tím Xanh' },
                  { id: 'emerald', color: '#10b981', label: 'Xanh Ngọc' },
                  { id: 'orange', color: '#f97316', label: 'Cam Rực' },
                  { id: 'rose', color: '#f43f5e', label: 'Hồng Rose' },
                  { id: 'cyan', color: '#06b6d4', label: 'Xanh Cyan' },
                  { id: 'violet', color: '#8b5cf6', label: 'Tím Violet' },
                  { id: 'amber', color: '#f59e0b', label: 'Hổ Phách' },
                  { id: 'classic-blue', color: '#2563eb', label: 'Xanh Dương' }
                ].map(acc => `
                  <button class="accent-select-btn" data-accent="${acc.id}" style="
                    width: 32px; height: 32px; border-radius: var(--radius-full);
                    background-color: ${acc.color}; border: 3px solid ${currentAccent === acc.id ? 'var(--text-main)' : 'transparent'};
                    box-shadow: var(--shadow-sm); transition: transform var(--transition-fast);
                  " title="${acc.label}"></button>
                `).join('')}
              </div>
            </div>

            <!-- Cỡ chữ & Mật độ -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div>
                <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">CỠ CHỮ</label>
                <select id="font-size-select" style="
                  width: 100%; padding: 8px 10px; border-radius: var(--radius-md); background: var(--bg-input);
                  border: 1px solid var(--border-color); font-size: var(--font-size-sm); color: var(--text-main);
                ">
                  <option value="small" ${currentFontSize === 'small' ? 'selected' : ''}>Nhỏ (13.5px)</option>
                  <option value="medium" ${currentFontSize === 'medium' ? 'selected' : ''}>Vừa vặn (15px)</option>
                  <option value="large" ${currentFontSize === 'large' ? 'selected' : ''}>Lớn (16.5px)</option>
                </select>
              </div>

              <div>
                <label style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">MẬT ĐỘ TIN NHẮN</label>
                <select id="density-select" style="
                  width: 100%; padding: 8px 10px; border-radius: var(--radius-md); background: var(--bg-input);
                  border: 1px solid var(--border-color); font-size: var(--font-size-sm); color: var(--text-main);
                ">
                  <option value="compact" ${currentDensity === 'compact' ? 'selected' : ''}>Gọn gàng (Compact)</option>
                  <option value="comfortable" ${currentDensity === 'comfortable' ? 'selected' : ''}>Thoải mái (Comfortable)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- 3. ÂM BÁO & THÔNG BÁO -->
          <div class="settings-card" style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 18px; border: 1px solid var(--border-color); margin-bottom: 20px;">
            <h3 style="font-size: var(--font-size-md); font-weight: 700; margin-bottom: 12px;">🔔 Âm Báo & Thông Báo</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                <div>
                  <div style="font-weight: 600; font-size: var(--font-size-sm);">Âm thanh Web Audio API</div>
                  <div style="font-size: 11px; color: var(--text-muted);">Phát âm báo khi gửi tin, nhận tin hoặc thả biểu cảm</div>
                </div>
                <input type="checkbox" id="sound-toggle-checkbox" ${soundEnabled ? 'checked' : ''} />
              </label>
              <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 6px;">
                <div>
                  <div style="font-weight: 600; font-size: var(--font-size-sm);">Thông báo đẩy trình duyệt</div>
                  <div style="font-size: 11px; color: var(--text-muted);">Yêu cầu quyền Web Notifications API</div>
                </div>
                <button class="btn btn-secondary request-notif-btn" style="font-size: 11px; padding: 4px 10px;">Bật thông báo</button>
              </div>
            </div>
          </div>

          <!-- 4. QUẢN LÝ DỮ LIỆU & BỘ NHỚ -->
          <div class="settings-card" style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 18px; border: 1px solid var(--border-color); margin-bottom: 20px;">
            <h3 style="font-size: var(--font-size-md); font-weight: 700; margin-bottom: 12px;">💾 Quản Lý Dữ Liệu & Bộ Nhớ Offline</h3>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; background: var(--bg-hover); padding: 10px 14px; border-radius: var(--radius-md);">
              <span style="font-size: var(--font-size-sm);">Dung lượng IndexedDB đã dùng:</span>
              <strong style="color: var(--color-primary);">${storageInfo.usageFormatted}</strong>
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="btn btn-secondary export-backup-btn">📥 Sao lưu toàn bộ (JSON)</button>
              <button class="btn btn-secondary clean-cache-btn">🧹 Dọn dẹp Cache Blob</button>
              <button class="btn btn-danger reset-db-btn">⚠️ Xóa sạch & Khôi phục gốc</button>
            </div>
          </div>
        </div>
      `;

      // Xử lý Firebase Authentication
      const authSection = container.querySelector('#firebase-auth-section');
      if (authSection && window.FirebaseBridge) {
        const fbUser = window.FirebaseBridge.getAuthUser();
        if (fbUser) {
          authSection.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 10px; background: var(--bg-hover); padding: 8px 12px; border-radius: var(--radius-md);">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${fbUser.photoURL || ''}" style="width: 32px; height: 32px; border-radius: 50%;" />
                <div>
                  <div style="font-size: var(--font-size-sm); font-weight: 600;">${Utils.escapeHTML(fbUser.displayName || 'Google User')}</div>
                  <div style="font-size: 11px; color: var(--text-muted);">${Utils.escapeHTML(fbUser.email || '')}</div>
                </div>
              </div>
              <button class="btn btn-secondary fb-logout-btn" style="font-size: 11px; padding: 4px 10px;">Đăng xuất</button>
            </div>
          `;
          authSection.querySelector('.fb-logout-btn').addEventListener('click', async () => {
            await window.FirebaseBridge.logout();
            UI.toast('Đã đăng xuất tài khoản Google.', 'info');
            this.renderSettingsView(container, onProfileChanged);
          });
        } else {
          const btnLogin = authSection.querySelector('.fb-login-btn');
          if (btnLogin) {
            btnLogin.addEventListener('click', async () => {
              try {
                const user = await window.FirebaseBridge.loginWithGoogle();
                // Lưu vào danh sách người dùng nội bộ
                const cloudUser = {
                  id: user.uid,
                  name: user.displayName || 'Google User',
                  avatar: user.photoURL || '',
                  color: '#5b6cff',
                  status: 'online',
                  statusText: 'Đã kết nối qua Google Cloud',
                  createdAt: Date.now()
                };
                await Storage.put('users', cloudUser);
                Storage.setCurrentUserId(user.uid);
                UI.toast(`Đã đăng nhập thành công với ${user.displayName}!`, 'success');
                if (typeof onProfileChanged === 'function') onProfileChanged(user.uid);
                this.renderSettingsView(container, onProfileChanged);
              } catch {
                UI.toast('Không thể đăng nhập Google. Vui lòng thử lại.', 'error');
              }
            });
          }
        }
      }

      // 1. Chuyển đổi user
      container.querySelector('#switch-user-select').addEventListener('change', (e) => {
        const newUserId = e.target.value;
        Storage.setCurrentUserId(newUserId);
        UI.toast('Đã chuyển đổi người dùng hoạt động!', 'success');
        if (typeof onProfileChanged === 'function') onProfileChanged(newUserId);
      });

      // 2. Chế độ màu
      container.querySelectorAll('.theme-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = btn.dataset.theme;
          Storage.setSetting('theme', t);
          this.applyStoredSettings();
          this.renderSettingsView(container, onProfileChanged);
        });
      });

      // 3. Màu nhấn
      container.querySelectorAll('.accent-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.accent;
          Storage.setSetting('accent', a);
          this.applyStoredSettings();
          this.renderSettingsView(container, onProfileChanged);
        });
      });

      // 4. Cỡ chữ
      container.querySelector('#font-size-select').addEventListener('change', (e) => {
        Storage.setSetting('font_size', e.target.value);
        this.applyStoredSettings();
      });

      // 5. Mật độ
      container.querySelector('#density-select').addEventListener('change', (e) => {
        Storage.setSetting('density', e.target.value);
        this.applyStoredSettings();
      });

      // 6. Âm thanh toggle
      container.querySelector('#sound-toggle-checkbox').addEventListener('change', (e) => {
        Storage.setSetting('sound_enabled', e.target.checked);
        UI.toast(e.target.checked ? 'Đã bật âm báo.' : 'Đã tắt âm báo.', 'info');
      });

      // 7. Web Notifications
      container.querySelector('.request-notif-btn').addEventListener('click', async () => {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            UI.toast('Đã cấp quyền thông báo thành công!', 'success');
          } else {
            UI.toast('Quyền thông báo bị từ chối.', 'warning');
          }
        } else {
          UI.toast('Trình duyệt không hỗ trợ Web Notifications.', 'warning');
        }
      });

      // 8. Sao lưu JSON
      container.querySelector('.export-backup-btn').addEventListener('click', async () => {
        const backupData = {
          users: await Storage.getAll('users'),
          chats: await Storage.getAll('chats'),
          messages: await Storage.getAll('messages'),
          links: await Storage.getAll('links'),
          todos: await Storage.getAll('todos'),
          exportedAt: new Date().toISOString()
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const dl = document.createElement('a');
        dl.setAttribute('href', dataStr);
        dl.setAttribute('download', `quickchat_full_backup_${Date.now()}.json`);
        dl.click();
        UI.toast('Đã tải xuống tệp sao lưu!', 'success');
      });

      // 9. Dọn dẹp Cache
      container.querySelector('.clean-cache-btn').addEventListener('click', async () => {
        await Storage.cleanAttachmentCache();
        UI.toast('Đã dọn dẹp các tệp tạm thời trong IndexedDB!', 'success');
        this.renderSettingsView(container, onProfileChanged);
      });

      // 10. Khôi phục gốc
      container.querySelector('.reset-db-btn').addEventListener('click', async () => {
        const ok = await UI.confirm({
          title: 'Khôi phục cài đặt gốc',
          message: 'Hành động này sẽ xóa toàn bộ tin nhắn, hình ảnh và cài đặt cá nhân trong trình duyệt của bạn. Bạn có chắc chắn muốn tiếp tục?',
          confirmText: 'Xóa toàn bộ dữ liệu',
          isDanger: true
        });
        if (ok) {
          await Storage.resetAllData();
          this.applyStoredSettings();
          UI.toast('Đã khôi phục dữ liệu gốc thành công!', 'success');
          window.location.reload();
        }
      });
    }
  };
})();
