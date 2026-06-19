import { escapeHtml, parseAttachmentMarker } from "./utils.js";

/** Render markdown nhẹ: **bold**, *italic*, `code`, ```blocks``` */
export function renderMarkdown(text) {
  if (!text) return "";

  const codeBlocks = [];
  let processed = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  processed = escapeHtml(processed);

  processed = processed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  processed = processed.replace(/`([^`]+)`/g, "<code>$1</code>");

  codeBlocks.forEach((block, i) => {
    processed = processed.replace(`%%CODEBLOCK_${i}%%`, block);
  });

  processed = processed.replace(/\n/g, "<br>");
  return processed;
}

export function processMessageContent(content, msgContentEl, onReplyClick) {
  msgContentEl.innerHTML = "";

  const lines = content.split("\n");
  let bodyStarted = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const reply = trimmed.match(/^\[\[reply:([^:]+):([^:]*):(.+)\]\]$/)?.input
      ? (() => {
          const m = trimmed.match(/^\[\[reply:([^:]+):([^:]*):(.+)\]\]$/);
          if (!m) return null;
          try {
            return {
              id: m[1],
              username: decodeURIComponent(m[2] || ""),
              preview: decodeURIComponent(m[3] || "")
            };
          } catch {
            return null;
          }
        })()
      : null;

    if (reply) {
      const preview = document.createElement("div");
      preview.className = "reply-preview";
      preview.innerHTML = `<span class="reply-author">@${escapeHtml(reply.username)}</span> ${escapeHtml(reply.preview)}`;
      preview.onclick = () => onReplyClick?.(reply.id);
      msgContentEl.appendChild(preview);
      continue;
    }

    const attachment = parseAttachmentMarker(trimmed);
    if (attachment) {
      const link = document.createElement("a");
      link.className = "attachment-link";
      link.href = attachment.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = attachment.name;
      msgContentEl.appendChild(link);
      msgContentEl.appendChild(document.createElement("br"));

      if (attachment.mime.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "attachment-img";
        img.src = attachment.url;
        img.alt = attachment.name;
        img.loading = "lazy";
        msgContentEl.appendChild(img);
        msgContentEl.appendChild(document.createElement("br"));
      }
      bodyStarted = true;
      continue;
    }

    if (trimmed) {
      const span = document.createElement("span");
      span.innerHTML = renderMarkdown(line);
      msgContentEl.appendChild(span);
      msgContentEl.appendChild(document.createElement("br"));
      bodyStarted = true;
    } else if (bodyStarted) {
      msgContentEl.appendChild(document.createElement("br"));
    }
  }
}
