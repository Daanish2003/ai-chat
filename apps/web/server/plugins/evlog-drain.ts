import { definePlugin } from "nitro";
import { createFsDrain } from "evlog/fs";

export default definePlugin((nitroApp) => {
  if (!import.meta.dev) return;
  nitroApp.hooks.hook("evlog:drain", createFsDrain());
});
