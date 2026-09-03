# Enhanced Pane Schema for Commune Wiki

## Current Schema (from your notes)
```yaml
---
title: "Voice in, approvals out"
visibility: public
status: evergreen
tags: [workflow, capture, ai-agents, voice]
aliases: ["voice capture", "approval workflow"]
updated: 2025-10-15
summary: "I pace and talk. That is the input. The agent drafts..."
---
```

## Enhanced Schema Design (Aligned with Notebook v1.2)
```yaml
---
# === CORE CONTENT ===
title: "Voice in, approvals out"
slug: "voice-in-approvals-out"  # auto-generated from title
claim: "I pace and talk. That is the input."  # First line - the atomic claim
summary: "The agent drafts a note, proposes links, and shows a small diff that says why. I approve, merge, link, or ignore."

# === VISIBILITY & STATUS ===
visibility: public  # public, private, draft  
status: live        # draft, live, updated (plain English per spec)
priority: high      # low, medium, high (for your own ranking)

# === TIMESTAMPS ===
created: 2025-10-15T14:30:00Z      # ISO 8601 format
updated: 2025-10-15T18:45:00Z      # Last content modification
last_reviewed: 2025-10-15T18:45:00Z # When you last actively reviewed/edited
published: 2025-10-15T19:00:00Z    # When it went public (if different from created)

# === AUTHORSHIP & PROVENANCE ===
source: voice-capture               # voice-capture, manual-write, ai-draft, import
transcript_id: "2025-10-15-143000" # Link to original transcript if from voice
provenance_display: "from Walk 2025-10-14"  # Human-readable provenance chip
agent_version: "commune-v0.1.2"    # AI agent version that helped create this
manual_edits: true                  # Boolean: has this been manually edited post-AI?
creator: "devon-meadows"            # Primary creator
contributors: []                    # List of people who contributed via Proposals

# === CONTENT METRICS ===
word_count: 247
reading_time: 2  # minutes
connection_count: 8  # number of [[wikilinks]] in the content
backlink_count: 12   # number of notes that link TO this note (calculated)

# === CATEGORIZATION ===
tags: [workflow, capture, ai-agents, voice]
categories: [productivity, systems]  # broader than tags
aliases: ["voice capture", "approval workflow", "voice-to-note"]
canonical_url: "/notes/voice-in-approvals-out/"  # for SEO

# === SEO & SOCIAL ===
meta_description: "A workflow for converting voice thoughts into structured notes using AI assistance and human approval"
og_image: "/images/notes/voice-in-approvals-out.png"  # custom or auto-generated
twitter_card: "summary"
keywords: ["voice notes", "AI workflow", "knowledge management", "digital garden"]

# === CONNECTIONS & RELATIONSHIPS ===
related_notes: ["zen-practice-protects-attention", "ask-the-brain", "auto-essay-closes-loop"]
parent_notes: []      # hierarchical relationships if needed
child_notes: []       # child concepts
similar_notes: []     # AI-suggested similar content

# === QUALITY & COMPLETENESS ===
completeness: 0.85    # 0.0-1.0 how complete you think this note is
confidence: 0.9       # 0.0-1.0 how confident you are in the content
needs_review: false   # flag for notes that need attention
review_reason: ""     # why it needs review

# === SOCIAL SIGNALS (Notebook v1.2) ===
follow_count: 0       # people following this note's updates
collected_by: []      # list of users who collected this note
collected_count: 0    # total collections (social signal)
proposals: []         # suggested edits from trusted followers

# === TECHNICAL METADATA ===
content_hash: "sha256:abc123..."  # content fingerprint for change detection
schema_version: "2.0"             # track schema evolution
export_formats: ["md", "pdf", "html"]  # available export formats
---
```

## Implementation Plan

### Phase 1: Core Timestamps (Immediate)
- Add `created`, `updated`, `last_reviewed` to all notes
- Display these in the UI prominently
- Sort by these fields in the notes index

### Phase 2: Content Metrics (Week 1)
- Calculate `word_count`, `reading_time` automatically
- Count `connection_count` and `backlink_count`
- Show reading time in note headers

### Phase 3: SEO Enhancement (Week 1-2)
- Add proper meta descriptions
- Generate Open Graph images automatically
- Add structured data markup (JSON-LD)
- Implement canonical URLs

### Phase 4: Provenance Tracking (Week 2-3)
- Track `source`, `transcript_id`, `agent_version`
- Add manual edit indicators
- Create changelog/history view

### Phase 5: Connection Intelligence (Week 3-4)
- Auto-suggest `related_notes` using similarity
- Track connection density over time
- Create "most connected" views

## UI Improvements Based on Schema

### Note Header Enhancement
```html
<header class="note-header">
  <h1>{{title}}</h1>
  <div class="note-meta">
    <span class="reading-time">{{reading_time}} min read</span>
    <span class="status-badge status-{{status}}">{{status}}</span>
    <time class="updated" datetime="{{updated}}">Updated {{updated | humanize}}</time>
    {{#if manual_edits}}
    <span class="edit-indicator" title="Manually refined">✏️</span>
    {{/if}}
  </div>
  {{#if summary}}
  <p class="note-summary">{{summary}}</p>
  {{/if}}
</header>
```

### Browse by Recency Views
- **Recent Updates**: Notes sorted by `updated` desc
- **Fresh Thoughts**: Notes sorted by `created` desc  
- **Review Queue**: Notes where `needs_review` is true
- **Dense Connections**: Notes sorted by `connection_count` desc

### Connection Density Indicators
- Show connection count as badges
- Visual indicators for highly connected notes
- "Connection suggestions" based on similar content

This schema supports your vision of:
1. **Atomic notes** with clear provenance
2. **Dense connections** with metrics and tracking  
3. **AI-assisted workflow** with transparency about edits
4. **Discovery and browsing** based on recency and connections
5. **SEO optimization** for the "digital garden collection" goal
6. **Quality tracking** for continuous improvement

The schema grows with your system - start with timestamps and metrics, then add intelligence and social features as the wiki needs them.