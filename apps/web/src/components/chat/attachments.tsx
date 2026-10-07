import {
  acceptAttribute,
  acceptedKinds,
  attachmentKind,
  maxAttachmentBytes,
} from "@ai-chat/api/attachments/kinds";
import type { AttachmentInfo } from "@ai-chat/api/attachments/store";
import { findModel } from "@ai-chat/api/chat/models";
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@ai-chat/ui/components/attachment";
import { Button } from "@ai-chat/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { AttachmentChip } from "@/lib/chat";
import { orpc } from "@/utils/orpc";

/** A file in the composer: uploading, uploaded (with its id), or failed. */
type DraftAttachment = AttachmentChip & {
  key: string;
  state: "uploading" | "done" | "error";
  error?: string;
};

/**
 * The files attached to a Message being written or edited. Each file uploads as soon as it is
 * picked; sending waits until every upload has finished. `initial` are attachments carried over
 * from the Message being edited.
 */
export function useAttachmentDraft(model: string | undefined, initial: AttachmentInfo[] = []) {
  const [items, setItems] = useState<DraftAttachment[]>(() =>
    initial.map((info) => ({ ...info, key: info.id, state: "done" })),
  );
  const upload = useMutation(orpc.attachment.upload.mutationOptions());
  const kinds = acceptedKinds(model ? findModel(model) : undefined);
  const update = (key: string, fields: Partial<DraftAttachment>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...fields } : item)),
    );

  const add = (files: Iterable<File>) => {
    for (const file of files) {
      const kind = attachmentKind(file.type, file.name);
      if (!kind || !kinds.includes(kind)) {
        toast.error(`"${file.name}" can't be attached for this Model`);
        continue;
      }
      if (file.size > maxAttachmentBytes) {
        toast.error(`"${file.name}" is larger than 5 MB`);
        continue;
      }
      const key = crypto.randomUUID();
      setItems((current) => [
        ...current,
        { key, filename: file.name, mediaType: file.type, size: file.size, state: "uploading" },
      ]);
      upload.mutateAsync({ file }).then(
        (info) => update(key, { ...info, state: "done" }),
        (error: Error) => update(key, { state: "error", error: error.message }),
      );
    }
  };

  const uploaded = items.flatMap(({ id, filename, mediaType, size, state }) =>
    state === "done" && id && size !== undefined ? [{ id, filename, mediaType, size }] : [],
  );
  return {
    items,
    add,
    remove: (key: string) => setItems((current) => current.filter((item) => item.key !== key)),
    clear: () => setItems([]),
    /** The uploaded attachments, in order, for the command. */
    uploaded,
    /** Sending must wait: a file is still uploading, or failed and should be removed. */
    pending: items.some((item) => item.state !== "done"),
    /** The `accept` attribute for the file picker; empty when the Model takes no files. */
    accept: acceptAttribute(kinds),
  };
}

export type AttachmentDraft = ReturnType<typeof useAttachmentDraft>;

/** The paperclip: picks files the Model accepts. Hidden when it accepts none. */
export function AttachButton({ draft, disabled }: { draft: AttachmentDraft; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  if (!draft.accept) return null;
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={draft.accept}
        onChange={(event) => {
          draft.add(event.target.files ?? []);
          event.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        disabled={disabled}
        onClick={() => input.current?.click()}
        title="Attach files"
        aria-label="Attach files"
      >
        <PaperclipIcon />
      </Button>
    </>
  );
}

/** The composer's attachments, removable, with upload progress and errors. */
export function DraftAttachmentChips({ draft }: { draft: AttachmentDraft }) {
  if (draft.items.length === 0) return null;
  return (
    <AttachmentGroup className="px-2 pt-1">
      {draft.items.map((item) => (
        <AttachmentChipView
          key={item.key}
          attachment={item}
          state={item.state}
          description={item.state === "error" ? item.error : undefined}
          onRemove={() => draft.remove(item.key)}
        />
      ))}
    </AttachmentGroup>
  );
}

/** A Message's attachments as chips. */
export function AttachmentChips({ attachments }: { attachments: AttachmentChip[] }) {
  if (attachments.length === 0) return null;
  return (
    <AttachmentGroup className="max-w-[80ch]">
      {attachments.map((attachment, index) => (
        <AttachmentChipView key={attachment.id ?? index} attachment={attachment} />
      ))}
    </AttachmentGroup>
  );
}

function AttachmentChipView({
  attachment,
  state = "done",
  description,
  onRemove,
}: {
  attachment: AttachmentChip;
  state?: DraftAttachment["state"];
  description?: string;
  onRemove?: () => void;
}) {
  const kind = attachmentKind(attachment.mediaType, attachment.filename);
  const label = kind === "image" ? "Image" : kind === "pdf" ? "PDF" : "Text";
  return (
    <Attachment size="sm" state={state} className="min-w-0">
      <AttachmentMedia>{kind === "image" ? <ImageIcon /> : <FileTextIcon />}</AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={attachment.filename}>{attachment.filename}</AttachmentTitle>
        <AttachmentDescription>
          {description ??
            [label, attachment.size !== undefined && formatSize(attachment.size)]
              .filter(Boolean)
              .join(" · ")}
        </AttachmentDescription>
      </AttachmentContent>
      {onRemove && (
        <AttachmentAction onClick={onRemove} aria-label={`Remove ${attachment.filename}`}>
          <XIcon />
        </AttachmentAction>
      )}
    </Attachment>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
