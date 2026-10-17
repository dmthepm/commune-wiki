interface SiteConfig {
  name: string;
  description: string;
  url: string;
  repo: string;
}

export const siteConfig: SiteConfig = {
  name: 'Commune',
  description: 'A personal wiki from markdown files. Find connections while you write. Publish with Astro.',
  url: 'https://commune.md',
  repo: 'https://github.com/dmthepm/commune-wiki',
};
