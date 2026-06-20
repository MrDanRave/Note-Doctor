import { App, TFile } from "obsidian";

export const INCOMPLETE_TAG = "INCOMPLETE";

export function hasTag(app: App, file: TFile, tag: string): boolean {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.tags) return false;
  return cache.tags.some((t) => t.tag === `#${tag}`);
}

export async function removeTag(app: App, file: TFile, tag: string): Promise<void> {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.tags) return;

  const targets = cache.tags.filter((t) => t.tag === `#${tag}`);
  if (targets.length === 0) return;

  await app.vault.process(file, (content) => {
    let result = content;
    const positions = targets
      .map((t) => t.position)
      .sort((a, b) => b.start.offset - a.start.offset);

    for (const pos of positions) {
      const before = result.slice(0, pos.start.offset);
      const after = result.slice(pos.end.offset);
      const trimmed = after.replace(/^\n/, "");
      result = before + trimmed;
    }
    return result;
  });
}

export async function addTag(app: App, file: TFile, tag: string): Promise<void> {
  if (hasTag(app, file, tag)) return;
  await app.vault.process(file, (content) => {
    const marker = `#${tag}`;
    if (content.endsWith("\n")) return content + marker + "\n";
    return content + "\n" + marker + "\n";
  });
}

// Backwards-compatible aliases used by older call sites.
export const hasIncompleteTag  = (app: App, file: TFile) => hasTag(app, file, INCOMPLETE_TAG);
export const removeIncompleteTag = (app: App, file: TFile) => removeTag(app, file, INCOMPLETE_TAG);
export const addIncompleteTag  = (app: App, file: TFile) => addTag(app, file, INCOMPLETE_TAG);
