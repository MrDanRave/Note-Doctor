import { App, TFile } from "obsidian";

export interface CardItem {
  file: TFile;
  preview: string; // first ~300 chars of content
}

export interface CardStackCallbacks {
  onComplete: (file: TFile) => Promise<void>;
  onSkip: (file: TFile) => void;
  onOpen: (file: TFile) => void;
}

export async function loadCandidates(app: App, tag: string, previewCount = 3): Promise<CardItem[]> {
  const files = app.vault.getMarkdownFiles();
  const candidates: TFile[] = [];

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.tags?.some((t) => t.tag === `#${tag}`)) {
      candidates.push(file);
    }
  }

  const items: CardItem[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const file = candidates[i];
    let preview = "";
    if (i < previewCount) {
      const content = await app.vault.cachedRead(file);
      preview = content
        .replace(/^---[\s\S]*?---\n?/, "")
        .replace(/#\w+/g, "")
        .trim()
        .slice(0, 300);
    }
    items.push({ file, preview });
  }

  return items;
}

export function renderCardStack(
  container: HTMLElement,
  items: CardItem[],
  callbacks: CardStackCallbacks,
  app: App,
  tag: string
): () => void {
  let stack = [...items];

  function render() {
    container.empty();

    if (stack.length === 0) {
      container.createEl("div", { cls: "note-doctor-triage-done", text: "✓ All caught up!" });
      return;
    }

    const counter = container.createEl("div", { cls: "note-doctor-triage-counter" });
    counter.setText(`${stack.length} note${stack.length !== 1 ? "s" : ""} remaining`);

    const stackWrap = container.createEl("div", { cls: "note-doctor-stack-wrap" });

    const visible = stack.slice(0, 3);
    visible.forEach((item, i) => {
      const card = stackWrap.createEl("div", { cls: `note-doctor-card note-doctor-card-depth-${i}` });
      if (i > 0) return;

      card.createEl("div", { cls: "note-doctor-card-title", text: item.file.basename });

      if (item.preview) {
        card.createEl("div", { cls: "note-doctor-card-preview", text: item.preview });
      } else {
        app.vault.cachedRead(item.file).then((content) => {
          const text = content
            .replace(/^---[\s\S]*?---\n?/, "")
            .replace(/#\w+/g, "")
            .trim()
            .slice(0, 300);
          item.preview = text;
          const previewEl = card.querySelector(".note-doctor-card-preview");
          if (!previewEl) {
            card.createEl("div", { cls: "note-doctor-card-preview", text });
          }
        });
      }

      const actions = card.createEl("div", { cls: "note-doctor-card-actions" });

      const completeBtn = actions.createEl("button", { cls: "note-doctor-triage-btn note-doctor-triage-complete", text: "✓ Complete" });
      completeBtn.addEventListener("click", async () => {
        await callbacks.onComplete(item.file);
        stack.shift();
        render();
      });

      const skipBtn = actions.createEl("button", { cls: "note-doctor-triage-btn note-doctor-triage-skip", text: "→ Skip" });
      skipBtn.addEventListener("click", () => {
        callbacks.onSkip(item.file);
        stack.push(stack.shift()!);
        render();
      });

      const openBtn = actions.createEl("button", { cls: "note-doctor-triage-btn note-doctor-triage-open", text: "↗ Open" });
      openBtn.addEventListener("click", () => callbacks.onOpen(item.file));
    });
  }

  render();

  return async () => {
    const fresh = await loadCandidates(app, tag);
    const freshPaths = new Set(fresh.map((i) => i.file.path));
    stack = stack.filter((i) => freshPaths.has(i.file.path));
    for (const item of fresh) {
      if (!stack.some((s) => s.file.path === item.file.path)) {
        stack.push(item);
      }
    }
    render();
  };
}
