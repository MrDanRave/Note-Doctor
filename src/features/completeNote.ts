import { App, Notice } from "obsidian";
import { addTag, hasTag, removeTag } from "../shared/tags";

export interface NurseHost {
  /** Whether the Nurse is enabled — read at call time. */
  isEnabled(): boolean;
  /** The active plaster tag — read at call time so settings changes apply immediately. */
  getActiveTag(): string;
  /** Advance to the next plaster; returns the new active tag, or null if there is only one. */
  cyclePlaster(): Promise<string | null>;
}

export function registerCompleteNoteCommands(app: App, host: NurseHost, addCommand: (cmd: object) => void): void {
  addCommand({
    id: "complete-note",
    name: "The Nurse — Remove plaster tag",
    checkCallback: (checking: boolean) => {
      const file = app.workspace.getActiveFile();
      if (!host.isEnabled() || !file) return false;
      if (checking) return true;
      const tag = host.getActiveTag();
      void (async () => {
        await removeTag(app, file, tag);
        const n = new Notice("", 2000);
        n.noticeEl.createEl("span", { text: "Plaster removed: " });
        n.noticeEl.createEl("span", { text: `#${tag}`, cls: "nd-nurse-strike-tag" });
      })();
      return true;
    },
  });

  addCommand({
    id: "mark-incomplete",
    name: "The Nurse — Apply plaster tag",
    checkCallback: (checking: boolean) => {
      const file = app.workspace.getActiveFile();
      if (!host.isEnabled() || !file) return false;
      if (checking) return true;
      const tag = host.getActiveTag();
      if (!hasTag(app, file, tag)) void addTag(app, file, tag);
      return true;
    },
  });

  addCommand({
    id: "cycle-plaster",
    name: "The Nurse — Cycle plaster tag",
    checkCallback: (checking: boolean) => {
      if (!host.isEnabled()) return false;
      if (checking) return true;
      void (async () => {
        const next = await host.cyclePlaster();
        const n = new Notice("", 1500);
        if (next === null) {
          n.noticeEl.createEl("span", { text: `Only one plaster: #${host.getActiveTag()}` });
        } else {
          n.noticeEl.createEl("span", { text: "Active plaster: " });
          n.noticeEl.createEl("span", { text: `#${next}`, cls: "nd-nurse-active-tag" });
        }
      })();
      return true;
    },
  });
}
