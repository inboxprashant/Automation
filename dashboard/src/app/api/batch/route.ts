/**
 * /api/batch — Daily batch generation endpoint.
 *
 * GET  → returns current batch state (polled every 3s by dashboard)
 * POST → starts a new batch (action: 'start') or cancels (action: 'cancel')
 */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

function readJson(p: string, fb: unknown = null) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return fb;
}

const STATE_FILE = path.join(ROOT, 'project/logs/batch_state.json');

// ── GET — poll batch state ────────────────────────────────────────────────────

export async function GET() {
  const state = readJson(STATE_FILE);
  return NextResponse.json({ state });
}

// ── POST — start / cancel batch ───────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { action, count = 4, startHour = 9, intervalHours = 4 } = body;

  if (action === 'start') {
    // Check if already running
    const state = readJson(STATE_FILE) as any;
    if (state?.status === 'running') {
      return NextResponse.json({ ok: false, message: 'A batch is already running' });
    }

    // Spawn the batch in a detached child process so it survives dashboard restarts
    const { exec } = require('child_process');
    const cmd = [
      'node',
      path.join(ROOT, 'scripts/run_batch.js'),
      '--count', String(count),
      '--start-hour', String(startHour),
      '--interval', String(intervalHours),
    ].join(' ');

    const child = exec(cmd, {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
    });

    child.unref();

    // Wait briefly for the state file to be written
    await new Promise((r) => setTimeout(r, 800));
    const newState = readJson(STATE_FILE);

    return NextResponse.json({
      ok:      true,
      message: `Batch started — ${count} videos will be scheduled`,
      state:   newState,
    });
  }

  if (action === 'cancel') {
    const state = readJson(STATE_FILE) as any;
    if (!state || state.status !== 'running') {
      return NextResponse.json({ ok: false, message: 'No batch is running' });
    }
    // Mark as cancelled — the batch runner checks this flag
    state.status = 'cancelled';
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    return NextResponse.json({ ok: true, message: 'Batch cancellation requested' });
  }

  return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 });
}
