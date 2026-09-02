---
title: "About this wiki"
url: "/about-this-wiki/"
summary: "What the pages collection is for, and how a standalone page differs from a note."
aliases: ["About"]
tags: [meta]
created: 2026-09-02
updated: 2026-09-02
---

This is an example of the **pages** collection: a standalone editorial page that
lives outside `/notes/` and `/research/`, but is still a first-class citizen of
the wiki.

## Why pages exist

A note is one idea, linked to other ideas. Research is long-form. Neither shape
fits a landing page, an about page, or a project page — those are written once,
edited deliberately, and read top to bottom.

Registering them as a collection buys three things a loose `.astro` file cannot:

- they appear in **search**, because the graph indexes them
- they are valid `[[WikiLink]]` targets, so notes can link to them by title
- they get **backlinks**, so you can see which notes point here

## How it works

Each page declares its own `url` in frontmatter. That URL is authoritative — the
graph uses it as the page's canonical identity, and `src/pages/[...page].astro`
renders the page there. Pages are always public, and they are deliberately
excluded from star ranking, which is a measure of how connected your *notes*
are.

Link to one from any note the same way you link to anything else, using its
exact title: `[[About this wiki]]`.
