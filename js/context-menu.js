export function setupContextMenu(onAction) {
  let contextMenu = document.getElementById("contextMenu");
  if (!contextMenu) {
    contextMenu = document.createElement("div");
    contextMenu.id = "contextMenu";
    contextMenu.className = "context-menu";
    contextMenu.innerHTML = `
      <div class="menu-item" data-action="reaction">😀 Add Reaction</div>
      <div class="menu-item" data-action="reply">↩️ Reply</div>
      <div class="menu-item" data-action="copy">📋 Copy Text</div>
      <div class="menu-item" data-action="pin">📌 Pin Message</div>
      <div class="menu-item" data-action="edit">✏️ Edit</div>
      <div class="menu-item" data-action="delete" style="color:var(--danger)">🗑️ Delete</div>
      <div class="menu-item" data-action="copylink">🔗 Copy Link</div>
    `;
    document.body.appendChild(contextMenu);
  }

  let activeMessageId = null;
  let activeMessageEl = null;

  document.addEventListener("contextmenu", (e) => {
    const msgEl = e.target.closest(".message");
    if (msgEl) {
      e.preventDefault();
      activeMessageId = msgEl.dataset.messageId;
      activeMessageEl = msgEl;
      
      const { clientX: mouseX, clientY: mouseY } = e;
      contextMenu.style.display = "block";
      
      // Prevent off-screen
      const rect = contextMenu.getBoundingClientRect();
      const x = (mouseX + rect.width > window.innerWidth) ? window.innerWidth - rect.width - 5 : mouseX;
      const y = (mouseY + rect.height > window.innerHeight) ? window.innerHeight - rect.height - 5 : mouseY;
      
      contextMenu.style.left = `${x}px`;
      contextMenu.style.top = `${y}px`;
      contextMenu.classList.add("active");
    } else {
      contextMenu.classList.remove("active");
      contextMenu.style.display = "none";
    }
  });

  document.addEventListener("click", (e) => {
    if (!contextMenu.contains(e.target)) {
      contextMenu.classList.remove("active");
      contextMenu.style.display = "none";
    }
  });

  contextMenu.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item || !activeMessageId) return;
    
    const action = item.dataset.action;
    onAction(action, activeMessageId, activeMessageEl);
    
    contextMenu.classList.remove("active");
    contextMenu.style.display = "none";
  });
}
