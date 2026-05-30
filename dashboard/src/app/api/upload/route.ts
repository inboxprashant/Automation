import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

const ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

export async function POST(req: Request) {
  const { jobId, videoPath, title, niche, privacy, schedule } = await req.json();

  if (!jobId && !videoPath) {
    return NextResponse.json({ ok: false, message: 'jobId or videoPath required' }, { status: 400 });
  }

  const args: string[] = [];
  if (jobId)     args.push('--job', jobId);
  if (videoPath) args.push('--video', videoPath);
  if (title)     args.push('--title', `"${title}"`);
  if (niche)     args.push('--niche', niche);
  if (privacy)   args.push('--privacy', privacy);
  if (schedule)  args.push('--schedule', schedule);

  const cmd = `node ${path.join(ROOT, 'scripts/upload_video.js')} ${args.join(' ')}`;

  return new Promise((resolve) => {
    exec(cmd, { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' } }, (err, stdout, stderr) => {
      if (err) {
        resolve(NextResponse.json({ ok: false, message: stderr || err.message }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ ok: true, output: stdout.trim() }));
      }
    });
  });
}
