import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { offlineDb } from '../../lib/offlineDb';
import { resultsApi, disputeApi } from '../../services/api';

export default function OfflineSyncManager() {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const syncAttemptedRef = useRef(false);

  useEffect(() => {
    // Only attempt sync if we just came online and aren't already syncing
    if (!isOnline || isSyncing) {
      syncAttemptedRef.current = false;
      return;
    }

    if (syncAttemptedRef.current) return;

    const syncPendingResults = async () => {
      try {
        const pendingResults = await offlineDb.offlineResults.where('synced').equals(0).toArray();
        
        if (pendingResults.length === 0) return;

        setIsSyncing(true);
        syncAttemptedRef.current = true;
        toast.loading(`Syncing ${pendingResults.length} offline result(s)...`, { id: 'offline-sync' });

        let successCount = 0;
        let failCount = 0;

        for (const result of pendingResults) {
          try {
            const formData = new FormData();
            formData.append('election_id', String(result.election_id));
            formData.append('polling_unit_id', String(result.polling_unit_id));
            formData.append('accredited_voters', String(result.accredited_voters));
            formData.append('registered_voters', String(result.registered_voters || 0));
            formData.append('total_votes_cast', String(result.total_votes_cast || 0));
            formData.append('total_valid_votes', String(result.total_valid_votes || 0));
            formData.append('rejected_votes', String(result.rejected_votes));
            formData.append('votes', JSON.stringify(result.votes));
            formData.append('pin', result.pin || '');
            
            if (result.latitude && result.longitude) {
              formData.append('latitude', String(result.latitude));
              formData.append('longitude', String(result.longitude));
            }
            
            if (result.images && result.images.length > 0) {
              result.images.forEach(img => {
                // Determine extension from type, fallback to jpeg
                let ext = 'jpg';
                if (img.type === 'image/png') ext = 'png';
                else if (img.type === 'image/webp') ext = 'webp';
                
                formData.append('images', new File([img], `evidence_${Date.now()}.${ext}`, { type: img.type }));
              });
            }

            await resultsApi.submitResult(formData);
            
            // Delete upon success
            if (result.id) {
              await offlineDb.offlineResults.delete(result.id);
            }
            successCount++;
          } catch (error: unknown) {
            console.error('Failed to sync offline result:', error);
            failCount++;
            
            // Mark with error
            if (result.id) {
              const err = error as { message?: string, response?: { data?: { message?: string } } };
              await offlineDb.offlineResults.update(result.id, {
                sync_error: err.response?.data?.message || err.message || 'Unknown error'
              });
            }
          }
        }

        if (failCount === 0) {
          toast.success(`Successfully synced ${successCount} result(s)!`, { id: 'offline-sync' });
        } else if (successCount > 0) {
          toast.error(`Synced ${successCount} result(s), but ${failCount} failed. Check pending list.`, { id: 'offline-sync' });
        } else {
          toast.error(`Failed to sync ${failCount} offline result(s).`, { id: 'offline-sync' });
        }

      } catch (err) {
        console.error('Offline sync error:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    const syncPendingIncidents = async () => {
      try {
        const pendingIncidents = await offlineDb.offlineIncidents.where('synced').equals(0).toArray();
        if (pendingIncidents.length === 0) return;

        setIsSyncing(true);
        syncAttemptedRef.current = true;
        toast.loading(`Syncing ${pendingIncidents.length} offline incident(s)...`, { id: 'offline-sync-incidents' });

        let successCount = 0;
        let failCount = 0;

        for (const incident of pendingIncidents) {
          try {
            await disputeApi.raiseDispute({
              election_id: incident.election_id,
              title: incident.title,
              description: incident.description,
              category: incident.category,
              priority: incident.priority
            });

            if (incident.id) {
              await offlineDb.offlineIncidents.delete(incident.id);
            }
            successCount++;
          } catch (error: unknown) {
            console.error('Failed to sync offline incident:', error);
            failCount++;
            if (incident.id) {
              const err = error as { message?: string, response?: { data?: { message?: string } } };
              await offlineDb.offlineIncidents.update(incident.id, {
                sync_error: err.response?.data?.message || err.message || 'Unknown error'
              });
            }
          }
        }

        if (failCount === 0) {
          toast.success(`Successfully synced ${successCount} incident(s)!`, { id: 'offline-sync-incidents' });
        } else if (successCount > 0) {
          toast.error(`Synced ${successCount} incident(s), but ${failCount} failed.`, { id: 'offline-sync-incidents' });
        } else {
          toast.error(`Failed to sync ${failCount} offline incident(s).`, { id: 'offline-sync-incidents' });
        }
      } catch (err) {
        console.error('Offline sync incidents error:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncPendingResults().then(() => {
      syncPendingIncidents();
    });

  }, [isOnline, isSyncing]);

  return null;
}
