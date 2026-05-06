/**
 * Tiny Cloudflare D1 client over the REST API. We only need three
 * operations: insert a job row, update an existing row, and list recent
 * rows.
 *
 * D1 has rate limits and can hiccup; every call returns null on failure
 * so a transient D1 outage doesn't take down job processing. The local
 * in-memory `jobs` map remains the source of truth for active progress.
 */

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_API_TOKEN;
const DB_ID = process.env.CF_D1_DATABASE_ID;

const ENABLED = Boolean(ACCOUNT_ID && TOKEN && DB_ID);

if (!ENABLED) {
  console.warn(
    'D1 disabled: set CF_ACCOUNT_ID / CF_API_TOKEN / CF_D1_DATABASE_ID to persist job history.'
  );
}

const ENDPOINT = ENABLED
  ? `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`
  : null;

/**
 * Run a parameterised SQL statement. Returns the parsed JSON `result[0]`
 * on success (which is `{ results, success, meta }`), or null on any
 * error.
 */
async function run(sql, params = []) {
  if (!ENABLED) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    const data = await res.json();
    if (!data.success) {
      console.error('D1 query failed:', data.errors);
      return null;
    }
    return data.result?.[0] ?? null;
  } catch (e) {
    console.error('D1 fetch failed:', e.message);
    return null;
  }
}

export const isEnabled = () => ENABLED;

export async function insertJob({
  id,
  state,
  sourceFilename,
  sourceBytes,
  sceneWidgetCount,
}) {
  const now = Date.now();
  return run(
    `INSERT INTO jobs (id, state, progress, stage, source_filename, source_bytes, scene_widget_count, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [id, state, 'queued', sourceFilename, sourceBytes, sceneWidgetCount, now, now]
  );
}

export async function updateJob(id, fields) {
  const cols = [];
  const params = [];
  for (const [k, v] of Object.entries(fields)) {
    cols.push(`${k} = ?`);
    params.push(v);
  }
  cols.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);
  return run(`UPDATE jobs SET ${cols.join(', ')} WHERE id = ?`, params);
}

export async function finalizeJob(id, fields) {
  return updateJob(id, { ...fields, finished_at: Date.now() });
}

export async function listRecent(limit = 20) {
  const result = await run(
    'SELECT id, state, progress, stage, source_filename, source_bytes, output_bytes, video_duration_seconds, scene_widget_count, created_at, updated_at, finished_at, error FROM jobs ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
  return result?.results ?? [];
}
