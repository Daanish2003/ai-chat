import { defineRelations } from "drizzle-orm";

import * as authSchema from "@ai-chat/db/schema/auth";

import * as chatSchema from "./schema";

const schema = { ...authSchema, ...chatSchema };

export const relations = {
  ...defineRelations(schema),
  ...authSchema.authRelations,
};
