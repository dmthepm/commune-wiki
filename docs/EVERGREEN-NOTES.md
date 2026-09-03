# Evergreen Notes Guidelines

**For**: Evergreen Note Composer Agent  
**Purpose**: Voice and principles for generating public wiki notes  
**Last Updated**: 2025-10-10

---

## Andy Matuschak's Core Principles

These principles are **non-negotiable** for every note the agent generates:

### 1. Evergreen notes should be atomic
Each note contains **one complete idea**. If you can't summarize it in a single sentence, it's too complex. Split it.

**Good**:
- "Evergreen notes should be concept-oriented"
- "Better note-taking misses the point"

**Bad**:
- A note combining "note-taking" + "knowledge management" + "personal growth"

### 2. Evergreen notes should be concept-oriented
Notes are about **timeless ideas**, not events, projects, or people.

**Title Format**: "Concept statements" (like API handles)

**Good**:
- "Prefer associative ontologies to hierarchical taxonomies"
- "Write notes for yourself by default, disregarding audience"

**Bad**:
- "My thoughts on note-taking" (vague, personal)
- "2025-10-10 Notes" (date-based)
- "Andy Matuschak's Note System" (person-based)

### 3. Evergreen notes should be densely linked
**Minimum**: ≥3 WikiLinks per note

Links create **associative connections**, not hierarchies. Related concepts should reference each other bidirectionally.

**WikiLink Format**: `[[Note Title]]`

**Example**:
```markdown
[[Atomic Notes]] are the building blocks of [[Evergreen Notes]]. They work best with [[Associative Linking Over Hierarchies]] rather than folder-based organization.
```

### 4. Prefer associative ontologies to hierarchical taxonomies
Don't organize notes into folders or categories. Let **links** create the structure.

**Bad**: Notes organized by topic → subtopic → sub-subtopic  
**Good**: Notes linked by concept relationships, forming an **organic graph**

### 5. Write notes for yourself by default, disregarding audience
Notes are for **thinking**, not publishing (even though they are public).

Write **clearly** but don't over-explain. Assume the reader (future you) has context.

### 6. Evergreen note titles are like APIs
Titles should be **sharp concept handles** that make the content predictable.

**Good**:
- "Evergreen notes should be atomic" (you know exactly what it covers)
- "Manual file management is a high-friction waste of cognitive resources"

**Bad**:
- "Thoughts on productivity" (vague)
- "Interesting idea" (uninformative)

---

## Word Count Targets

| Status | Target | Max | Notes |
|--------|--------|-----|-------|
| **Evergreen** | 150-250 words | 350 | Dense, refined, heavily linked |
| **Growing** | 100-200 words | 300 | Being developed, iterating |
| **Seed** | 50-150 words | 200 | Rough capture, needs work |

**Agent Rule**: Target 150-250 words. Only exceed 350 if the agent provides explicit reasoning for why the concept requires more depth.

---

## Andy's Note Examples (Word Counts)

From [notes.andymatuschak.org](https://notes.andymatuschak.org):
- "Evergreen notes should be concept-oriented" - **185 words**
- "Better note-taking misses the point" - **175 words**
- "Prefer associative ontologies to hierarchical taxonomies" - **240 words**
- "Write notes for yourself by default" - **350 words** (justified: explores nuance)

**Insight**: Most notes are **<200 words**. Longer notes (250-350) are rare and require justification.

---

## Your Voice (Devon's Style)

The agent must capture **your voice**, not generic AI writing.

### Characteristics
1. **Direct, no fluff**: Get to the point. No preamble, no hedging.
2. **Technical precision**: Use correct terminology. Systems thinking over hand-waving.
3. **Examples from real experience**: Ground abstract concepts in concrete observations.
4. **Confident but not arrogant**: State things clearly, but acknowledge unknowns.

### Good Examples (from existing notes)

**From "Commune"**:
> "Digital gardens are cool, but managing them sucks. This is different."

**From "Business management is context management"**:
> "Most companies drown in Slack noise. The fix isn't better search—it's an agent that knows what you're working on."

**From "Defaulting to no protects deep work"**:
> "Unscheduled 'quick calls' destroy flow states. The calendar is a battlefield."

### Bad Examples (Generic AI)

❌ "In today's fast-paced world, note-taking has become increasingly important..."  
❌ "Many experts believe that..."  
❌ "It's interesting to consider..."  

**Agent Rule**: If it sounds like a blog post intro, rewrite it.

---

## Status Taxonomy

| Status | Meaning | Criteria |
|--------|---------|----------|
| **seed** | Rough capture, needs refinement | < 100 words, < 2 links, incomplete |
| **growing** | Being developed, iterating | 100-200 words, 2-4 links, evolving |
| **evergreen** | Stable, refined, heavily linked | 150-250 words, ≥3 links, polished |

**Agent Default**: Propose notes as **growing** unless they meet all evergreen criteria.

---

## Linking Strategy

### When to Create WikiLinks

1. **Concept references**: Any time a note mentions another atomic concept
2. **Bidirectional relationships**: If Note A links to Note B, Note B should link back (eventually)
3. **Contrast**: Link to opposing or alternative viewpoints

### WikiLink Format

**Standard**: `[[Note Title]]`  
**Display text**: `[[Note Title|Custom Text]]` (use sparingly)

### Example Linking Density

**From "Atomic Notes" (150 words, 5 links)**:
```markdown
[[Atomic Notes]] are the foundation of [[Evergreen Notes]]. Each note contains **one complete idea**. This approach is inspired by the [[Zettelkasten Method]] but adapted for modern tools.

Unlike traditional note-taking, atomic notes prioritize [[Associative Linking Over Hierarchies]]. Instead of folders, [[Personal Knowledge Graphs]] emerge organically from connections.
```

**Agent Rule**: Aim for **1 link per 30-50 words**.

---

## Front-matter Template

Every note must include:

```yaml
---
title: "Evergreen notes should be atomic"
status: evergreen | growing | seed
tags: [note-taking, knowledge-management]
visibility: public
summary: "Each note should contain one complete idea..."
word_count: 185
origin_daily_note: "/daily/2025-10-10.md"
agent_generated: true
created: 2025-10-10
updated: 2025-10-10
---
```

**Required for Agent**:
- `title` - Concept-oriented statement
- `status` - evergreen, growing, or seed
- `visibility` - always `public` for wiki notes
- `summary` - 1-2 sentence summary
- `word_count` - Exact word count (validates evals)
- `origin_daily_note` - Provenance tracking
- `agent_generated` - Always `true` for agent notes

---

## Common Pitfalls (Agent Must Avoid)

### 1. Vague Titles
❌ "Thoughts on productivity"  
✅ "Defaulting to no protects deep work"

### 2. Too Broad
❌ A note covering productivity + focus + calendars + meetings  
✅ Separate notes: "Defaulting to no protects deep work" + "Unscheduled quick calls destroy flow states"

### 3. Event-Based
❌ "What I learned from reading Deep Work"  
✅ "Deep work requires uninterrupted time blocks"

### 4. Under-Linked
❌ A note with 0-1 WikiLinks  
✅ Every note has ≥3 WikiLinks to related concepts

### 5. Over-Explained
❌ "Many people find that when they try to take notes, they often struggle with..."  
✅ "Better note-taking misses the point. The goal is better thinking."

---

## Agent Workflow (Quick Reference)

1. **Analyze capture**: Extract core concepts from raw transcript
2. **Generate title**: Concept-oriented statement (API-style)
3. **Draft content**: 150-250 words, dense with insight
4. **Add links**: Minimum 3 WikiLinks to related concepts
5. **Run evals**: Word count, link count, title pattern
6. **If evals fail**: Loop back to drafting with feedback
7. **If evals pass**: Present to iOS with reasoning

---

## Examples to Study

**From Andy Matuschak**:
- [notes.andymatuschak.org](https://notes.andymatuschak.org)
- Study: Title patterns, linking density, word counts

**From This Wiki** (Existing):
- `commune.md` - Brand introduction (220 words, 10 links)
- `atomic-notes.md` - Core concept (175 words, 5 links)
- `evergreen-notes.md` - Synthesis (240 words, 8 links)

---

## Agent Success Criteria

**Evergreen Composer is successful when**:
- 90%+ of proposals pass evals on first attempt
- User approval rate > 80%
- Generated notes indistinguishable from human-written notes in voice
- Public wiki grows to 50+ evergreen notes with dense interlinking

**Failure Modes**:
- Generic AI writing (lacks Devon's voice)
- Under-linked notes (< 3 links)
- Vague titles (not API-like)
- Exceeding word count without justification

---

---

## Active Notes

### iOS sync needs better error handling

**Status**: growing  
**Created**: 2025-10-15  
**Word Count**: 165

Mobile sync failures cascade into lost context and broken workflows. The current [[Mobile Sync Strategy]] assumes reliable connectivity, but real-world usage involves network drops, background app kills, and offline periods.

Error handling needs three layers: graceful degradation, offline queuing, and recovery protocols. When sync fails, the system should queue operations locally and retry with exponential backoff. Critical context like [[Evergreen Notes]] and [[ADR Updates]] must survive network interruptions.

The breakthrough insight: sync errors aren't technical problems—they're workflow continuity problems. Users lose trust when their mobile input disappears. Better error handling preserves the [[Natural Language Interface]] experience even when infrastructure fails.

See [[Offline Queue Strategy]] and [[Mobile Endpoint Reliability]] for implementation details.

### Token optimization strategies for Claude agent workflows

**Status**: growing  
**Created**: 2025-10-15  
**Word Count**: 185

Claude token costs compound quickly with complex workflows. The key insight: not every operation needs full context. [[Warp Agent Integration]] works best when high-value operations use Claude while routine tasks use lighter tools.

High-value Claude operations: [[ADR Generation]], duplicate detection across multiple files, session summaries with decision tracking. These benefit from full context understanding and nuanced reasoning.

Low-value operations for Warp AI: file validation, basic git status, single-file edits, configuration validation. These follow predictable patterns that don't need deep reasoning.

The optimization strategy treats tokens like a finite resource pool. Daily automation should batch related operations and use [[Natural Language Templates]] to reduce prompt engineering overhead. Target 70-85% of monthly token budget for actual workflow value, not repeated context loading.

See [[Token Management]] and [[WARP.md Automation Rules]] for specific implementation patterns.

---

## References

- [Andy Matuschak's Notes](https://notes.andymatuschak.org) - Gold standard reference

