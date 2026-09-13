/* Quiet Atlas: a cloud-white public operations map with cobalt wayfinding and moss live-status signals. */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Sector
} from 'recharts';
import {
  Shield, Vote, TrendingUp, MapPin, Users, Share2, Filter, Activity,
  CheckCircle, Clock, ArrowUpRight, BarChart2, PieChart as PieChartIcon,
  Download, Search, AlertCircle, FileText, ChevronRight, Check, Eye,
  Landmark, Building2, Scale, X
} from 'lucide-react';
import CountUp from 'react-countup';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { publicApi } from '../services/api';
import {
  CandidateResult, LGADashboardSummary, WardDashboardSummary,
  SituationRoomPUDetail
} from '../types';

const COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

const getPartyColor = (partyCode: string, index: number) => {
  const map: Record<string, string> = {
    'APC': '#3b82f6',
    'PDP': '#ef4444',
    'NNPP': '#10b981',
    'LP': '#f97316',
    'PRP': '#8b5cf6',
  };
  return map[partyCode?.toUpperCase()] || COLORS[index % COLORS.length];
};

const MapController = ({ selectedLgaCoords }: { selectedLgaCoords: [number, number] | null }) => {
  const map = useMap();
  React.useEffect(() => {
    if (selectedLgaCoords) {
      map.flyTo(selectedLgaCoords, 11, { duration: 1.5 });
    } else {
      map.flyTo([11.7562, 9.3390], 8.5, { duration: 1.5 }); // Jigawa Center (Dutse)
    }
  }, [selectedLgaCoords, map]);
  return null;
};

// Custom Active Shape for PieChart
const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill="#183f73" className="font-bold text-xl">
        {payload.party_code}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 12}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#183f73" className="font-mono text-sm">{`${value.toLocaleString()}`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#607186" className="text-xs">
        {`(${(percent * 100).toFixed(1)}%)`}
      </text>
    </g>
  );
};

export default function SituationRoomPage() {
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [selectedLgaId, setSelectedLgaId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPuId, setExpandedPuId] = useState<number | null>(null);

  // 1. Statewide Query
  const { data: stateData, isLoading: isStateLoading } = useQuery({
    queryKey: ['situation-room', selectedElectionId],
    queryFn: () => publicApi.getSituationRoom(selectedElectionId ? { election_id: selectedElectionId } : undefined),
    refetchInterval: 15000,
  });

  // 2. LGA Query
  const { data: lgaData, isLoading: isLgaLoading } = useQuery({
    queryKey: ['situation-room-lga', selectedLgaId, selectedElectionId],
    queryFn: () => publicApi.getSituationRoomLGA(selectedLgaId!, selectedElectionId ? { election_id: selectedElectionId } : undefined),
    enabled: selectedLgaId !== null,
    refetchInterval: 15000,
  });

  // 3. Ward Query
  const { data: wardData, isLoading: isWardLoading } = useQuery({
    queryKey: ['situation-room-ward', selectedWardId, selectedElectionId],
    queryFn: () => publicApi.getSituationRoomWard(selectedWardId!, selectedElectionId ? { election_id: selectedElectionId } : undefined),
    enabled: selectedWardId !== null,
    refetchInterval: 15000,
  });

  const room = stateData?.data?.data;
  const lgaDetail = lgaData?.data?.data;
  const wardDetail = wardData?.data?.data;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'JISEMS Situation Room',
        text: 'Live verified election intelligence and voting metrics for Jigawa State (The New World).',
        url: window.location.href,
      }).catch(console.error);
    }
  };

  // Coordinated View Data depending on active tier: Ward -> LGA -> Statewide
  const currentViewData = useMemo(() => {
    if (!room) return null;

    // Ward Tier
    if (selectedWardId && wardDetail) {
      return {
        level: 'ward' as const,
        title: `${wardDetail.ward.name} Ward`,
        subtitle: `${wardDetail.ward.lga_name} LGA • Jigawa State`,
        total_registered_voters: wardDetail.total_registered_voters || 0,
        total_accredited_voters: wardDetail.total_accredited_voters || 0,
        total_votes_cast: wardDetail.total_votes_cast || 0,
        total_valid_votes: wardDetail.total_valid_votes || 0,
        rejected_votes: wardDetail.rejected_votes || 0,
        accreditation_percentage: wardDetail.accreditation_percentage || 0,
        turnout_percentage: wardDetail.turnout_percentage || 0,
        valid_vote_percentage: wardDetail.valid_vote_percentage || 0,
        rejected_vote_percentage: wardDetail.rejected_vote_percentage || 0,
        reported_polling_units: wardDetail.reported_polling_units || 0,
        verified_polling_units: wardDetail.verified_polling_units || 0,
        total_polling_units: wardDetail.total_polling_units || 0,
        reporting_percentage: wardDetail.reporting_percentage || 0,
        candidates: wardDetail.candidates || [],
        leading_party: wardDetail.leading_party || 'N/A',
        leading_candidate: wardDetail.leading_candidate || 'N/A',
        lead_margin: wardDetail.lead_margin || 0,
        polling_units: wardDetail.polling_units || [],
      };
    }

    // LGA Tier
    if (selectedLgaId) {
      if (lgaDetail) {
        return {
          level: 'lga' as const,
          title: `${lgaDetail.lga.name} LGA`,
          subtitle: 'Jigawa State Collation Area',
          total_registered_voters: lgaDetail.total_registered_voters || 0,
          total_accredited_voters: lgaDetail.total_accredited_voters || 0,
          total_votes_cast: lgaDetail.total_votes_cast || 0,
          total_valid_votes: lgaDetail.total_valid_votes || 0,
          rejected_votes: lgaDetail.rejected_votes || 0,
          accreditation_percentage: lgaDetail.accreditation_percentage || 0,
          turnout_percentage: lgaDetail.turnout_percentage || 0,
          valid_vote_percentage: lgaDetail.valid_vote_percentage || 0,
          rejected_vote_percentage: lgaDetail.rejected_vote_percentage || 0,
          reported_polling_units: lgaDetail.reported_polling_units || 0,
          verified_polling_units: lgaDetail.verified_polling_units || 0,
          total_polling_units: lgaDetail.total_polling_units || 0,
          reporting_percentage: lgaDetail.reporting_percentage || 0,
          candidates: lgaDetail.candidates || [],
          leading_party: lgaDetail.leading_party || 'N/A',
          leading_candidate: lgaDetail.leading_candidate || 'N/A',
          lead_margin: lgaDetail.lead_margin || 0,
          wards: lgaDetail.wards || [],
        };
      }

      // Fallback while LGA details are loading
      const fallbackLga = room.lga_breakdown?.find((l: LGADashboardSummary) => l.lga_id === selectedLgaId);
      if (fallbackLga) {
        return {
          level: 'lga' as const,
          title: `${fallbackLga.lga_name} LGA`,
          subtitle: 'Jigawa State Collation Area',
          total_registered_voters: fallbackLga.total_registered_voters || 0,
          total_accredited_voters: fallbackLga.total_accredited_voters || 0,
          total_votes_cast: fallbackLga.total_votes_cast || 0,
          total_valid_votes: fallbackLga.total_valid_votes || 0,
          rejected_votes: fallbackLga.rejected_votes || 0,
          accreditation_percentage: fallbackLga.accreditation_percentage || 0,
          turnout_percentage: fallbackLga.turnout_percentage || 0,
          valid_vote_percentage: fallbackLga.total_votes_cast && fallbackLga.total_valid_votes ? Number(((fallbackLga.total_valid_votes / fallbackLga.total_votes_cast) * 100).toFixed(2)) : 0,
          rejected_vote_percentage: fallbackLga.total_votes_cast && fallbackLga.rejected_votes ? Number(((fallbackLga.rejected_votes / fallbackLga.total_votes_cast) * 100).toFixed(2)) : 0,
          reported_polling_units: fallbackLga.reported_polling_units || 0,
          verified_polling_units: fallbackLga.verified_polling_units || 0,
          total_polling_units: fallbackLga.total_polling_units || 0,
          reporting_percentage: fallbackLga.reporting_percentage || 0,
          candidates: fallbackLga.candidates || [],
          leading_party: fallbackLga.leading_party || 'N/A',
          leading_candidate: fallbackLga.leading_candidate || 'N/A',
          lead_margin: fallbackLga.lead_margin || 0,
          wards: [],
        };
      }
    }

    // Statewide Tier
    return {
      level: 'state' as const,
      title: 'Jigawa State (All 27 LGAs)',
      subtitle: 'Official Statewide Collation',
      total_registered_voters: room.total_registered_voters || 0,
      total_accredited_voters: room.total_accredited_voters || 0,
      total_votes_cast: room.total_votes_cast || 0,
      total_valid_votes: room.total_valid_votes || 0,
      rejected_votes: room.rejected_votes || 0,
      accreditation_percentage: room.accreditation_percentage || 0,
      turnout_percentage: room.turnout_percentage || 0,
      valid_vote_percentage: room.valid_vote_percentage || 0,
      rejected_vote_percentage: room.rejected_vote_percentage || 0,
      reported_polling_units: room.reported_polling_units || 0,
      verified_polling_units: room.verified_polling_units || 0,
      total_polling_units: room.total_polling_units || 0,
      reporting_percentage: room.reporting_percentage || 0,
      candidates: room.candidates || [],
      leading_party: room.leading_party || 'N/A',
      leading_candidate: room.leading_candidate || 'N/A',
      lead_margin: room.lead_margin || 0,
      lgas: room.lga_breakdown || [],
    };
  }, [room, selectedLgaId, selectedWardId, lgaDetail, wardDetail]);

  const activeLgaCoords = useMemo(() => {
    if (!selectedLgaId || !room?.lga_breakdown) return null;
    const lga = room.lga_breakdown.find((l: LGADashboardSummary) => l.lga_id === selectedLgaId);
    if (lga?.latitude && lga?.longitude) return [Number(lga.latitude), Number(lga.longitude)] as [number, number];
    const fallbackCoords: Record<string, [number, number]> = {
      'Auyo': [12.35, 9.98], 'Babura': [12.77, 8.77], 'Biriniwa': [12.79, 10.23],
      'Birnin Kudu': [11.45, 9.48], 'Buji': [11.55, 9.68], 'Dutse': [11.7562, 9.3390],
      'Gagarawa': [12.41, 9.53], 'Garki': [12.38, 9.17], 'Gumel': [12.63, 9.39],
      'Guri': [12.72, 10.42], 'Gwaram': [11.28, 9.88], 'Gwiwa': [12.76, 8.33],
      'Hadejia': [12.45, 10.04], 'Jahun': [12.09, 9.62], 'Kafin Hausa': [12.24, 9.91],
      'Kaugama': [12.44, 9.77], 'Kazaure': [12.65, 8.41], 'Kiri Kasama': [12.69, 10.23],
      'Kiyawa': [11.78, 9.61], 'Maigatari': [12.81, 9.45], 'Malam Madori': [12.55, 9.98],
      'Miga': [12.15, 9.71], 'Ringim': [12.15, 9.16], 'Roni': [12.55, 8.30],
      'Sule Tankarkar': [12.67, 9.23], 'Taura': [12.24, 9.32], 'Yankwashi': [12.79, 8.52]
    };
    return lga ? fallbackCoords[lga.lga_name] : null;
  }, [selectedLgaId, room]);

  const sortedLgas = useMemo(() => {
    if (!room?.lga_breakdown) return [];
    return [...room.lga_breakdown].sort((a, b) => b.reporting_percentage - a.reporting_percentage);
  }, [room]);

  const topCandidates = useMemo(() => {
    if (!currentViewData?.candidates) return [];
    return [...currentViewData.candidates].sort((a, b) => b.total_votes - a.total_votes);
  }, [currentViewData]);

  const leadingCandidate = topCandidates[0];
  const runnerUp = topCandidates[1];
  const leadMargin = leadingCandidate && runnerUp ? leadingCandidate.total_votes - runnerUp.total_votes : leadingCandidate?.total_votes || 0;

  // Filtered rows for analytical register table
  const filteredRegisterRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!currentViewData) return [];

    if (currentViewData.level === 'ward') {
      return (currentViewData.polling_units || []).filter((pu: SituationRoomPUDetail) =>
        !q || pu.name.toLowerCase().includes(q) || pu.inec_pu_code.toLowerCase().includes(q) || (pu.leading_party && pu.leading_party.toLowerCase().includes(q))
      );
    }
    if (currentViewData.level === 'lga') {
      return (currentViewData.wards || []).filter((w: WardDashboardSummary) =>
        !q || w.ward_name.toLowerCase().includes(q) || (w.ward_code && w.ward_code.toLowerCase().includes(q)) || (w.leading_party && w.leading_party.toLowerCase().includes(q))
      );
    }
    return (room?.lga_breakdown || []).filter((l: LGADashboardSummary) =>
      !q || l.lga_name.toLowerCase().includes(q) || (l.leading_party && l.leading_party.toLowerCase().includes(q))
    );
  }, [currentViewData, room, searchTerm]);

  // Contextual CSV Export
  const handleExportCSV = () => {
    if (!currentViewData) return;
    let headers = '';
    let rows: string[] = [];
    let filename = '';

    if (currentViewData.level === 'ward' && wardDetail) {
      filename = `GSEM_PU_Results_${wardDetail.ward.name.replace(/\s+/g, '_')}_${Date.now()}.csv`;
      headers = 'INEC PU Code,Polling Unit Name,Registered Voters,Accredited Voters,Votes Cast,Valid Votes,Rejected,Turnout %,Status,Leading Party,Submitted At\n';
      rows = (wardDetail.polling_units || []).map((pu: SituationRoomPUDetail) =>
        `"${pu.inec_pu_code}","${pu.name}",${pu.registered_voters},${pu.accredited_voters ?? ''},${pu.total_votes_cast ?? ''},${pu.total_valid_votes ?? ''},${pu.rejected_votes ?? ''},"${pu.turnout_percentage}%","${pu.status}","${pu.leading_party}","${pu.submitted_at || ''}"`
      );
    } else if (currentViewData.level === 'lga' && lgaDetail) {
      filename = `GSEM_Ward_Results_${lgaDetail.lga.name.replace(/\s+/g, '_')}_${Date.now()}.csv`;
      headers = 'Ward Name,Ward Code,Total PUs,Reported PUs,Verified PUs,Registered Voters,Accredited Voters,Votes Cast,Valid Votes,Rejected,Turnout %,Reporting %,Leading Party\n';
      rows = (lgaDetail.wards || []).map((w: WardDashboardSummary) =>
        `"${w.ward_name}","${w.ward_code || ''}",${w.total_polling_units},${w.reported_polling_units},${w.verified_polling_units || 0},${w.total_registered_voters || 0},${w.total_accredited_voters || 0},${w.total_votes_cast || 0},${w.total_valid_votes || 0},${w.rejected_votes || 0},"${w.turnout_percentage || 0}%","${w.reporting_percentage}%","${w.leading_party || 'N/A'}"`
      );
    } else {
      filename = `GSEM_Statewide_LGAs_${Date.now()}.csv`;
      headers = 'LGA Name,Total PUs,Reported PUs,Verified PUs,Registered Voters,Accredited Voters,Votes Cast,Valid Votes,Rejected,Turnout %,Reporting %,Leading Party\n';
      rows = (room?.lga_breakdown || []).map((l: LGADashboardSummary) =>
        `"${l.lga_name}",${l.total_polling_units},${l.reported_polling_units},${l.verified_polling_units || 0},${l.total_registered_voters || 0},${l.total_accredited_voters || 0},${l.total_votes_cast || 0},${l.total_valid_votes || 0},${l.rejected_votes || 0},"${l.turnout_percentage || 0}%","${l.reporting_percentage}%","${l.leading_party || 'N/A'}"`
      );
    }

    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLoading = isStateLoading || (selectedLgaId !== null && isLgaLoading && !currentViewData) || (selectedWardId !== null && isWardLoading);

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary font-sans selection:bg-primary-100 atlas-grid">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-100/60 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent-100/55 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="bg-dark-surface/90 backdrop-blur-xl border-b border-dark-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 via-primary-700 to-primary-900 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-500/30">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-semibold text-primary-800 tracking-tight">
                  SITUATION ROOM
                </h1>
                <span className="hidden sm:inline-block text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm">
                  {room?.election?.title || 'Jigawa 2027 General Elections'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-text-muted mt-0.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                  </span>
                  OFFICIALLY VERIFIED FEED
                </div>
                <span>|</span>
                <Clock className="w-3 h-3 text-emerald-700" />
                <span>{room?.last_updated ? new Date(room.last_updated).toLocaleTimeString() : 'Connecting...'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-dark-surface-2 border border-dark-border hover:border-primary-300 hover:bg-primary-50 transition-all text-xs font-bold text-text-secondary shadow-sm"
              title="Export Current Collation View to CSV"
            >
              <Download className="w-4 h-4 text-primary-700" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-dark-surface-2 border border-dark-border hover:border-primary-300 hover:bg-primary-50 transition-all text-xs font-bold text-text-secondary shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>
            <Link to="/login" className="btn-primary flex-1 sm:flex-none text-center px-5 py-2.5 text-xs font-bold">
              Agent Login
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 relative z-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-16 h-16 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-text-muted font-mono animate-pulse">Initializing Verified Collation Stream...</p>
          </div>
        ) : !room || !currentViewData ? (
          <div className="text-center py-20 text-text-muted">No election data currently streaming</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedLgaId || 'state'}-${selectedWardId || 'all'}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Top Analytical Status Banner: e.g. "10% of results reported • 200 PUs • 1 LGA" */}
              <div className="surface-elevated p-4 sm:p-5 border-l-4 border-primary-600 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-primary-700 font-mono">
                    <Activity className="w-4 h-4 text-accent-600 animate-pulse" />
                    Live Collation Progress
                  </div>
                  <div className="text-xl sm:text-2xl font-display font-bold text-text-primary flex flex-wrap items-baseline gap-2">
                    <span className="text-primary-800">
                      {currentViewData.reporting_percentage}% of Results Reported
                    </span>
                    <span className="text-text-muted text-base font-mono font-normal">
                      • {currentViewData.reported_polling_units.toLocaleString()} of {currentViewData.total_polling_units.toLocaleString()} PUs
                    </span>
                    <span className="text-text-muted text-base font-mono font-normal">
                      {selectedLgaId && lgaDetail?.wards ? (
                        <>• {lgaDetail.reported_wards || 0} of {lgaDetail.total_wards || lgaDetail.wards.length} Wards Reporting</>
                      ) : (
                        <>• {room.reported_lgas || 0} of {room.total_lgas || 27} LGAs Reporting</>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted font-mono">
                    Verified PUs: <strong className="text-accent-700">{currentViewData.verified_polling_units.toLocaleString()}</strong> ({currentViewData.total_polling_units > 0 ? ((currentViewData.verified_polling_units / currentViewData.total_polling_units) * 100).toFixed(1) : 0}% audited by collation officers)
                  </p>
                </div>

                <div className="w-full md:w-64 space-y-1.5">
                  <div className="flex justify-between text-xs font-mono font-bold">
                    <span className="text-text-muted">EC8A Ingestion</span>
                    <span className="text-primary-700">{currentViewData.reporting_percentage}%</span>
                  </div>
                  <div className="w-full bg-dark-surface-2 rounded-full h-2.5 overflow-hidden border border-dark-border">
                    <div
                      className="bg-gradient-to-r from-primary-600 to-accent-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(currentViewData.reporting_percentage, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* JISEMS Multi-Election Contest Switcher */}
              {room?.available_elections && room.available_elections.length > 0 && (
                <div className="surface-elevated p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-dark-border shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-200 flex items-center justify-center text-primary-700 shrink-0">
                      <Vote className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-text-primary">Electoral Contest</h3>
                      <p className="text-xs text-text-muted">Select an election contest to inspect live results & collation</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {room.available_elections.map((elec: any) => {
                      const isSelected = elec.id === (selectedElectionId || room?.election?.id);
                      return (
                        <button
                          key={elec.id}
                          onClick={() => {
                            setSelectedElectionId(elec.id);
                            setSelectedLgaId(null);
                            setSelectedWardId(null);
                            setSearchTerm('');
                          }}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                            isSelected
                              ? 'bg-primary-600 text-white border-primary-700 shadow-md shadow-primary-900/15'
                              : 'bg-white hover:bg-primary-50 text-text-secondary border-dark-border hover:border-primary-300'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {elec.election_type === 'gubernatorial' ? (
                              <><Vote className="w-3.5 h-3.5 text-emerald-500" /> Gubernatorial</>
                            ) : elec.election_type === 'senatorial' ? (
                              <><Landmark className="w-3.5 h-3.5 text-primary-300" /> Senate</>
                            ) : elec.election_type === 'house_of_representatives' ? (
                              <><Building2 className="w-3.5 h-3.5 text-amber-400" /> House of Reps</>
                            ) : (
                              <><Scale className="w-3.5 h-3.5 text-indigo-300" /> State Assembly</>
                            )}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-dark-surface-2 text-text-muted'
                          }`}>
                            {elec.constituency_name || 'Statewide'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Breadcrumb Navigation & Filter Bar */}
              <div className="surface-elevated p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-text-muted mb-1">
                    <button
                      onClick={() => { setSelectedLgaId(null); setSelectedWardId(null); setSearchTerm(''); }}
                      className={`hover:text-primary-700 transition-colors ${!selectedLgaId ? 'font-bold text-primary-800' : ''}`}
                    >
                      Jigawa State (All 27 LGAs)
                    </button>
                    {selectedLgaId && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                        <button
                          onClick={() => { setSelectedWardId(null); setSearchTerm(''); }}
                          className={`hover:text-primary-700 transition-colors ${selectedLgaId && !selectedWardId ? 'font-bold text-primary-800' : ''}`}
                        >
                          {lgaDetail?.lga.name || 'LGA'}
                        </button>
                      </>
                    )}
                    {selectedWardId && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                        <span className="font-bold text-primary-800">{wardDetail?.ward.name || 'Ward'}</span>
                      </>
                    )}
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary flex items-center gap-3">
                    {currentViewData.title}
                    {(selectedLgaId || selectedWardId) && (
                      <button
                        onClick={() => {
                          if (selectedWardId) {
                            setSelectedWardId(null);
                          } else {
                            setSelectedLgaId(null);
                          }
                          setSearchTerm('');
                        }}
                        className="text-xs font-bold bg-primary-50 hover:bg-primary-100 text-primary-700 px-3 py-1 rounded-full transition-colors border border-primary-200"
                      >
                        {selectedWardId ? (
                          <span className="inline-flex items-center gap-1">Back to LGA Wards <X className="w-3 h-3" /></span>
                        ) : (
                          <span className="inline-flex items-center gap-1">Clear Filter <X className="w-3 h-3" /></span>
                        )}
                      </button>
                    )}
                  </h2>
                  <p className="text-text-muted text-xs flex items-center gap-1.5 mt-1 font-mono">
                    <CheckCircle className="w-3.5 h-3.5 text-accent-600" />
                    {currentViewData.level === 'ward'
                      ? `Displaying polling unit verification and result sheets for ${currentViewData.title}`
                      : currentViewData.level === 'lga'
                      ? `Displaying ward-level collation data for ${currentViewData.title}`
                      : 'Aggregated statewide collation totals across all 27 Local Government Areas of Jigawa State'}
                  </p>
                </div>

                {/* Dropdowns for LGA and Ward Selection */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* LGA Select */}
                  <div className="flex items-center gap-2 bg-dark-surface-2 rounded-xl px-3 py-2 border border-dark-border">
                    <Filter className="w-4 h-4 text-primary-600" />
                    <select
                      className="bg-transparent text-text-primary text-xs font-bold outline-none cursor-pointer pr-4"
                      value={selectedLgaId || ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setSelectedLgaId(val);
                        setSelectedWardId(null);
                        setSearchTerm('');
                      }}
                    >
                      <option value="" className="bg-white">Statewide (All LGAs)</option>
                      {sortedLgas.map((l: LGADashboardSummary) => (
                        <option key={l.lga_id} value={l.lga_id} className="bg-white">{l.lga_name} LGA</option>
                      ))}
                    </select>
                  </div>

                  {/* Ward Select (when LGA is selected) */}
                  {selectedLgaId && lgaDetail?.wards && (
                    <div className="flex items-center gap-2 bg-dark-surface-2 rounded-xl px-3 py-2 border border-dark-border">
                      <select
                        className="bg-transparent text-text-primary text-xs font-bold outline-none cursor-pointer pr-4"
                        value={selectedWardId || ''}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          setSelectedWardId(val);
                          setSearchTerm('');
                        }}
                      >
                        <option value="" className="bg-white">All Wards in LGA</option>
                        {lgaDetail.wards.map((w: WardDashboardSummary) => (
                          <option key={w.ward_id} value={w.ward_id} className="bg-white">{w.ward_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* 6-Metric Executive KPI Grid (Statewide, LGA, and Ward Parity) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Registered Voters */}
                <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 relative overflow-hidden shadow-sm hover:border-primary-300 transition-all">
                  <div className="flex items-center justify-between text-text-muted mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Registered Voters</span>
                    <Users className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-text-primary">
                    <CountUp end={currentViewData.total_registered_voters} separator="," duration={1.5} />
                  </div>
                  <p className="text-[11px] text-text-muted mt-1 font-mono">Eligible Electorate</p>
                </div>

                {/* 2. Accredited Voters */}
                <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 relative overflow-hidden shadow-sm hover:border-primary-300 transition-all">
                  <div className="flex items-center justify-between text-text-muted mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Accredited Voters</span>
                    <CheckCircle className="w-4 h-4 text-accent-600" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-text-primary">
                    <CountUp end={currentViewData.total_accredited_voters} separator="," duration={1.5} />
                  </div>
                  <p className="text-[11px] text-accent-700 font-mono font-bold mt-1">
                    {currentViewData.accreditation_percentage}% rate
                  </p>
                </div>

                {/* 3. Total Votes Cast */}
                <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 relative overflow-hidden shadow-sm hover:border-primary-300 transition-all">
                  <div className="flex items-center justify-between text-text-muted mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Total Votes Cast</span>
                    <Vote className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-text-primary">
                    <CountUp end={currentViewData.total_votes_cast} separator="," duration={1.5} />
                  </div>
                  <p className="text-[11px] text-primary-700 font-mono font-bold mt-1">
                    {currentViewData.turnout_percentage}% turnout
                  </p>
                </div>

                {/* 4. Total Valid Votes */}
                <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 relative overflow-hidden shadow-sm hover:border-primary-300 transition-all">
                  <div className="flex items-center justify-between text-text-muted mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Valid Votes</span>
                    <TrendingUp className="w-4 h-4 text-accent-600" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-text-primary">
                    <CountUp end={currentViewData.total_valid_votes} separator="," duration={1.5} />
                  </div>
                  <p className="text-[11px] text-text-muted font-mono mt-1">
                    {currentViewData.valid_vote_percentage}% validity
                  </p>
                </div>

                {/* 5. Rejected Ballots */}
                <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 relative overflow-hidden shadow-sm hover:border-primary-300 transition-all">
                  <div className="flex items-center justify-between text-text-muted mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Rejected Ballots</span>
                    <AlertCircle className="w-4 h-4 text-status-warning" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-amber-600">
                    <CountUp end={currentViewData.rejected_votes} separator="," duration={1.5} />
                  </div>
                  <p className="text-[11px] text-text-muted font-mono mt-1">
                    {currentViewData.rejected_vote_percentage}% rejected
                  </p>
                </div>

                {/* 6. Polling Units Verified */}
                <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 relative overflow-hidden shadow-sm hover:border-primary-300 transition-all">
                  <div className="flex items-center justify-between text-text-muted mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">PUs Verified</span>
                    <Activity className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-text-primary">
                    <CountUp end={currentViewData.verified_polling_units} separator="," duration={1.5} />
                    <span className="text-xs text-text-muted font-sans font-normal ml-1">/ {currentViewData.total_polling_units}</span>
                  </div>
                  <div className="w-full bg-primary-100 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className="bg-primary-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${currentViewData.reporting_percentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Main Analytical Grid */}
              <div className="grid lg:grid-cols-12 gap-6">
                
                {/* Left Col: Leaderboard & Pie */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Leading Contender Banner */}
                  {leadingCandidate && (
                    <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-200 rounded-2xl p-6 relative overflow-hidden shadow-sm">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <TrendingUp className="w-32 h-32" />
                      </div>
                      <p className="text-[.63rem] font-extrabold text-text-muted uppercase tracking-[.14em] mb-1">
                        Current Leader • {currentViewData.title}
                      </p>
                      <h3 className="font-display text-2xl font-semibold text-text-primary mb-1">
                        {leadingCandidate.full_name}
                      </h3>
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-extrabold text-white"
                          style={{ backgroundColor: getPartyColor(leadingCandidate.party_code, 0) }}
                        >
                          {leadingCandidate.party_code}
                        </span>
                        <span className="font-mono text-lg font-bold text-text-primary">
                          {(leadingCandidate.total_votes || 0).toLocaleString()} votes ({leadingCandidate.vote_percentage}%)
                        </span>
                      </div>
                      {leadMargin > 0 && runnerUp && (
                        <p className="text-xs font-bold text-accent-700 flex items-center gap-1">
                          <ArrowUpRight className="w-4 h-4" /> Leading by {(leadMargin).toLocaleString()} votes over {runnerUp.party_code}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Candidate Standings */}
                  <div className="surface-elevated p-6">
                    <h3 className="font-display text-lg font-semibold text-text-primary mb-5 flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-primary-600" /> Candidate Standings
                    </h3>
                    <div className="space-y-4">
                      {topCandidates.map((c: CandidateResult, i: number) => {
                        const color = getPartyColor(c.party_code, i);
                        return (
                          <motion.div
                            key={c.candidate_id}
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="p-3.5 rounded-xl bg-dark-surface-2/60 border border-dark-border hover:border-primary-300 transition-all relative overflow-hidden group"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }} />
                            <div className="flex justify-between items-end mb-2 relative z-10">
                              <div>
                                <h4 className="font-bold text-base leading-none text-text-primary">{c.party_code}</h4>
                                <p className="text-xs text-text-muted mt-1">{c.full_name}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-bold text-base text-text-primary">{(c.total_votes || 0).toLocaleString()}</p>
                                <p className="text-xs font-mono font-bold" style={{ color }}>{c.vote_percentage}%</p>
                              </div>
                            </div>
                            <div className="w-full bg-primary-100 rounded-full h-1.5 mt-1 relative z-10 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${c.vote_percentage}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Col: Map (or Ward summary) & Charts */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  {/* Map View (Statewide & LGA) */}
                  <div className="bg-dark-surface border border-dark-border rounded-2xl overflow-hidden relative flex-1 min-h-[380px] shadow-sm z-0">
                    <div className="absolute top-4 left-4 z-[400] bg-dark-surface/95 backdrop-blur-md px-4 py-2 rounded-xl border border-dark-border shadow-md">
                      <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary-600" />
                        Live Geo-Intelligence: {selectedLgaId ? `${currentViewData.title}` : 'Jigawa State'}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">Click any marker to inspect LGA or Ward details</p>
                    </div>
                    <MapContainer center={[10.2897, 11.1711]} zoom={9} style={{ height: '100%', width: '100%', background: '#e8eff5' }} zoomControl={false}>
                      <MapController selectedLgaCoords={activeLgaCoords} />
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; CARTO"
                      />
                      {room.lga_breakdown?.map((lga: LGADashboardSummary) => {
                        const coords: Record<string, [number, number]> = {
                          'Akko': [10.2744, 11.0254], 'Balanga': [9.7909, 11.6669], 'Billiri': [9.8659, 11.2227],
                          'Dutse': [11.7562, 9.3390], 'Hadejia': [12.45, 10.04], 'Birnin Kudu': [11.45, 9.48],
                          'Kaltungo': [9.8142, 11.3069], 'Kwami': [10.4566, 11.2384], 'Nafada': [11.0945, 11.3323],
                          'Shongom': [9.7118, 11.2227], 'Yamaltu/Deba': [10.2173, 11.4927]
                        };
                        const c = coords[lga.lga_name];
                        if (!c) return null;

                        const lgaLeader = lga.candidates && lga.candidates.length > 0
                          ? [...lga.candidates].sort((a, b) => Number(b.total_votes) - Number(a.total_votes))[0]
                          : null;

                        const color = lgaLeader ? getPartyColor(lgaLeader.party_code, 0) : '#6b7280';
                        const progress = lga.reporting_percentage || 0;
                        const radius = 8 + (progress / 10);
                        const isSelected = lga.lga_id === selectedLgaId;

                        return (
                          <CircleMarker
                            key={lga.lga_id}
                            center={c}
                            radius={isSelected ? radius + 6 : radius}
                            pathOptions={{
                              color: isSelected ? '#183f73' : color,
                              fillColor: color,
                              fillOpacity: isSelected ? 0.85 : 0.55,
                              weight: isSelected ? 3 : 1
                            }}
                            eventHandlers={{
                              click: () => {
                                setSelectedLgaId(lga.lga_id);
                                setSelectedWardId(null);
                                setSearchTerm('');
                              }
                            }}
                          >
                            <LeafletTooltip direction="top" offset={[0, -10]} opacity={1} className="custom-tooltip border-0 bg-transparent shadow-none">
                              <div className="bg-white/95 backdrop-blur-md border border-primary-200 p-3 rounded-xl shadow-xl text-center min-w-[130px]">
                                <p className="font-bold text-text-primary text-sm mb-0.5">{lga.lga_name}</p>
                                <p className="text-[11px] text-text-muted mb-2 font-mono">
                                  {lga.reported_polling_units} / {lga.total_polling_units} PUs ({progress}%)
                                </p>
                                {lgaLeader && (
                                  <div className="bg-primary-50 rounded py-1 px-2 border border-primary-100">
                                    <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">Leading</p>
                                    <p className="font-bold text-xs" style={{ color }}>{lgaLeader.party_code}</p>
                                  </div>
                                )}
                              </div>
                            </LeafletTooltip>
                          </CircleMarker>
                        );
                      })}
                    </MapContainer>
                  </div>

                  {/* Dual Chart Section */}
                  <div className="grid md:grid-cols-2 gap-6 h-[300px]">
                    {/* Vote Distribution Pie Chart */}
                    <div className="surface-elevated p-5 flex flex-col relative">
                      <h3 className="font-display text-sm font-semibold text-text-secondary mb-2 flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-primary-600" /> Vote Share Distribution
                      </h3>
                      <div className="flex-1 min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              activeIndex={activeIndex}
                              activeShape={renderActiveShape}
                              data={currentViewData.candidates}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={75}
                              dataKey="total_votes"
                              onMouseEnter={(_, index) => setActiveIndex(index)}
                              stroke="none"
                            >
                              {currentViewData.candidates?.map((c: CandidateResult, i: number) => (
                                <Cell key={`cell-${i}`} fill={getPartyColor(c.party_code, i)} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Reporting Progress by Jurisdiction */}
                    <div className="surface-elevated p-5 flex flex-col">
                      <h3 className="font-display text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary-600" />
                        {selectedLgaId && lgaDetail?.wards ? 'Ward Reporting Progress' : 'Top LGA Reporting Progress'}
                      </h3>
                      <div className="flex-1 w-full overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={(selectedLgaId && lgaDetail?.wards ? lgaDetail.wards : sortedLgas).slice(0, 6)}
                            layout="vertical"
                            margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                          >
                            <XAxis type="number" domain={[0, 100]} stroke="#607186" fontSize={10} tickFormatter={(v) => `${v}%`} />
                            <YAxis
                              dataKey={selectedLgaId && lgaDetail?.wards ? 'ward_name' : 'lga_name'}
                              type="category"
                              stroke="#607186"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              width={85}
                            />
                            <RechartsTooltip
                              cursor={{ fill: 'rgba(49,89,138,0.06)' }}
                              contentStyle={{ background: '#ffffff', border: '1px solid #d8e2ef', borderRadius: '8px', color: '#1c2c40' }}
                            />
                            <Bar dataKey="reporting_percentage" name="Reporting %" radius={[0, 4, 4, 0]} barSize={14}>
                              {(selectedLgaId && lgaDetail?.wards ? lgaDetail.wards : sortedLgas).slice(0, 6).map((entry: any, index: number) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.reporting_percentage > 70 ? '#10b981' : entry.reporting_percentage > 30 ? '#3b82f6' : '#6b7280'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data-Driven Granular Register: Statewide (LGAs) -> LGA (Wards) -> Ward (Polling Units) */}
              <div className="bg-dark-surface border border-dark-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-dark-surface-2/40">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary-600" />
                      {currentViewData.level === 'ward'
                        ? `Polling Units in ${currentViewData.title}`
                        : currentViewData.level === 'lga'
                        ? `Wards in ${currentViewData.title}`
                        : 'LGA Electoral Register (All 11 Local Government Areas)'}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5 font-mono">
                      {currentViewData.level === 'ward'
                        ? 'Granular polling unit results with registered voters, ballots cast, and candidate vote breakdown'
                        : currentViewData.level === 'lga'
                        ? 'Select any Ward to inspect its individual Polling Unit EC8A results and candidate standings'
                        : 'Select any LGA to inspect its Ward-level results and Polling Unit reporting performance'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder={
                          currentViewData.level === 'ward'
                            ? 'Search by PU name or code...'
                            : currentViewData.level === 'lga'
                            ? 'Search by ward name...'
                            : 'Search by LGA name...'
                        }
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 text-xs bg-white border border-dark-border rounded-xl outline-none focus:border-primary-500 font-mono w-48 sm:w-60"
                      />
                    </div>
                  </div>
                </div>

                {/* Table Rendering */}
                <div className="overflow-x-auto">
                  {currentViewData.level === 'ward' ? (
                    /* WARD LEVEL: POLLING UNITS TABLE */
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-dark-surface-2/80 text-text-muted font-extrabold uppercase tracking-wider border-b border-dark-border">
                        <tr>
                          <th className="py-3 px-4">PU Code & Name</th>
                          <th className="py-3 px-3 text-right">Registered</th>
                          <th className="py-3 px-3 text-right">Accredited</th>
                          <th className="py-3 px-3 text-right">Votes Cast</th>
                          <th className="py-3 px-3 text-right">Valid</th>
                          <th className="py-3 px-3 text-right">Rejected</th>
                          <th className="py-3 px-3 text-right">Turnout %</th>
                          <th className="py-3 px-3 text-center">Status</th>
                          <th className="py-3 px-3 text-center">Leading Party</th>
                          <th className="py-3 px-4 text-center">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border">
                        {filteredRegisterRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-text-muted font-sans">
                              No polling units matching your search filter
                            </td>
                          </tr>
                        ) : (
                          filteredRegisterRows.map((pu: SituationRoomPUDetail) => {
                            const isExpanded = expandedPuId === pu.id;
                            const isVerified = pu.status === 'verified';
                            const isReported = pu.status !== 'not_reported';
                            const partyColor = getPartyColor(pu.leading_party, 0);

                            return (
                              <React.Fragment key={pu.id}>
                                <tr className="hover:bg-primary-50/20 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="font-sans font-bold text-text-primary text-xs">{pu.name}</div>
                                    <div className="text-[10px] text-text-muted font-mono">{pu.inec_pu_code}</div>
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono">{pu.registered_voters.toLocaleString()}</td>
                                  <td className="py-3 px-3 text-right font-mono font-bold text-accent-700">
                                    {pu.accredited_voters !== null ? pu.accredited_voters.toLocaleString() : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-bold text-text-primary">
                                    {pu.total_votes_cast !== null ? pu.total_votes_cast.toLocaleString() : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono">
                                    {pu.total_valid_votes !== null ? pu.total_valid_votes.toLocaleString() : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono text-amber-600">
                                    {pu.rejected_votes !== null ? pu.rejected_votes.toLocaleString() : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-bold">
                                    {pu.turnout_percentage > 0 ? `${pu.turnout_percentage}%` : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                                        isVerified
                                          ? 'bg-accent-50 text-accent-700 border border-accent-200'
                                          : isReported
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                                      }`}
                                    >
                                      {isVerified && <Check className="w-3 h-3" />}
                                      {pu.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {pu.leading_party && pu.leading_party !== 'N/A' ? (
                                      <span
                                        className="inline-block px-2 py-0.5 rounded text-[11px] font-extrabold text-white"
                                        style={{ backgroundColor: partyColor }}
                                      >
                                        {pu.leading_party}
                                      </span>
                                    ) : (
                                      <span className="text-text-muted text-[11px]">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {pu.votes && pu.votes.length > 0 ? (
                                      <button
                                        onClick={() => setExpandedPuId(isExpanded ? null : pu.id)}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-2 py-1 rounded transition-colors"
                                      >
                                        <Eye className="w-3 h-3" />
                                        {isExpanded ? 'Hide' : 'Votes'}
                                      </button>
                                    ) : (
                                      <span className="text-text-muted text-[10px]">No votes</span>
                                    )}
                                  </td>
                                </tr>

                                {/* Collapsible Candidate Vote Breakdown for PU */}
                                {isExpanded && pu.votes && pu.votes.length > 0 && (
                                  <tr className="bg-primary-50/30">
                                    <td colSpan={10} className="p-4">
                                      <div className="bg-white border border-primary-200 rounded-xl p-3">
                                        <p className="text-[11px] font-bold text-primary-800 uppercase tracking-wider mb-2 font-mono">
                                          Candidate Votes at {pu.name} ({pu.inec_pu_code})
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                          {pu.votes.map((v, idx) => (
                                            <div key={idx} className="p-2 bg-dark-surface-2 rounded-lg border border-dark-border">
                                              <div className="flex items-center justify-between">
                                                <span
                                                  className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white"
                                                  style={{ backgroundColor: getPartyColor(v.party_code, idx) }}
                                                >
                                                  {v.party_code}
                                                </span>
                                                <span className="font-mono text-xs font-bold text-text-primary">
                                                  {v.votes.toLocaleString()}
                                                </span>
                                              </div>
                                              <p className="text-[10px] text-text-muted truncate mt-1">{v.full_name}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  ) : (
                    /* STATEWIDE (LGAs) & LGA (WARDS) TABLE */
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-dark-surface-2/80 text-text-muted font-extrabold uppercase tracking-wider border-b border-dark-border">
                        <tr>
                          <th className="py-3 px-4">{currentViewData.level === 'lga' ? 'Ward' : 'LGA'}</th>
                          <th className="py-3 px-3 text-right">Registered</th>
                          <th className="py-3 px-3 text-right">Accredited</th>
                          <th className="py-3 px-3 text-right">Votes Cast</th>
                          <th className="py-3 px-3 text-right">Valid</th>
                          <th className="py-3 px-3 text-right">Rejected</th>
                          <th className="py-3 px-3 text-right">Turnout %</th>
                          <th className="py-3 px-3 text-center">Leader</th>
                          <th className="py-3 px-3 text-right">Reporting PUs</th>
                          <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border">
                        {filteredRegisterRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 text-center text-text-muted font-sans">
                              No records matching your search query
                            </td>
                          </tr>
                        ) : (
                          filteredRegisterRows.map((row: any, idx: number) => {
                            const name = currentViewData.level === 'lga' ? row.ward_name : row.lga_name;
                            const code = currentViewData.level === 'lga' ? row.ward_code : row.lga_code;
                            const reg = Number(row.total_registered_voters || 0);
                            const accred = Number(row.total_accredited_voters || 0);
                            const cast = Number(row.total_votes_cast || 0);
                            const valid = Number(row.total_valid_votes || 0);
                            const rej = Number(row.rejected_votes || 0);
                            const turnout = row.turnout_percentage || 0;
                            const rep = row.reporting_percentage || 0;
                            const pus = `${row.reported_polling_units || 0} / ${row.total_polling_units || 0}`;
                            const leader = row.leading_party || 'N/A';
                            const partyColor = getPartyColor(leader, 0);

                            return (
                              <tr key={idx} className="hover:bg-primary-50/20 transition-colors">
                                <td className="py-3 px-4">
                                  <div className="font-sans font-bold text-xs text-text-primary">{name}</div>
                                  {code && <div className="text-[10px] text-text-muted font-mono">{code}</div>}
                                </td>
                                <td className="py-3 px-3 text-right font-mono">{reg.toLocaleString()}</td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-accent-700">{accred.toLocaleString()}</td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-text-primary">{cast.toLocaleString()}</td>
                                <td className="py-3 px-3 text-right font-mono">{valid.toLocaleString()}</td>
                                <td className="py-3 px-3 text-right font-mono text-amber-600">{rej.toLocaleString()}</td>
                                <td className="py-3 px-3 text-right font-mono font-bold">{turnout}%</td>
                                <td className="py-3 px-3 text-center">
                                  {leader !== 'N/A' ? (
                                    <span
                                      className="inline-block px-2 py-0.5 rounded text-[11px] font-extrabold text-white"
                                      style={{ backgroundColor: partyColor }}
                                    >
                                      {leader}
                                    </span>
                                  ) : (
                                    <span className="text-text-muted">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right font-mono">
                                  <span>{pus}</span>
                                  <span className="text-[10px] text-text-muted ml-1">({rep}%)</span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {currentViewData.level === 'lga' ? (
                                    <button
                                      onClick={() => {
                                        setSelectedWardId(row.ward_id);
                                        setSearchTerm('');
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-xl transition-colors"
                                    >
                                      View PUs <ChevronRight className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setSelectedLgaId(row.lga_id);
                                        setSelectedWardId(null);
                                        setSearchTerm('');
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-xl transition-colors"
                                    >
                                      Inspect <ChevronRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Ticker Tape */}
              <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden py-3 px-4 flex items-center gap-4 shadow-sm">
                <div className="flex items-center gap-2 text-primary-700 font-extrabold whitespace-nowrap text-xs border-r border-dark-border pr-4 font-mono">
                  <Activity className="w-4 h-4 animate-pulse text-accent-600" />
                  LIVE RESULTS FEED
                </div>
                <div className="flex-1 overflow-hidden relative">
                  <motion.div
                    animate={{ x: ['0%', '-50%'] }}
                    transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
                    className="flex whitespace-nowrap gap-10 text-xs text-text-secondary font-mono"
                  >
                    {[...topCandidates, ...topCandidates].map((c: CandidateResult, i) => (
                      <span key={i} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getPartyColor(c.party_code, i) }} />
                        <span className="font-bold text-text-primary">{c.party_code}</span>
                        <span>{c.total_votes?.toLocaleString()} votes</span>
                        <span className="text-text-muted">({c.vote_percentage}%)</span>
                      </span>
                    ))}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
