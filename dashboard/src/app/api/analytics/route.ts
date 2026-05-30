import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

function readJson(p: string, fb: unknown = null) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  return fb;
}

export async function GET() {
  const analyticsDir = path.join(ROOT, 'project/analytics');
  const reportsDir   = path.join(analyticsDir, 'reports');
  const index        = readJson(path.join(analyticsDir, 'index.json'), []) as any[];

  // Latest report
  let latestReport = null;
  if (fs.existsSync(reportsDir)) {
    const files = fs.readdirSync(reportsDir)
      .filter((f) => f.endsWith('.json'))
      .sort().reverse();
    if (files.length > 0) {
      latestReport = readJson(path.join(reportsDir, files[0]));
    }
  }

  // Build views time-series from snapshots (last 7 days, top 5 videos)
  const snapshotsDir = path.join(analyticsDir, 'snapshots');
  const viewsSeries: Record<string, number[]> = {};

  if (fs.existsSync(snapshotsDir) && index.length > 0) {
    const topVideos = index.slice(0, 5);
    for (const v of topVideos) {
      const file = path.join(snapshotsDir, `${v.videoId}.ndjson`);
      if (!fs.existsSync(file)) continue;
      const snaps = fs.readFileSync(file, 'utf8')
        .split('\n').filter(Boolean).slice(-7)
        .map((l: string) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      viewsSeries[v.title?.slice(0, 25) ?? v.videoId] = snaps.map((s: any) => s.views ?? 0);
    }
  }

  return NextResponse.json({
    index:        index.slice(0, 20),
    latestReport,
    viewsSeries,
    generatedAt:  new Date().toISOString(),
  });
}
