# Contributing to Commune Wiki

Thank you for your interest in contributing to Commune Wiki! This document provides guidelines for contributing to this open-source project.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Submission Guidelines](#submission-guidelines)
- [Coding Standards](#coding-standards)

---

## Code of Conduct

This project follows standard open-source community guidelines:
- Be respectful and constructive
- Focus on what is best for the community
- Show empathy towards other community members

---

## How Can I Contribute?

### 🐛 Reporting Bugs

**Before submitting a bug report**:
- Check existing [GitHub Issues](https://github.com/dmthepm/commune-wiki/issues)
- Include clear steps to reproduce
- Describe expected vs actual behavior
- Include screenshots if relevant

**Bug Report Template**:
```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots/Logs**
If applicable.

**Environment**:
- Node version: [e.g. 20.10.0]
- pnpm version: [e.g. 8.15.0]
- OS: [e.g. macOS 14.0]
```

### 💡 Feature Requests

**Before requesting a feature**:
- Check existing [GitHub Issues](https://github.com/dmthepm/commune-wiki/issues)
- Explain the use case clearly
- Describe how it benefits users

**Feature Request Template**:
```markdown
**Problem Statement**
What problem does this solve?

**Proposed Solution**
How should it work?

**Alternatives Considered**
What other approaches did you consider?

**Additional Context**
Any mockups, examples, or references.
```

### 🔧 Pull Requests

**Good First Issues**:
- Look for `good-first-issue` label
- Documentation improvements
- Bug fixes
- Test coverage improvements

**Pull Request Process**:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test locally: `pnpm dev` and `pnpm build`
5. Commit with clear messages (see [Commit Guidelines](#commit-guidelines))
6. Push to your fork
7. Open a Pull Request

---

## Development Setup

### Prerequisites

- **Node.js**: 20+ (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **pnpm**: 8+ (`npm install -g pnpm`)
- **Git**: Latest version

### Local Development

```bash
# Clone your fork
git clone git@github.com:YOUR_USERNAME/commune-wiki.git
cd commune-wiki

# Add upstream remote
git remote add upstream git@github.com:dmthepm/commune-wiki.git

# Install dependencies
pnpm install

# Start dev server (http://localhost:4321)
pnpm dev

# In another terminal, test production build
pnpm build
pnpm preview
```

### Project Structure

```
commune-wiki/
├── src/
│   ├── content/
│   │   ├── notes/          # Wiki notes (markdown)
│   │   ├── research/       # Long-form research
│   │   └── updates/        # Blog-style updates
│   ├── components/         # Astro components
│   ├── layouts/            # Page layouts
│   ├── styles/             # Global CSS
│   ├── lib/graph.ts        # The content graph core
│   ├── cli/                # The `commune` CLI
│   ├── remark-wikilinks.ts # WikiLinks plugin
│   ├── rehype-external-links.ts
│   └── integration.ts      # Backlinks / markdown-twin integration
├── bin/commune.mjs         # CLI entry point (runs lib/)
├── public/                 # Static assets
├── scripts/                # Build scripts
└── astro.config.mjs        # Astro configuration
```

### Testing Your Changes

**Before submitting a PR**:

```bash
# 1. Build succeeds
pnpm build

# 2. Preview looks correct
pnpm preview
# Open http://localhost:4321

# 3. WikiLinks work
# Create test note with [[WikiLink]] syntax
# Verify link renders correctly

# 4. Backlinks generate
# Check /notes/your-note shows backlinks section

# 5. Search works
# Test Cmd-K palette search
```

---

## Submission Guidelines

### Commit Guidelines

**Format**: `type: concise description`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semi-colons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests
- `chore`: Maintain, dependencies, config

**Examples**:
```bash
feat: add RSS feed for notes
fix: wikilink parsing for notes with dashes
docs: update installation instructions
refactor: extract backlinks logic to separate file
```

### Pull Request Guidelines

**PR Title**: Same format as commit messages

**PR Description Template**:
```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
How did you test this?

## Screenshots (if applicable)
Before/after screenshots.

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have tested my changes locally
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have updated the documentation accordingly
```

---

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript where possible
- Prefer `const` over `let`
- Use async/await over .then()
- Extract complex logic into separate functions

**Example**:
```typescript
// ✅ Good
const processNote = async (note: Note): Promise<ProcessedNote> => {
  const links = extractWikiLinks(note.content);
  const backlinks = await generateBacklinks(note.slug);
  return { ...note, links, backlinks };
};

// ❌ Avoid
function processNote(note) {
  return new Promise(resolve => {
    // Complex nested logic
  });
}
```

### Markdown Content

**Frontmatter** (required):
```yaml
---
title: "Your Note Title"
visibility: "public"  # or "private"
status: "evergreen"   # or "seedling", "budding"
summary: "One-sentence summary"
tags: [tag1, tag2]
---
```

**WikiLinks**:
```markdown
Link to other notes: [[Note Title]]
Link with custom text: [[Note Title|custom text]]
```

**Headers**:
- Use sentence case (not Title Case)
- One H1 (`#`) per note (title)
- Start content with H2 (`##`)

### CSS/Styling

- Use design system variables (see `src/styles/design-system.css`)
- Prefer utility classes for simple styling
- Custom components for complex UI

**Example**:
```astro
<!-- ✅ Good - uses design system -->
<button class="button-primary">
  Click me
</button>

<!-- ❌ Avoid - inline styles -->
<button style="background: blue;">
  Click me
</button>
```

---

## Additional Resources

**Documentation**:
- [Astro Docs](https://docs.astro.build/)
- [Markdown Guide](https://www.markdownguide.org/)
- [Remark Plugins](https://github.com/remarkjs/remark/blob/main/doc/plugins.md)

**Community**:
- [GitHub Discussions](https://github.com/dmthepm/commune-wiki/discussions)
- [GitHub Issues](https://github.com/dmthepm/commune-wiki/issues)

**Inspiration**:
- [Andy Matuschak's Notes](https://notes.andymatuschak.org/)
- [Maggie Appleton's Garden](https://maggieappleton.com/garden)

---

## Questions?

- **Bugs/Features**: [Open an issue](https://github.com/dmthepm/commune-wiki/issues/new)
- **General Questions**: [Start a discussion](https://github.com/dmthepm/commune-wiki/discussions/new)
- **Security Issues**: DM [@devonmeadows on X](https://x.com/devonmeadows)

---

## License

By contributing to Commune Wiki, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Thank you for contributing!** 🎉
