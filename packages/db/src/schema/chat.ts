import {
  type AnyPgColumn,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { StoredParts } from "../message-parts";
import { user } from "./auth";

/** A Conversation, owned by one user. Its Messages form a tree (ADR 0001). */
export const conversation = pgTable(
  "conversation",
  {
    /** uuidv7, generated in app code. */
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    index("conversation_title_trgm_idx").using("gin", table.title.op("gin_trgm_ops")),
  ],
);

export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const messageStatus = pgEnum("message_status", [
  "streaming",
  "complete",
  "stopped",
  "error",
]);
export const messageErrorReason = pgEnum("message_error_reason", [
  "invalid_key",
  "rate_limited",
  "provider_error",
]);

/** One Message of a Conversation. Several roots are allowed; there is no hidden root. */
export const message = pgTable(
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
  },
  (table) => [
    index("message_conversation_id_parent_id_idx").on(table.conversationId, table.parentId),
    index("message_search_text_trgm_idx").using("gin", table.searchText.op("gin_trgm_ops")),
  ],
);

export type ConversationRow = typeof conversation.$inferSelect;
export type MessageRow = typeof message.$inferSelect;
