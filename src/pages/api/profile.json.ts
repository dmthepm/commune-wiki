/**
 * Static profile endpoint for future people-matching.
 *
 * Generated at build time. Exposes structured data from the home note
 * and site config as JSON. The matching backend can fetch this from
 * any deployed wiki at /api/profile.json.
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { config } from '../../config';

export const GET: APIRoute = async () => {
  const entry = await getEntry('notes', 'index');

  if (!entry) {
    return new Response(JSON.stringify({ error: 'Home note not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const profile = {
    name: config.displayName,
    bio: entry.data.summary || config.tagline,
    right_now: entry.data.right_now || null,
    looking_for: entry.data.looking_for || null,
    ask_me_about: entry.data.ask_me_about || [],
    links: config.links,
    last_updated: entry.data.updated || entry.data.created || null,
  };

  return new Response(JSON.stringify(profile, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
