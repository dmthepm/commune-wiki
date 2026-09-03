# Gamification & Discovery Vision for Commune

**Date**: 2025-10-16
**Status**: Brainstorming / Vision Doc
**Context**: Removing status badges. Exploring gamification that aligns with "finding yourself + making unique connections"

---

## The Real Currency

**Not**: Word count, backlinks, note maturity
**But**: Authentic voice + unique connections + depth of self-exploration

The incentive is to **communicate your thoughts well** and **make unique connections**. A short note with few links could be the best one. Activity metrics ≠ insight metrics.

---

## Immediate Decision: Remove Status Badges

**Why**:
- Manual tracking (draft/live/updated) adds friction
- Doesn't align with "voice in, approvals out" workflow
- Everything will be "live" anyway in public wiki
- The chips looked good but content didn't feel meaningful

**What stays**:
- Date (automatic, meaningful)
- "Links to this note" section (organic signal)

---

## Gamification Ideas

### 1. Skool-Style Visual Indicators for Highly-Connected Notes

**Inspiration**: Skool's revenue-based emojis
- 🚀 Rocket = $10K+ MRR
- 👑 Crown = $50K+ MRR
- 🐐 GOAT = Top earner on platform

**For Commune**: Emoji/visual indicators for notes that become "hub" concepts

**Potential tiers**:
- **Standard** (0-2 backlinks): No indicator
- **Growing** (3-5 backlinks): Small dot or 🌱
- **Hub** (6-10 backlinks): ⭐ or 🔥
- **Core Concept** (10+ backlinks): 💎 or 🧠

**Questions to answer**:
- Should this be visible always, or only on hover?
- Does this create perverse incentive to over-link?
- Is backlink count the right metric, or something else?

### 2. "Links to This Note" as Primary Signal

Already implemented and styled. This becomes the main gamification:
- "5 links to this note" = visible signal of connectedness
- Shows organic graph growth
- No manual updating required

**Potential enhancements**:
- Show quality of connections (who's linking? from where?)
- Highlight unexpected connections
- "This note connects to 3 different themes" (synthesis indicator)

### 3. "Revised X Times" Indicator

Shows note development over time:
- "Revised 5 times" = refinement, not dump-and-forget
- Signals ongoing thought development
- Automatic from git history or manual tracking

**Implementation**: Track edits in frontmatter or derive from git log

---

## Bigger Vision: Discovery Mechanisms

### Weekly AI-Generated Essays

**Core idea**: Agent synthesizes the week's notes into narrative essay
- Auto-generates every week
- Links back to atomic notes (receipts for claims)
- Email to followers: "Here's what Devon was thinking this week"
- **Key insight**: "Great thinkers aren't necessarily great writers"

**Value prop**: Substack-style output without performative writing labor

**Questions**:
- How do we train agent to match Devon's voice?
- How much editorial control does user have?
- Does this become a separate "Essays" section or part of main navigation?

### Discovery Views Beyond "Recent Notes"

**Problem**: Chronological is boring. Need interesting lenses into the graph.

**Potential views**:
1. **Most Connected** - hub notes, core concepts
2. **Recently Revised** - notes under active development
3. **New Connections** - notes that recently linked to other themes
4. **Standalone** - notes with 0-1 links (need integration?)
5. **Cross-Theme** - notes that bridge different topic clusters
6. **Reader Questions** - notes that sparked questions/suggestions

**Question**: How do we make these views **compelling** without feeling like analytics?

### Following a Brain

If you follow someone's Commune:
- Weekly synthesis email (auto-essay)
- "What have they been thinking lately?" view
- See their exploration process, not just outputs

---

## What We DON'T Know Yet (Pending Research)

**Devon is researching**:
- What signals authenticity vs. performance?
- How do platforms train users to explore vs. optimize for metrics?
- What makes short, rough thoughts valuable vs. noise?

**Once we have this**: Synthesize with digital garden research to design the real indicator system.

---

## Open Questions

1. **Mobile behavior**: How do visual indicators work on mobile? Tap to reveal hover state?

2. **Unexpected connections**: How do we detect if a connection is "unexpected" vs. obvious?
   - Topic modeling?
   - Distance in graph?
   - Manual tagging?

3. **Reader interactions**: Until we have actual users, "sparked 2 reader questions" is theoretical. What's the MVP signal?

4. **Profile-level vs. note-level**: Maybe the indicator isn't about individual notes but about the PERSON:
   - "Devon has explored 37 atomic ideas"

5. **Preventing gaming**: Any visible metric can be gamed. How do we design for authenticity?

---

## Next Steps

1. ✅ Remove status badges (deploy clean)
2. ⏳ Devon completes external research on self-discovery platforms
3. ⏳ Synthesize findings: digital gardens + platform currencies + Commune vision
4. 🔮 Design v2 of note indicators (if needed at all)
5. 🔮 Prototype weekly essay generation
6. 🔮 Build discovery views

---

## Related Docs

- [Evergreen Notes Guidelines](EVERGREEN-NOTES.md)
