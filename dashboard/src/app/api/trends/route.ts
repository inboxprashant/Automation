import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

export async function GET() {
  const trendsDir = path.join(ROOT, 'project/trends');
  const indexFile = path.join(trendsDir, 'index.json');

  let index: any[] = [];
  try {
    if (fs.existsSync(indexFile)) index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  } catch {}

  // Load the latest report
  let latestReport = null;
  if (index.length > 0) {
    const latest = index[0];
    const file   = path.resolve(ROOT, latest.file);
    try {
      if (fs.existsSync(file)) latestReport = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
  }

  return NextResponse.json({
    index:        index.slice(0, 7),
    latestReport,
    generatedAt:  new Date().toISOString(),
  });
}
