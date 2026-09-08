import { SUPABASE_PROJECT_REF } from '../lib/supabase'

/**
 * Names the database this session is attached to, while developing.
 *
 * Development and production are separate Supabase projects, and the only thing
 * choosing between them is a gitignored .env.local — so a wrong value is silent.
 * That matters more here than in most apps: inspection records are immutable by
 * design, with no update or delete path, so a test scan written to production
 * cannot be taken back out through the app.
 *
 * It renders only under `npm run dev`; a production build drops it entirely.
 * Deliberately shown for every project, not just the wrong one, because a badge
 * that appears only on a bad config is a badge nobody learns to look for.
 */
export default function DatabaseBadge() {
  if (!import.meta.env.DEV) return null

  return (
    <div className="dbbadge" role="status">
      <span className="dbbadge__dot" aria-hidden="true" />
      db&nbsp;<b>{SUPABASE_PROJECT_REF}</b>
    </div>
  )
}
