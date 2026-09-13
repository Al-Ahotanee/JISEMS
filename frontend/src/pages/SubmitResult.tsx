import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, MapPin, CheckCircle, Camera, FileText, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { RootState } from '../store';
import { electionApi, geoApi, resultsApi } from '../services/api';
import { Election, Candidate } from '../types';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { offlineDb } from '../lib/offlineDb';
import toast from 'react-hot-toast';

const steps = ['Election', 'Polling Unit', 'Upload Photos', 'Enter Votes', 'Review & Submit'];

export default function SubmitResultPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [images, setImages] = useState<File[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [accredited, setAccredited] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: electionData } = useQuery({ queryKey: ['elections'], queryFn: () => electionApi.listElections() });
  const election = electionData?.data?.data?.find((e: Election) => e.status === 'ongoing');

  const { data: puData } = useQuery({
    queryKey: ['my-pu', user?.polling_unit_id],
    queryFn: () => geoApi.getPollingUnit(user!.polling_unit_id!),
    enabled: !!user?.polling_unit_id,
  });

  const { data: candidateData } = useQuery({
    queryKey: ['candidates', election?.id],
    queryFn: () => electionApi.listCandidates(election!.id),
    enabled: !!election?.id,
  });

  const pu = puData?.data?.data;
  const candidates = candidateData?.data?.data || [];

  // GPS capture
  const captureGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.success('GPS captured!'); },
        () => toast.error('GPS capture failed. Please enable location services.')
      );
    }
  };

  // Dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = [...images, ...acceptedFiles].slice(0, 5);
    setImages(newImages);
  }, [images]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] }, maxSize: 10485760, maxFiles: 5 - images.length
  });

  const totalValidVotes = Object.values(votes).reduce((s, v) => s + (v || 0), 0);
  const totalVotesCast = totalValidVotes + rejected;

  const handleSubmit = async () => {
    if (!election || !pu) return;
    setIsSubmitting(true);

    const voteEntries = candidates.map((c: Candidate) => ({ candidate_id: c.id, votes: votes[c.id] || 0 }));

    if (!isOnline) {
      try {
        const imageBlobs = await Promise.all(images.map(async (img) => {
          const arrayBuffer = await img.arrayBuffer();
          return new Blob([arrayBuffer], { type: img.type });
        }));
        await offlineDb.offlineResults.add({
          election_id: election.id, polling_unit_id: pu.id,
          accredited_voters: accredited, rejected_votes: rejected,
          registered_voters: pu.registered_voters || 0,
          total_votes_cast: totalVotesCast,
          total_valid_votes: totalValidVotes,
          votes: voteEntries, images: imageBlobs,
          latitude: gps?.lat || null, longitude: gps?.lng || null,
          pin, created_at: new Date().toISOString(), synced: 0,
        });
        toast.success('Result saved offline! Will sync when online.');
        navigate('/app/results');
      } catch (err) {
        toast.error('Failed to save offline');
      }
      setIsSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('election_id', String(election.id));
      formData.append('polling_unit_id', String(pu.id));
      formData.append('accredited_voters', String(accredited));
      formData.append('registered_voters', String(pu.registered_voters || 0));
      formData.append('total_votes_cast', String(totalVotesCast));
      formData.append('total_valid_votes', String(totalValidVotes));
      formData.append('rejected_votes', String(rejected));
      formData.append('votes', JSON.stringify(voteEntries));
      formData.append('pin', pin);
      if (gps) { formData.append('latitude', String(gps.lat)); formData.append('longitude', String(gps.lng)); }
      images.forEach(img => formData.append('images', img));

      const response = await resultsApi.submitResult(formData);
      toast.success('Result submitted successfully!');
      if (response.data?.data?.id) {
        navigate(`/app/results/${response.data.data.id}`);
      } else {
        navigate('/app/results');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Submission failed');
    }
    setIsSubmitting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">
      {/* Online status */}
      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border ${isOnline ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-status-error/20 bg-red-50 text-status-error'}`}>
        {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        {isOnline ? 'Online — results will be submitted immediately' : 'Offline — results will be saved locally and synced later'}
      </div>

      {/* Step Progress */}
      <div className="surface-elevated p-4 sm:p-5">
        <div className="flex items-center justify-between">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < currentStep ? 'bg-primary-700 text-white' : i === currentStep ? 'bg-accent-500 text-primary-950' : 'bg-primary-50 text-text-muted'
              }`}>{i < currentStep ? '✓' : i + 1}</div>
              {i < steps.length - 1 && <div className={`h-0.5 w-4 md:w-12 mx-1 ${i < currentStep ? 'bg-primary-600' : 'bg-primary-100'}`} />}
            </div>
          ))}
        </div>
        <p className="text-center text-primary-700 font-bold mt-3">{steps[currentStep]}</p>
      </div>

      {/* Step Content */}
      <div className="surface-elevated p-6 sm:p-8">
        {/* Step 1: Election */}
        {currentStep === 0 && (
          <div className="text-center space-y-4">
            <FileText className="w-12 h-12 text-primary-600 mx-auto" />
            <h2 className="font-display text-xl font-bold text-text-primary">{election?.title || 'No active election'}</h2>
            <p className="text-text-muted">Election Date: {election?.election_date}</p>
            {election && <button onClick={() => setCurrentStep(1)} className="btn-primary">Confirm & Continue</button>}
          </div>
        )}

        {/* Step 2: PU Confirm */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2"><MapPin className="w-5 h-5 text-primary-600" /> Your Polling Unit</h2>
            {pu ? (
              <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 space-y-2">
                <p className="text-text-primary font-medium">{pu.name}</p>
                <p className="text-text-muted text-sm">Code: <span className="font-mono">{pu.inec_pu_code}</span></p>
                <p className="text-text-muted text-sm">Registered Voters: <span className="font-mono text-primary-700">{pu.registered_voters}</span></p>
              </div>
            ) : (
              <p className="text-red-400">No polling unit assigned to your account.</p>
            )}
            <button onClick={() => { captureGPS(); }} className="btn-outline w-full flex items-center justify-center gap-2">
              <MapPin className="w-4 h-4" /> Capture GPS Location
            </button>
            {gps && <p className="text-accent-700 text-sm font-semibold">GPS: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</p>}
            <div className="flex gap-3">
              <button onClick={() => setCurrentStep(0)} className="btn-outline flex-1">Back</button>
              <button onClick={() => setCurrentStep(2)} className="btn-primary flex-1" disabled={!pu}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 3: Upload */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2"><Camera className="w-5 h-5 text-primary-600" /> Upload EC8A Photos</h2>
            <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${isDragActive ? 'border-accent-500 bg-accent-50' : 'border-primary-200 bg-primary-50/30 hover:border-primary-500'}`}>
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-text-muted mx-auto mb-2" />
              <p className="text-text-muted">Drag & drop photos or click to browse</p>
              <p className="text-text-muted text-xs mt-1">JPEG, PNG, WebP · Max 10MB · Up to 5 photos</p>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={URL.createObjectURL(img)} alt="" className="w-full h-24 object-cover rounded-lg" />
                    <button onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setCurrentStep(1)} className="btn-outline flex-1">Back</button>
              <button onClick={() => setCurrentStep(3)} className="btn-primary flex-1" disabled={images.length === 0}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 4: Vote Entry */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold text-text-primary">Enter Vote Counts</h2>
            <div className="space-y-3">
              {candidates.map((c: Candidate) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50/40 p-3">
                  <div>
                    <p className="text-text-primary font-medium text-sm">{c.full_name}</p>
                    <p className="text-text-muted text-xs">{c.party_code} — {c.party_name}</p>
                  </div>
                  <input type="number" min="0" value={votes[c.id] || ''} onChange={e => setVotes({ ...votes, [c.id]: parseInt(e.target.value) || 0 })}
                    className="w-24 input-field text-center font-mono text-lg py-2" placeholder="0" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text">Accredited Voters</label>
                <input type="number" min="0" value={accredited || ''} onChange={e => setAccredited(parseInt(e.target.value) || 0)} className="input-field font-mono" />
              </div>
              <div>
                <label className="label-text">Rejected Votes</label>
                <input type="number" min="0" value={rejected || ''} onChange={e => setRejected(parseInt(e.target.value) || 0)} className="input-field font-mono" />
              </div>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3 space-y-1">
              <div className="flex justify-between text-sm"><span className="text-text-muted">Total Valid Votes:</span><span className="font-mono text-primary-700">{totalValidVotes}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Total Votes Cast:</span><span className="font-mono text-text-primary font-bold">{totalVotesCast}</span></div>
            </div>
            {totalVotesCast > accredited && accredited > 0 && (
              <div className="flex items-center gap-2 text-red-400 text-sm"><AlertTriangle className="w-4 h-4" /> Votes exceed accredited voters!</div>
            )}
            <div>
              <label className="label-text">PIN (Digital Signature)</label>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} className="input-field font-mono" placeholder="Enter your PIN" maxLength={6} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCurrentStep(2)} className="btn-outline flex-1">Back</button>
              <button onClick={() => setCurrentStep(4)} className="btn-primary flex-1" disabled={totalValidVotes === 0}>Review</button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2"><CheckCircle className="w-5 h-5 text-accent-700" /> Review & Submit</h2>
            <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4 space-y-3">
              <p className="text-sm"><span className="text-text-muted">Election:</span> <span className="text-text-primary">{election?.title}</span></p>
              <p className="text-sm"><span className="text-text-muted">Polling Unit:</span> <span className="text-text-primary">{pu?.name} ({pu?.inec_pu_code})</span></p>
              <p className="text-sm"><span className="text-text-muted">Photos:</span> <span className="text-primary-700 font-semibold">{images.length} uploaded</span></p>
              {gps && <p className="text-sm"><span className="text-text-muted">GPS:</span> <span className="font-mono text-xs">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</span></p>}
              <hr className="border-dark-border" />
              {candidates.map((c: Candidate) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span className="text-text-muted">{c.party_code}:</span>
                  <span className="font-mono text-text-primary">{votes[c.id] || 0}</span>
                </div>
              ))}
              <hr className="border-dark-border" />
              <div className="flex justify-between text-sm font-bold"><span>Total Votes Cast:</span><span className="text-primary-700 font-mono">{totalVotesCast}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCurrentStep(3)} className="btn-outline flex-1">Back</button>
              <button onClick={handleSubmit} disabled={isSubmitting} className="btn-accent flex-1 flex items-center justify-center gap-2">
                {isSubmitting ? <div className="w-5 h-5 border-2 border-dark-bg/30 border-t-dark-bg rounded-full animate-spin" /> : <><Upload className="w-5 h-5" /> {isOnline ? 'Submit Result' : 'Save Offline'}</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
