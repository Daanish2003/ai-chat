import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

import { useChatAdapter } from "../../core/client/react/provider";

const fallbackFileName = "chat-export.json";

/** Downloads the signed-in user's export (`exportUrl`) as one JSON file, named by the server. */
export function ExportDataButton() {
  const { exportUrl } = useChatAdapter();
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const response = await fetch(exportUrl);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(body?.message ?? "Couldn't export your data");
        return;
      }
      const fileName =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
        fallbackFileName;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast.error("Couldn't export your data");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={download}>
      {pending ? "Preparing…" : "Export my data"}
    </Button>
  );
}
