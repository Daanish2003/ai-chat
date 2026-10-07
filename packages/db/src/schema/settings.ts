import { pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** A user's settings; a user without a row has the defaults. */
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The `"provider:model"` that writes titles; `null` means the Model that wrote the first reply. */
  titleModel: text("title_model"),
});
