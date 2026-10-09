import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { checkCredentials } from "../credentials/check";
import {
  credentialHint,
  credentialServices,
  saveCredentialsInput,
} from "../shared/credentials/services";
import { deleteCredentials, listCredentials, saveCredentials } from "../credentials/store";
import { protectedProcedure } from "../index";

/** Provider credentials and Tool credentials. Write-only: the client only ever sees hints (ADR 0003). */
export const credentialsRouter = {
  list: protectedProcedure.handler(({ context }) =>
    listCredentials(context.deps, context.session.user.id),
  ),

  save: protectedProcedure.input(saveCredentialsInput).handler(async ({ context, input }) => {
    const result = await checkCredentials(input.service, input.fields, context.deps.fetch);
    if (result.status === "rejected") {
      throw new ORPCError("BAD_REQUEST", {
        message: result.message,
        data: { reason: result.reason },
      });
    }
    const summary = {
      service: input.service,
      hint: credentialHint(input.fields),
      verified: result.status === "verified",
    };
    await saveCredentials(context.deps, context.session.user.id, {
      ...summary,
      fields: input.fields,
    });
    return summary;
  }),

  delete: protectedProcedure
    .input(z.object({ service: z.enum(credentialServices) }))
    .handler(async ({ context, input }) => {
      await deleteCredentials(context.deps, context.session.user.id, input.service);
    }),
};
