# Commune Wiki

An Astro wiki engine — WikiLinks, sliding panes, backlinks, static search — and a `commune` CLI that queries the content graph and checks links.

**License**: MIT · **Live example**: [devonmeadows.com](https://devonmeadows.com)

---

## ✨ Features

- 🔗 **WikiLinks**: `[[Note Title]]` automatically converts to links
- 📑 **Sliding Panes**: Andy Matuschak-style cascading note navigation
- 👁️ **Hover Previews**: See note content on hover before clicking
- 🔄 **Backlinks**: Auto-generated bidirectional link graph
- 🎨 **Design System**: Custom CSS variables with light/dark mode
- 🔍 **Search**: Cmd-K palette with Pagefind static search
- 📝 **Markdown-First**: Git-backed content, version controlled
- 🚀 **Fast**: Static site generation (no runtime database)
- 🎯 **Zero Config**: Works out of the box, customize as needed

---

## 🎯 Who Is This For?

**Personal Knowledge Management**:
- Researchers building interconnected notes (Zettelkasten/Evergreen Notes)
- Writers managing drafts, research, and published content
- Developers documenting code, decisions, and learnings
- Anyone tired of silo'd notes in proprietary apps

**vs. Other Tools**:
| Tool | Approach | Commune Wiki |
|------|----------|--------------|
| Obsidian | Desktop app, proprietary sync | Web-first, self-hosted, MIT |
| Notion | Cloud SaaS, vendor lock-in | Git-backed, own your data |
| Roam | SaaS, $15/mo | Free, open source, MIT |
| Logseq | Local-first, complex setup | Simple Astro build, deploy anywhere |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22.18+ and pnpm

### Install & Run

```bash
# Clone repository
git clone git@github.com:dmthepm/commune-wiki.git
cd commune-wiki

# Install dependencies
pnpm install

# Start dev server (http://localhost:4321)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Create Your First Note

```bash
# Create a note in src/content/notes/
cat > src/content/notes/hello-world.md << 'MDEOF'
---
title: "Hello World"
visibility: "public"
status: "evergreen"
summary: "My first note"
tags: [getting-started]
---

Welcome to your personal wiki!

Link to other notes with [[Note Title]] syntax.
MDEOF

# Start dev server and visit http://localhost:4321
pnpm dev
```

---

## 📁 Project Structure

```
commune-wiki/
├── src/
│   ├── content/
│   │   ├── config.ts       # Content collection schemas
│   │   └── notes/          # Your markdown notes
│   ├── components/
│   │   ├── Header.astro    # Site header
│   │   ├── SearchModal.astro
│   │   └── Backlinks.astro
│   ├── pages/
│   │   ├── index.astro     # Homepage
│   │   └── notes/
│   │       └── [...slug].astro   # Note pages + pane logic
│   └── styles/
│       ├── design-system.css  # Custom CSS variables
│       └── notes.css          # Note typography
├── public/
│   └── backlinks.json      # Auto-generated backlinks graph
├── astro.config.mjs        # Astro config + remark plugins
└── package.json
```

---

## ✍️ Writing Notes

### Note Schema

Every note requires frontmatter:

```markdown
---
title: "Note Title"
visibility: "public"        # public | private | draft
status: "evergreen"         # seed | growing | evergreen
summary: "Brief description for previews"
tags: [tag1, tag2]
aliases: ["Short Name"]
updated: 2025-10-21
---

Your note content here with [[WikiLinks]] to other notes.
```

**Visibility**:
- `public` - Published to site (default: only public notes shown)
- `private` - Not published
- `draft` - Work in progress, not indexed

**Status**:
- `seed` - Early idea, needs development
- `growing` - Actively being refined
- `evergreen` - Well-developed, stable

### WikiLinks Syntax

```markdown
[[Note Title]]                    → Links to note
[[Note Title|Display Text]]       → Custom text
[[Multi-word Note]]               → Normalized matching
```

**How it works**:
1. Build-time plugin scans all notes
2. Creates title → slug lookup index
3. Transforms `[[Title]]` to `<a href="/notes/slug/">`
4. Broken links render as plain text (not clickable)

---

## 🎨 Customization

### Design System

Edit `src/styles/design-system.css`:

```css
:root {
  --c-bg: #0a0a0b;
  --c-accent: #8b7bff;
  --c-text: #e8e6e3;
  /* ... customize colors ... */
}

[data-theme="light"] {
  --c-bg: #fafaf9;
  /* ... light mode overrides ... */
}
```

### Typography

Edit `src/styles/notes.css` for note-specific styling (headings, lists, code blocks).

### Pane Behavior

Pane logic in `src/pages/notes/[...slug].astro`:

```javascript
// Customize pane behavior:
setupPanes()        // Initialize
openPane(url)       // Open new pane
closePane(pane)     // Remove pane
```

---

## 🔍 Search

**Pagefind** generates a static search index at build time:

- No server required
- Instant client-side search
- Automatically indexes all public notes
- Cmd-K hotkey to open search modal

**Dev mode**: Falls back to backlinks.json when Pagefind not available.

---

## 📊 Backlinks

Backlinks are auto-generated at build time via the `src/integration.ts` integration:

1. Scans all notes for WikiLinks
2. Creates bidirectional graph
3. Outputs to `public/backlinks.json` and `<outDir>/backlinks.json`
4. Displayed in `Backlinks.astro` component ("Links to this note")

---

## 🚀 Deployment

### Static Hosting (Recommended)

**Cloudflare Pages / Vercel / Netlify**:

```bash
# Build command
pnpm build

# Output directory
dist-site/   # this repo's own site; `dist/` is the compiled package

# Deploy
# Connect GitHub repo, auto-deploy on push
```

### Self-Hosted (Caddy)

```yaml
# docker-compose.yml
caddy:
  image: caddy:alpine
  volumes:
    - ./dist-site:/srv:ro
    - ./Caddyfile:/etc/caddy/Caddyfile
  ports:
    - "80:80"
    - "443:443"
```

```Caddyfile
# Caddyfile
yourdomain.com {
    root * /srv
    file_server
    try_files {path} {path}/ /index.html
    encode gzip
}
```

### Self-Hosted (Railway)

```bash
# Install Railway CLI
npm install -g railway

# Deploy
railway init
railway up
```

Railway auto-detects Astro and builds with `pnpm build`.

---

## 🛠️ Development

### Commands

```bash
pnpm dev           # Start dev server (port 4321)
pnpm build         # Build production site
pnpm preview       # Preview production build
```

### Testing

```bash
# Run the test suite
pnpm test

# Check the content graph (broken links, duplicate names, ambiguous targets)
node bin/commune.mjs check --json

# Preview before deploying
pnpm preview
```

### Debugging WikiLinks

**Issue**: Links not working?

```bash
# Check cache consistency (should show same count each time)
pnpm build 2>&1 | grep "Lookup built with"

# Find broken links
pnpm build 2>&1 | grep "Broken link"
```

---

## 📦 Tech Stack

- **Astro** - Static site generator
- **Tailwind CSS** - Utility-first styling
- **Pagefind** - Static search index
- **remark-wikilinks** - WikiLink transformation plugin (custom, `src/remark-wikilinks.ts`)
- **No framework dependencies** - Vanilla JS for interactivity

---

## 📖 Documentation

**For Contributors**:
- Architecture details in original README (check git history)
- Pane system implementation in `src/pages/notes/[...slug].astro`
- WikiLink plugin in `src/remark-wikilinks.ts`
- Backlinks integration in `src/integration.ts`

**For Users**:
- This README covers installation and usage
- See [devonmeadows.com](https://devonmeadows.com) for live example
- Issues/questions: [GitHub Issues](https://github.com/dmthepm/commune-wiki/issues)

---

## 🤝 Contributing

This is an open-source project under the MIT License. Contributions welcome!

**How to contribute**:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make changes and test locally (`pnpm dev`)
4. Build to verify (`pnpm build`)
5. Commit with clear message
6. Push and create Pull Request

**Areas for contribution**:
- [ ] Automated tests (Puppeteer or Playwright)
- [ ] Additional themes/design systems
- [ ] Search improvements (fuzzy matching, ranking)
- [ ] Graph visualization of backlinks
- [ ] Mobile responsiveness improvements
- [ ] Performance optimizations

---

## 🐛 Known Issues

### WikiLink Cache Bug (FIXED)

**Symptom**: Links only work on last note built.

**Fix**: Ensure cache size check in `src/remark-wikilinks.ts`:

```typescript
if (notesCache && notesCache.size > 0) {  // MUST check .size!
  return buildFromCache();
}
```

### Pane Styling Not Applied

**Symptom**: Panes don't stack correctly.

**Fix**: Use `<style is:global>` in `[...slug].astro` for dynamic panes.

---

## 📄 License

MIT - See [LICENSE](LICENSE) file.

**What this means**:
- Free to use, modify, distribute, and sell
- Commercial use allowed, with no obligation to open-source your changes
- Keep the copyright notice; that's the whole obligation

---

## 🔗 Related Projects

**Commune Ecosystem**:
- **Devon's Homelab** - Personal infrastructure (private, showcase only)

**Inspired by**:
- [Andy Matuschak's Notes](https://notes.andymatuschak.org/)
- [Maggie Appleton's Digital Garden](https://maggieappleton.com/garden)
- [Obsidian](https://obsidian.md/) (proprietary alternative)
- [Logseq](https://logseq.com/) (local-first alternative)

---

**Created by**: [Devon Meadows](https://devonmeadows.com)  
**Repository**: [dmthepm/commune-wiki](https://github.com/dmthepm/commune-wiki)  
**Support**: [GitHub Issues](https://github.com/dmthepm/commune-wiki/issues)
