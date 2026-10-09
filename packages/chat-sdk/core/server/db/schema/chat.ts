import { type AnyPgColumn, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { StoredParts } from "../../../shared/message-parts";
import { chatSchema } from "./chat-schema";

/** A Conversation, owned by one user. Its Messages form a tree (ADR 0001). */
export const conversation = chatSchema.table(
  "conversation",
  {
    /** uuidv7, generated in app code. */
    id: uuid("id").primaryKey(),
    /** The Host's user id. The SDK trusts `getUser` and keeps no foreign key to the user. */
    userId: text("user_id").notNull(),
    title: text("title"),
    /** The selected Model, `"provider:model"`; checked in code, not an enum. */
    model: text("model").notNull(),
    /** The newest Message of the Active Branch. */
    activeLeafId: uuid("active_leaf_id").references((): AnyPgColumn => message.id, {
      onDelete: "set null",
    }),
    /** Bumped only by new Messages, never by renames or Branch switches. */
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_user_id_last_message_at_idx").on(table.userId, table.lastMessageAt.desc()),
    index("conversation_title_trgm_idx").using("gin", table.title.op("public.gin_trgm_ops")),
  ],
);

export const messageRole = chatSchema.enum("message_role", ["user", "assistant"]);
export const messageStatus = chatSchema.enum("message_status", [
  "streaming",
  "complete",
  "stopped",
  "error",
]);
export const messageErrorReason = chatSchema.enum("message_error_reason", [
  "invalid_key",
  "rate_limited",
  "provider_error",
]);

/** One Message of a Conversation. Several roots are allowed; there is no hidden root. */
export const message = chatSchema.table(
  "message",
  {
    /** uuidv7, generated in app code; client ids are ignored. */
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => message.id, {
      onDelete: "cascade",
    }),
    role: messageRole("role").notNull(),
    parts: jsonb("parts").$type<StoredParts>().notNull(),
    /** The Model that wrote an assistant Message; null for user Messages. */
    model: text("model"),
    status: messageStatus("status").notNull(),
    error: text("error"),
    errorReason: messageErrorReason("error_reason"),
    /** Plain text of the text parts, written by the app, for searching history. */
    searchText: text("search_text").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** When a Stop was asked for; the owning process reads it and saves the Run as `stopped` (ADR 0006). */
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    /** Last sign of life from the process running a `streaming` Message (ADR 0006). */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  },
  (table) => [
    index("message_conversation_id_parent_id_idx").on(table.conversationId, table.parentId),
    index("message_search_text_trgm_idx").using("gin", table.searchText.op("public.gin_trgm_ops")),
  ],
);

export type ConversationRow = typeof conversation.$inferSelect;
export type MessageRow = typeof message.$inferSelect;
