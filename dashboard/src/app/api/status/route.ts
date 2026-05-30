import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

function readJson(filePath: string, fallback: unknown = null) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { /* ignore */ }
  return fallback;
}

function readNdjson(filePath: string, n = 20) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export async function GET() {
  const uploadIndex   = readJson(path.join(ROOT, 'project/logs/upload_index.json'), []);
  const workflowRuns  = readNdjson(path.join(ROOT, 'project/logs/workflow_runs.ndjson'), 30);
  const queueState    = readJson(path.join(ROOT, 'project/logs/queue_state.json'), {});
  const retryState    = readJson(path.join(ROOT, 'project/logs/retry_state.json'), { pending: [], deadLetter: [] });
  const analyticsIdx  = readJson(path.join(ROOT, 'project/analytics/index.json'), []);

  const today = new Date().toISOString().slice(0, 10);
  const todayRuns = workflowRuns.filter((r: any) => r.startedAt?.startsWith(today));

  return NextResponse.json({
    uploads: {
      total:   uploadIndex.length,
      success: uploadIndex.filter((u: any) => u.status === 'success').length,
      failed:  uploadIndex.filter((u: any) => u.status === 'failure').length,
      recent:  uploadIndex.slice(0, 10),
    },
    workflow: {
      todayCount:   todayRuns.length,
      todaySuccess: todayRuns.filter((r: any) => r.success).length,
      todayFailed:  todayRuns.filter((r: any) => !r.success).length,
      recent:       workflowRuns.slice(-10).reverse(),
    },
    queue: queueState,
    retry: retryState,
    analytics: {
      tracked: analyticsIdx.length,
      highPerformers: analyticsIdx.filter((v: any) => v.latestTier === 'high').length,
    },
    generatedAt: new Date().toISOString(),
  });
}
