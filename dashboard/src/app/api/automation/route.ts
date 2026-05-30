import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const ROOT    = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
const PID_FILE = path.join(ROOT, 'project/logs/automation.pid');

function readJson(p: string, fb: unknown = null) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return fb;
}

function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function GET() {
  const pidData = readJson(PID_FILE) as { pid: number; startedAt: string } | null;
  const running = pidData ? isRunning(pidData.pid) : false;
  if (!running && fs.existsSync(PID_FILE)) fs.rmSync(PID_FILE, { force: true });

  const queueState = readJson(path.join(ROOT, 'project/logs/queue_state.json'), {}) as any;

  return NextResponse.json({
    running,
    pid:       running ? pidData?.pid : null,
    startedAt: running ? pidData?.startedAt : null,
    queue:     queueState?.status ?? { pending: 0, running: 0 },
  });
}

export async function POST(req: Request) {
  const { action, niche } = await req.json();

  if (action === 'start') {
    const pidData = readJson(PID_FILE) as { pid: number } | null;
    if (pidData && isRunning(pidData.pid)) {
      return NextResponse.json({ ok: false, message: 'Automation already running' });
    }

    const child = exec(`node ${path.join(ROOT, 'src/index.js')}`, {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
    });

    if (child.pid) {
      fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
      fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }));
      child.unref();
      return NextResponse.json({ ok: true, pid: child.pid, message: 'Automation started' });
    }
    return NextResponse.json({ ok: false, message: 'Failed to start process' }, { status: 500 });
  }

  if (action === 'stop') {
    const pidData = readJson(PID_FILE) as { pid: number } | null;
    if (!pidData) return NextResponse.json({ ok: false, message: 'Not running' });
    try {
      process.kill(pidData.pid, 'SIGTERM');
      fs.rmSync(PID_FILE, { force: true });
      return NextResponse.json({ ok: true, message: 'Automation stopped' });
    } catch {
      fs.rmSync(PID_FILE, { force: true });
      return NextResponse.json({ ok: true, message: 'Process already stopped' });
    }
  }

  if (action === 'run_now') {
    const resolvedNiche = niche || 'tech';
    exec(`node ${path.join(ROOT, 'scripts/run_workflow.js')} --niche ${resolvedNiche}`, {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    return NextResponse.json({ ok: true, message: `Workflow triggered for niche: ${resolvedNiche}` });
  }

  return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 });
}
