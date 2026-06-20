import { App, Modal, Notice } from "obsidian";
import { INCOMPLETE_TAG, removeTag } from "../shared/tags";
import { loadCandidates, CardItem } from "../shared/cardStack";

export class TriageModal extends Modal {
  private items: CardItem[] = [];
  private completedPaths = new Set<string>();
  private seen = new Set<string>();
  private currentIdx = 0;
  private busy = false;

  constructor(app: App, private readonly tag: string = INCOMPLETE_TAG) {
    super(app);
  }

  private get completeLabel(): string {
    return this.tag === INCOMPLETE_TAG ? "Complete" : "Heal Tag";
  }

  async onOpen() {
    this.modalEl.addClass("note-doctor-triage-modal");
    this.titleEl.setText("Note Doctor");

    // Subtitle sits between the modal title bar and the content area —
    // inserted as a sibling of titleEl so it never participates in slide animations.
    const subtitle = document.createElement("div");
    subtitle.className = "note-doctor-triage-subtitle";
    subtitle.textContent = `Quickly review notes tagged #${this.tag}`;
    this.titleEl.insertAdjacentElement("afterend", subtitle);

    // Keys registered once; handlers resolve the current item dynamically.
    this.scope.register([], "u",      () => { this.triggerCurrentComplete(); return false; });
    this.scope.register([], "i",      () => { this.triggerCurrentIgnore();   return false; });
    this.scope.register([], "o",      () => { this.triggerCurrentReview();   return false; });
    this.scope.register([], "Enter",  () => { this.triggerCurrentReview();   return false; });
    this.scope.register([], "Escape", () => { this.close();                  return false; });

    const loaded = await loadCandidates(this.app, this.tag);
    if (loaded.length === 0) {
      this.contentEl.createEl("p", { cls: "note-doctor-triage-done", text: "✓ No incomplete notes." });
      return;
    }

    this.items = loaded;
    this.renderCard("none");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private activeItems(): CardItem[] {
    return this.items.filter(i => !this.completedPaths.has(i.file.path));
  }

  private navigate(direction: "forward" | "backward") {
    const active = this.activeItems();
    if (!active.length) return;
    this.currentIdx = direction === "forward"
      ? (this.currentIdx + 1) % active.length
      : (this.currentIdx - 1 + active.length) % active.length;
    this.renderCard(direction);
  }

  // ── render ────────────────────────────────────────────────────────────────

  private renderCard(direction: "forward" | "backward" | "none") {
    const active = this.activeItems();

    if (active.length === 0) {
      this.contentEl.empty();
      this.close();
      new Notice("✓ All notes triaged.", 3000);
      return;
    }

    if (this.currentIdx >= active.length) this.currentIdx = 0;
    const item = active[this.currentIdx];

    if (direction !== "none" && active.every(i => this.seen.has(i.file.path))) {
      this.contentEl.empty();
      this.close();
      new Notice("✓ Triage cycle complete.", 3000);
      return;
    }

    this.seen.add(item.file.path);

    const newContainer = this.buildContainer(item, active);
    const viewport = this.contentEl.querySelector<HTMLElement>(".note-doctor-slide-viewport");

    // ── First render ──────────────────────────────────────────────────────
    if (!viewport || direction === "none") {
      this.contentEl.empty();
      const vp = this.contentEl.createEl("div", { cls: "note-doctor-slide-viewport" });
      vp.appendChild(newContainer);
      this.busy = false;
      return;
    }

    // ── Animated render ───────────────────────────────────────────────────
    const oldContainer = viewport.querySelector<HTMLElement>(".note-doctor-card-container");
    if (!oldContainer) {
      viewport.innerHTML = "";
      viewport.appendChild(newContainer);
      this.busy = false;
      return;
    }

    viewport.style.height = `${viewport.getBoundingClientRect().height}px`;

    const outClass = direction === "forward" ? "nd-slide-out-left"  : "nd-slide-out-right";
    const inClass  = direction === "forward" ? "nd-slide-in-right"  : "nd-slide-in-left";

    viewport.classList.add("nd-transitioning");
    oldContainer.classList.add(outClass);
    newContainer.classList.add(inClass);
    viewport.appendChild(newContainer);

    const onDone = (e: Event) => {
      if (e.target !== newContainer) return;
      newContainer.removeEventListener("animationend", onDone);
      newContainer.classList.remove(inClass);
      oldContainer.remove();
      viewport.classList.remove("nd-transitioning");
      viewport.style.height = "";
      this.busy = false;
    };
    newContainer.addEventListener("animationend", onDone);
  }

  private buildContainer(item: CardItem, active: CardItem[]): HTMLElement {
    const container = document.createElement("div");
    container.className = "note-doctor-card-container";

    // ── Navigation bar ────────────────────────────────────────────────────
    const navBar = container.createEl("div", { cls: "note-doctor-nav-bar" });

    const prevBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "← Previous" });
    prevBtn.addEventListener("mousedown", e => e.preventDefault());
    prevBtn.addEventListener("click", () => this.navigate("backward"));

    navBar.createEl("span", {
      cls: "note-doctor-nav-counter",
      text: `${this.currentIdx + 1} / ${active.length}`,
    });

    const nextBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "Next →" });
    nextBtn.addEventListener("mousedown", e => e.preventDefault());
    nextBtn.addEventListener("click", () => this.navigate("forward"));

    // ── Card stack ────────────────────────────────────────────────────────
    const stackWrap = container.createEl("div", { cls: "note-doctor-stack-wrap" });

    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-2" });
    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-1" });

    const topCard = stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-0" });

    topCard.createEl("div", { cls: "note-doctor-card-title", text: item.file.basename });

    if (item.preview) {
      topCard.createEl("div", { cls: "note-doctor-card-preview", text: item.preview });
    } else {
      const previewEl = topCard.createEl("div", { cls: "note-doctor-card-preview" });
      this.app.vault.cachedRead(item.file).then(content => {
        const text = content
          .replace(/^---[\s\S]*?---\n?/, "")
          .replace(/#\w+/g, "")
          .trim()
          .slice(0, 300);
        item.preview = text;
        previewEl.setText(text);
      });
    }

    const hint = topCard.createEl("div", { cls: "note-doctor-card-hint" });
    hint.createEl("span", { text: `U — ${this.completeLabel}` });
    hint.createEl("span", { text: "I — Ignore" });
    hint.createEl("span", { text: "O — Review" });

    const actions = topCard.createEl("div", { cls: "note-doctor-card-actions" });

    const completeBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-complete",
      text: this.completeLabel,
    });
    completeBtn.addEventListener("mousedown", e => e.preventDefault());
    completeBtn.addEventListener("click", () => this.doComplete(item, completeBtn));

    const ignoreBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-incomplete",
      text: "Ignore",
    });
    ignoreBtn.addEventListener("mousedown", e => e.preventDefault());
    ignoreBtn.addEventListener("click", () => this.doIgnore(ignoreBtn));

    const reviewBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-open",
      text: "Review",
    });
    reviewBtn.addEventListener("mousedown", e => e.preventDefault());
    reviewBtn.addEventListener("click", () => this.doOpen(item, reviewBtn));

    return container;
  }

  // ── hotkey trigger helpers ────────────────────────────────────────────────

  private currentItem(): CardItem | null {
    const active = this.activeItems();
    if (!active.length) return null;
    return active[Math.min(this.currentIdx, active.length - 1)];
  }

  private triggerCurrentComplete() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector<HTMLButtonElement>(".note-doctor-triage-complete");
    this.doComplete(item, btn ?? undefined);
  }

  private triggerCurrentIgnore() {
    const btn = this.contentEl.querySelector<HTMLButtonElement>(".note-doctor-triage-incomplete");
    this.doIgnore(btn ?? undefined);
  }

  private triggerCurrentReview() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector<HTMLButtonElement>(".note-doctor-triage-open");
    this.doOpen(item, btn ?? undefined);
  }

  // ── flash helper ──────────────────────────────────────────────────────────

  private flashThen(btn: HTMLElement | undefined, cls: string, action: () => void | Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    if (!btn) { action(); return; }
    btn.classList.add(cls);
    btn.addEventListener("animationend", () => {
      btn.classList.remove(cls);
      action();
    }, { once: true });
  }

  // ── actions ───────────────────────────────────────────────────────────────

  private doComplete(item: CardItem, btn?: HTMLElement) {
    this.flashThen(btn, "nd-flash-green", async () => {
      await removeTag(this.app, item.file, this.tag);
      this.completedPaths.add(item.file.path);
      const active = this.activeItems();
      if (this.currentIdx >= active.length) this.currentIdx = Math.max(0, active.length - 1);
      this.renderCard("forward");
    });
  }

  private doIgnore(btn?: HTMLElement) {
    this.flashThen(btn, "nd-flash-red", () => this.navigate("forward"));
  }

  private doOpen(item: CardItem, btn?: HTMLElement) {
    this.flashThen(btn, "nd-flash-blue", () => {
      this.close();
      this.app.workspace.getLeaf("tab").openFile(item.file);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
