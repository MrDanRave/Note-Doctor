import { App } from "obsidian";
import { addTag, hasTag, removeTag } from "../shared/tags";

export function registerCompleteNoteCommands(app: App, tag: string, addCommand: (cmd: object) => void): void {
  addCommand({
    id: "complete-note",
    name: "The Nurse — Remove plaster tag",
    callback: async () => {
      const file = app.workspace.getActiveFile();
      if (!file) return;
      await removeTag(app, file, tag);
    },
  });

  addCommand({
    id: "mark-incomplete",
    name: "The Nurse — Apply plaster tag",
    callback: async () => {
      const file = app.workspace.getActiveFile();
      if (!file) return;
      if (!hasTag(app, file, tag)) {
        await addTag(app, file, tag);
      }
    },
  });
}
