'use client';
import useSWR from 'swr';
import Sidebar       from '@/components/Sidebar';
import UploadTable   from '@/components/UploadTable';
import ManualUpload  from '@/components/ManualUpload';
import { CheckCircle2, XCircle, Upload } from 'lucide-react';
import StatCard from '@/components/StatCard';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UploadsPage() {
  const { data: status } = useSWR('/api/status',              fetcher, { refreshInterval: 10000 });
  const { data: logs   } = useSWR('/api/logs?type=uploads&n=50', fetcher, { refreshInterval: 10000 });

  const uploads = status?.uploads ?? {};
  const all     = logs?.uploads   ?? [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 space-y-6">
        <h1 className="text-xl font-bold text-white">Uploads</h1>

        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total"      value={uploads.total   ?? 0} icon={Upload}       color="blue"  />
          <StatCard label="Successful" value={uploads.success ?? 0} icon={CheckCircle2} color="green" />
          <StatCard label="Failed"     value={uploads.failed  ?? 0} icon={XCircle}      color="red"   />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 card">
            <p className="section-title">Upload History</p>
            <UploadTable uploads={all} />
          </div>
          <ManualUpload />
        </div>
      </main>
    </div>
  );
}
