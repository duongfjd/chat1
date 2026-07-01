export const SUPABASE_URL = "https://shzxqulhxwmjdipjkwqe.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_l5VdADKMm4fwADcrpZn-VQ_xATGQb7w";
export const STORAGE_BUCKET = "chat-images";

export const ROOMS = ["general", "thảo-luận"];
export const OFFLINE_MEMBERS = [
  { name: "BotHelper", color: "#747f8d" },
  { name: "Guest_42", color: "#99aab5" }
];

export const EMOJI_LIST = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😉",
  "😊","😇","🥰","😍","🤩","😘","😗","😋","😛","😜",
  "🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐",
  "😑","😶","😏","😒","🙄","😬","😮‍💨","🤥","😌","😔",
  "😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵",
  "👍","👎","👏","🙌","🤝","❤️","🧡","💛","💚","💙",
  "💜","🖤","💔","❣️","💕","🔥","⭐","✨","🎉","🎊",
  "💯","✅","❌","⚠️","💬","👀","🙏","😭","😤","🤡"
];

// File upload configuration
export const FILE_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_MESSAGE_LENGTH: 4000,
  ALLOWED_TYPES: {
    image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
    document: ["application/pdf", "text/plain"],
    archive: ["application/zip", "application/x-rar-compressed", "application/x-7z-compressed"],
  },
  ALLOWED_EXTENSIONS: [
    // Images
    "jpg", "jpeg", "png", "gif", "webp", "svg",
    // Documents
    "pdf", "txt",
    // Archives
    "zip", "rar", "7z"
  ]
};
