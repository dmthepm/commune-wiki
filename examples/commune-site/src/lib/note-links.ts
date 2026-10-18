import { readFile } from 'node:fs/promises';
import { getCollection } from 'astro:content';

export interface NoteLinks {
  id: string;
  title: string;
  /** Ids of the public notes this note links to with a wikilink. */
  links: string[];
}

// Wikilinks inside fenced blocks and inline code are examples, not links.
function wikilinkTitles(source: string): string[] {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const prose = body
    .replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1\2[`~]*[ \t]*(?:\n|$)|$)/gm, '')
    .replace(/(`+)[^`]*?\1/g, '');
  return [...prose.matchAll(/\[\[([^\]|#]+)/g)].map(m => m[1].trim().toLowerCase());
}

/** Every public note and the public notes it links to, read from the files. */
export async function loadNoteLinks(): Promise<NoteLinks[]> {
  const notes = await getCollection('notes', note => note.data.visibility === 'public');
  const byTitle = new Map(notes.map(n => [n.data.title.toLowerCase(), n.id]));
  const rows = await Promise.all(
    notes.map(async note => {
      const path = note.filePath ? `${process.cwd()}/${note.filePath}` : `${process.cwd()}/src/content/notes/${note.id}.md`;
      const source = await readFile(path, 'utf8');
      const links = [...new Set(wikilinkTitles(source).map(t => byTitle.get(t)).filter((id): id is string => !!id && id !== note.id))];
      return { id: note.id, title: note.data.title, links };
    }),
  );
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
