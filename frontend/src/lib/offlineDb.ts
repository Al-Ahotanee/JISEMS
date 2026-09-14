import Dexie, { Table } from 'dexie';

export interface OfflineResult {
  id?: number;
  election_id: number;
  polling_unit_id: number;
  accredited_voters: number;
  registered_voters: number;
  total_votes_cast: number;
  total_valid_votes: number;
  rejected_votes: number;
  votes: { candidate_id: number; votes: number }[];
  images: Blob[];
  latitude: number | null;
  longitude: number | null;
  pin: string;
  created_at: string;
  synced: number;
  sync_error?: string;
}

export interface OfflineIncident {
  id?: number;
  election_id?: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  created_at: string;
  synced: number;
  sync_error?: string;
}

export interface CachedMetadata {
  key: string;
  data: any;
  updated_at: string;
}

export class JISEMSOfflineDB extends Dexie {
  offlineResults!: Table<OfflineResult>;
  offlineIncidents!: Table<OfflineIncident>;
  cachedMetadata!: Table<CachedMetadata, string>;

  constructor() {
    super('jisems-offline');
    this.version(3).stores({
      offlineResults: '++id, election_id, polling_unit_id, synced, created_at',
      offlineIncidents: '++id, synced, created_at',
      cachedMetadata: 'key, updated_at',
    });
  }

  async setCachedData<T>(key: string, data: T): Promise<void> {
    try {
      await this.cachedMetadata.put({
        key,
        data,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[OfflineDB] Failed to cache metadata:', key, e);
    }
  }

  async getCachedData<T>(key: string): Promise<T | null> {
    try {
      const entry = await this.cachedMetadata.get(key);
      return entry ? (entry.data as T) : null;
    } catch (e) {
      console.warn('[OfflineDB] Failed to read cached metadata:', key, e);
      return null;
    }
  }
}

export const offlineDb = new JISEMSOfflineDB();
export const GSEMOfflineDB = JISEMSOfflineDB;

