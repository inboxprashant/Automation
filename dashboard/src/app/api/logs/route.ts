import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

function readNdjson(filePath: string, n: number) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).reverse()
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function readAppLog(n: number) {
  const logsDir = path.join(ROOT, 'logs');
  if (!fs.existsSync(logsDir)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const file  = path.join(logsDir, `app-${today}.log`);
  if (!fs.existsSync(file)) return [];
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).reverse();
  } catch { return []; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'uploads';
  const n    = Math.min(100, parseInt(searchParams.get('n') ?? '50', 10));

  if (type === 'app') {
    return NextResponse.json({ lines: readAppLog(n) });
  }

  if (type === 'workflow') {
    const runs = readNdjson(path.join(ROOT, 'project/logs/workflow_runs.ndjson'), n);
    return NextResponse.json({ runs });
  }

  // Default: upload logs
  const uploads = readNdjson(path.join(ROOT, 'project/logs/uploads.ndjson'), n);
  return NextResponse.json({ uploads });
}
