import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, FileSpreadsheet, Table2 } from 'lucide-react';
import { reportsApi, geoApi } from '../services/api';
import { LGA } from '../types';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function AdminReportsPage() {
  const [selectedLGA, setSelectedLGA] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: lgaData } = useQuery({ queryKey: ['lgas'], queryFn: () => geoApi.getLGAs() });
  const lgas = lgaData?.data?.data || [];

  const handleDownload = async (type: 'pdf' | 'excel' | 'csv') => {
    setDownloading(type);
    try {
      const params: { lga_id?: string } = {};
      if (selectedLGA) params.lga_id = selectedLGA;

      let response;
      if (type === 'pdf') response = await reportsApi.downloadPDF(params);
      else if (type === 'excel') response = await reportsApi.downloadExcel(params);
      else response = await reportsApi.downloadCSV(params);

      const blob = new Blob([response.data], {
        type: type === 'pdf' ? 'application/pdf' :
              type === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
              'text/csv'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSEM-Report-${Date.now()}.${type === 'excel' ? 'xlsx' : type}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`${type.toUpperCase()} report downloaded!`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || `Failed to download ${type} report`);
    }
    setDownloading(null);
  };

  const reports = [
    {
      title: 'PDF Report',
      description: 'Comprehensive election report with candidate standings, LGA breakdown, and summary statistics. Branded with GSEM identity.',
      icon: FileText,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20 hover:border-red-500/40',
      type: 'pdf' as const,
    },
    {
      title: 'Excel Report',
      description: 'Multi-sheet workbook with Results, Candidates, and LGA Summary tabs. Includes all verified submissions with vote breakdowns.',
      icon: FileSpreadsheet,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20 hover:border-green-500/40',
      type: 'excel' as const,
    },
    {
      title: 'CSV Export',
      description: 'Raw data export of all verified result submissions. Ideal for data analysis, external processing, and archival.',
      icon: Table2,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20 hover:border-blue-500/40',
      type: 'csv' as const,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="Reports" subtitle="Generate and download election reports" />

      {/* Filters */}
      <div className="glass-card p-4">
        <label className="label-text mb-2 block">Filter by LGA (optional)</label>
        <select
          value={selectedLGA}
          onChange={e => setSelectedLGA(e.target.value)}
          className="input-field py-2 text-sm w-64"
        >
          <option value="">All LGAs (State-wide)</option>
          {lgas.map((l: LGA) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* Report Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div key={report.type} className={`glass-card p-6 border ${report.borderColor} transition-all`}>
            <div className={`w-12 h-12 ${report.bgColor} rounded-xl flex items-center justify-center mb-4`}>
              <report.icon className={`w-6 h-6 ${report.color}`} />
            </div>
            <h3 className="font-display text-lg font-semibold text-text-primary mb-2">{report.title}</h3>
            <p className="text-text-muted text-sm mb-6 leading-relaxed">{report.description}</p>
            <button
              onClick={() => handleDownload(report.type)}
              disabled={downloading === report.type}
              className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${report.bgColor} ${report.color} hover:opacity-80 disabled:opacity-50`}
            >
              {downloading === report.type ? (
                <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download {report.type.toUpperCase()}
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="glass-card p-4 text-sm text-text-muted">
        <p>📝 Reports include only <span className="text-primary-300 font-medium">verified</span> result submissions. Pending and rejected submissions are excluded.</p>
        <p className="mt-1">🔒 All reports are generated server-side with audit logging. Report generation events are recorded in the audit log.</p>
      </div>
    </motion.div>
  );
}
