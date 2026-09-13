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

export class GSEMOfflineDB extends Dexie {
  offlineResults!: Table<OfflineResult>;
  offlineIncidents!: Table<OfflineIncident>;

  constructor() {
    super('gsem-offline');
    this.version(2).stores({
      offlineResults: '++id, election_id, polling_unit_id, synced, created_at',
      offlineIncidents: '++id, synced, created_at',
    });
  }
}

export const offlineDb = new GSEMOfflineDB();
