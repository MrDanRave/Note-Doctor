# Note Doctor

An Obsidian plugin that keeps your notes healthy — auto-tag new notes, review and manage notes by tag.
<img width="718" height="477" alt="Recording 2026-06-20 192224" src="https://github.com/user-attachments/assets/3a34bd69-f673-4843-8e30-c3a524792c61" />
>This software was vibe coded
---

## Features

### 🩺 The Doctor — Patient Queue
Opens a stacked card interface showing every note that carries the plaster tag. Cards slide in and out with animations as you move through the queue.

**Keyboard shortcuts (while the queue is open):**

| Key | Action |
|---|---|
| `U` | Mark the note as healed (removes the plaster tag) |
| `I` | Ignore — skip and move to the next note |
| `O` or `Enter` | Open the note for a full review |
| `Escape` | Close the queue |

The `← Previous` and `Next →` buttons let you navigate in both directions. Progress is shown as `current / total` (e.g. `5 / 40`).

### 💉 The Nurse
Automatically applies a configurable *plaster tag* (default: `#INCOMPLETE`) to every new note the moment it is created. Two commands let you manage the tag manually from any note:

| Command | Action |
|---|---|
| **The Nurse — Apply plaster tag** | Adds the plaster tag to the active note |
| **The Nurse — Remove plaster tag** | Removes the plaster tag from the active note |

Assign hotkeys to these commands in **Settings → Hotkeys** by searching for *"Nurse"*.


---

## Installation

### Manual (current)
1. Run `npm install` then `npm run build` inside the plugin folder to produce `main.js`.
2. Copy `main.js` and `manifest.json` into your vault at:
   ```
   .obsidian/plugins/note-doctor/
   ```
3. Restart Obsidian, then enable **Note Doctor** under **Settings → Community Plugins**.

### Community Plugin Browser (pending review)
Once approved, Note Doctor will be installable directly from **Settings → Community Plugins → Browse**.


---

## Settings

| Setting | Description |
|---|---|
| **Plaster Tag** | Tag used to mark notes for the Doctor's review. Enter without `#`. Default: `INCOMPLETE` |
| **The Nurse** | Auto-tags new notes and enables the apply/remove hotkey commands |
| **Patient Queue** | Enables the Doctor's triage card view |

---

## Development

```bash
cd note-doctor
npm install
npm run dev      # watch mode — rebuilds on save
npm run build    # production build
```

Requires Node 18+ and TypeScript 5+.

---

## License

see [LICENSE](LICENSE).
