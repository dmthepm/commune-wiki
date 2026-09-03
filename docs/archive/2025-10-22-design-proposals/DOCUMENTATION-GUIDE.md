# Commune Wiki - Documentation Guide

**Purpose**: Define what documentation belongs in this repo, and where each kind of file goes

**Last Updated**: 2025-10-21

---

## Documentation Structure

### ✅ Belongs in commune-wiki

**Root Level**:
- `README.md` - Project overview, features, quick start
- `CONTRIBUTING.md` - How to contribute (OSS standard)
- `LICENSE` - MIT license
- `DOCUMENTATION-GUIDE.md` - This file (meta-documentation)

**docs/** (User-Facing Guides):
- Installation guides
- Deployment tutorials (Cloudflare Pages, Netlify, Vercel)
- Customization guides (themes, plugins, design system)
- User documentation (how to write notes, use WikiLinks, etc.)

**Technical Docs** (Optional):
- `ARCHITECTURE.md` - Technical architecture of the SSG
- `DESIGN-SYSTEM.md` - CSS variables, components
- API documentation (if extensible via plugins)

---

### ❌ Does NOT Belong in commune-wiki

**Internal Operations** → devon-homelab repo (private):
- Infrastructure setup
- Deployment credentials
- Service management
- Monitoring dashboards

---

## Governance Rules

### BEFORE Creating New .md File in Root, Ask:

1. **Is this for contributors?**
   - → Add to `CONTRIBUTING.md` or create in `docs/contributing/`

2. **Is this user documentation?**
   - → Create in `docs/` subdirectory (installation, customization, etc.)

3. **Is this technical architecture?**
   - → Create `ARCHITECTURE.md` or `docs/ARCHITECTURE.md`

4. **Is this deployment/ops?**
   - → **Move to devon-homelab repo** (private)

### Allowed Root-Level Files (OSS Standard):

- `README.md` - Project overview
- `CONTRIBUTING.md` - Contribution guide
- `LICENSE` - MIT
- `CHANGELOG.md` - Release notes (optional)
- `CODE_OF_CONDUCT.md` - Community standards (optional)
- `SECURITY.md` - Security policy (optional)
- `DOCUMENTATION-GUIDE.md` - This file

**Rule**: Keep root clean. Maximum ~5-7 markdown files.

---

## docs/ Directory Structure (Proposed)

```
docs/
├── installation/
│   ├── quick-start.md
│   ├── advanced-setup.md
│   └── troubleshooting.md
├── deployment/
│   ├── cloudflare-pages.md
│   ├── netlify.md
│   └── vercel.md
├── customization/
│   ├── themes.md
│   ├── design-system.md
│   └── plugins.md
├── user-guide/
│   ├── writing-notes.md
│   ├── wikilinks.md
│   ├── backlinks.md
│   └── search.md
└── ARCHITECTURE.md (technical overview)
```

---

## Principles for Documentation

**1. Public by Default**:
- All documentation in this repo is public
- No sensitive information (API keys, credentials)
- Focus on user value, not internal planning

**2. User-Centric**:
- Written for end users and contributors
- Clear, actionable, tested
- Examples over theory

**3. Versioned**:
- Update docs in same PR as code changes
- Keep changelog for major releases
- Link to specific versions if API changes

**4. Minimal**:
- Don't create docs for the sake of docs
- README is often enough for small features
- Link to external resources when appropriate

**5. Searchable**:
- Use clear headers and structure
- Include keywords users would search for
- Cross-link related docs

---

## Example

```markdown
# How to Deploy to Cloudflare Pages

1. Connect GitHub repo to Cloudflare
2. Set build command: `pnpm build`
3. Set output directory: `dist/`
4. Deploy!

See full guide: docs/deployment/cloudflare-pages.md
```

---

## Questions?

**Unsure where documentation belongs?**

Ask:
- Is it about using or contributing to the wiki generator? → commune-wiki
- Is it about infrastructure or deployment secrets? → devon-homelab

---

**Maintained By**: Devon Meadows
**License**: MIT
**Status**: Active
