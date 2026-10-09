import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  attachmentKind,
  maxAttachmentBytes,
  normalizedMediaType,
} from "../shared/attachments/kinds";
import { saveAttachment } from "../attachments/store";
import { protectedProcedure } from "../index";

export const attachmentRouter = {
  /**
   * Stores a file to attach to a later Message; the chat command sends its id. Only images
   * (JPEG/PNG/GIF/WebP), PDFs and UTF-8 text files up to 5 MB.
   */
  upload: protectedProcedure
    .input(z.object({ file: z.file() }))
    .handler(async ({ context, input: { file } }) => {
      if (file.size > maxAttachmentBytes) {
        throw new ORPCError("BAD_REQUEST", { message: `"${file.name}" is larger than 5 MB` });
      }
      const kind = attachmentKind(file.type, file.name);
      if (!kind) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${file.name}" can't be attached: only images, PDFs and text files can`,
        });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (kind === "text" && !isUtf8(bytes)) {
        throw new ORPCError("BAD_REQUEST", { message: `"${file.name}" isn't a UTF-8 text file` });
      }
      return saveAttachment(context.deps, context.session.user.id, {
        filename: file.name,
        mediaType: normalizedMediaType(file.type, file.name),
        bytes,
      });
    }),
};

function isUtf8(bytes: Uint8Array) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}
