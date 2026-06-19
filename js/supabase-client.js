import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export const schemaFlags = {
  hasRoomColumn: true,
  hasUsernameColumn: true,
  hasContentColumn: true,
  hasCreatedAtColumn: true,
  hasUserIdColumn: false,
  hasEditedAtColumn: false,
  hasReplyToColumn: false
};

export function detectSchemaFromRow(sample) {
  if (!sample) return;
  schemaFlags.hasRoomColumn = "room_id" in sample;
  schemaFlags.hasUsernameColumn = "username" in sample;
  schemaFlags.hasContentColumn = "content" in sample;
  schemaFlags.hasCreatedAtColumn = "created_at" in sample;
  schemaFlags.hasUserIdColumn = "user_id" in sample;
  schemaFlags.hasEditedAtColumn = "edited_at" in sample;
  schemaFlags.hasReplyToColumn = "reply_to_id" in sample;
}

export async function tryInsertMessage(basePayload) {
  const payload = { ...basePayload };
  for (let i = 0; i < 6; i += 1) {
    const { error } = await supabase.from("messages").insert(payload);
    if (!error) return null;

    const message = String(error.message || "").toLowerCase();
    if (error.code === "42703") {
      if (message.includes("room_id")) { delete payload.room_id; schemaFlags.hasRoomColumn = false; continue; }
      if (message.includes("username")) { delete payload.username; schemaFlags.hasUsernameColumn = false; continue; }
      if (message.includes("content")) { delete payload.content; schemaFlags.hasContentColumn = false; continue; }
      if (message.includes("created_at")) { delete payload.created_at; schemaFlags.hasCreatedAtColumn = false; continue; }
      if (message.includes("user_id")) { delete payload.user_id; schemaFlags.hasUserIdColumn = false; continue; }
      if (message.includes("reply_to_id")) { delete payload.reply_to_id; schemaFlags.hasReplyToColumn = false; continue; }
      if (message.includes("edited_at")) { delete payload.edited_at; schemaFlags.hasEditedAtColumn = false; continue; }
    }
    if (error.code === "23502" && message.includes("user_id")) {
      payload.user_id = basePayload.user_id;
      schemaFlags.hasUserIdColumn = true;
      continue;
    }
    return error;
  }
  return { message: "insert failed after compatibility retries" };
}

export async function tryUpdateMessage(messageId, basePayload) {
  const payload = { ...basePayload };
  for (let i = 0; i < 4; i += 1) {
    const { error } = await supabase.from("messages").update(payload).eq("id", messageId);
    if (!error) return null;

    const message = String(error.message || "").toLowerCase();
    if (error.code === "42703" && message.includes("edited_at")) {
      delete payload.edited_at;
      schemaFlags.hasEditedAtColumn = false;
      continue;
    }
    return error;
  }
  return { message: "update failed" };
}

export async function loadMessages(room) {
  let query = supabase.from("messages").select("*").order("id", { ascending: true }).limit(200);
  const result = await query;
  if (result.error) return { error: result.error, data: [] };

  const rows = result.data || [];
  if (rows.length > 0) detectSchemaFromRow(rows[0]);

  const filtered = schemaFlags.hasRoomColumn ? rows.filter((m) => m.room_id === room) : rows;
  return { data: filtered, error: null };
}

export async function loadReactions(messageId) {
  const { data, error } = await supabase.from("message_reactions").select("*").eq("message_id", messageId);
  if (error) return [];
  return data || [];
}

export async function toggleReaction(messageId, username, emoji) {
  const { error } = await supabase.from("message_reactions").insert({ message_id: messageId, username, emoji });
  if (error && error.code === "23505") {
    await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("username", username).eq("emoji", emoji);
  }
}

export async function deleteMessageContent(messageId) {
  return supabase.from("messages").update({ content: "[deleted]" }).eq("id", messageId);
}

export async function uploadFile(objectPath, file) {
  return supabase.storage.from("chat-images").upload(objectPath, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream"
  });
}

export function getPublicUrl(objectPath) {
  return supabase.storage.from("chat-images").getPublicUrl(objectPath);
}
