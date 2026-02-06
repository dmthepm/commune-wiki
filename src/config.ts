/**
 * Site Configuration
 *
 * All personalization lives here. Components import from this file
 * instead of hardcoding values. Edit this file to make the wiki yours.
 *
 * After editing, rebuild: pnpm build
 */

export interface SiteConfig {
  /** Full display name (desktop header, meta tags, structured data) */
  displayName: string;
  /** Short name for mobile header */
  shortName: string;
  /** One-line description of who you are */
  tagline: string;
  /** Deployed site URL (no trailing slash) */
  siteUrl: string;
  /** Path to avatar image in /public */
  avatar: string;
  /** Social and external links */
  links: { label: string; url: string }[];
  /** Accent color (CSS color value) */
  themeColor: string;
  /** Footer configuration */
  footer: {
    text: string;
    url: string;
  };
  /** Plausible analytics (optional — omit or leave empty to disable) */
  plausible?: {
    domain: string;
    src?: string;
  };
}

export const config: SiteConfig = {
  displayName: "Your Name",
  shortName: "You",
  tagline: "A public wiki of ideas in progress",
  siteUrl: "https://your-wiki.pages.dev",
  avatar: "/avatar.jpg",
  links: [],
  themeColor: "#3b82f6",
  footer: {
    text: "Powered by Commune",
    url: "/",
  },
  // Uncomment and configure to enable analytics:
  // plausible: {
  //   domain: "your-domain.com",
  //   src: "https://plausible.io/js/script.js",
  // },
};
