import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  const indexPath = path.join(ROOT, 'project/scripts/index.json');
  let index: any[] = [];
  try {
    if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {}

  // Return single script detail
  if (jobId) {
    const entry = index.find((e: any) => e.jobId === jobId);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const filePath = path.resolve(ROOT, entry.file);
    try {
      const script = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return NextResponse.json(script);
    } catch {
      return NextResponse.json({ error: 'File not readable' }, { status: 500 });
    }
  }

  return NextResponse.json({ scripts: index.slice(0, 50) });
}
