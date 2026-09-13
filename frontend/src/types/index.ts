// ==================== AUTH ====================
export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: UserStatus;
  lga_id: number | null;
  ward_id: number | null;
  polling_unit_id: number | null;
  nin: string | null;
  photo_url: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  language: string;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'super_admin' | 'state_coordinator' | 'lga_coordinator' | 'ward_officer' | 'pu_agent' | 'observer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginRequest {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisterRequest {
  email?: string;
  phone?: string;
  password: string;
  first_name: string;
  last_name: string;
  requested_role: UserRole;
  lga_id?: number;
  ward_id?: number;
  polling_unit_id?: number;
  nin?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ==================== GEO ====================
export interface LGA {
  id: number;
  name: string;
  code: string;
  headquarters: string;
  latitude: number;
  longitude: number;
  ward_count?: number;
  pu_count?: number;
}

export interface Ward {
  id: number;
  lga_id: number;
  name: string;
  code: string;
  lga_name?: string;
  pu_count?: number;
}

export interface PollingUnit {
  id: number;
  ward_id: number;
  lga_id: number;
  name: string;
  inec_pu_code: string;
  registered_voters: number;
  latitude: number;
  longitude: number;
  ward_name?: string;
  lga_name?: string;
}

// ==================== ELECTION ====================
export interface Election {
  id: number;
  title: string;
  election_type: string;
  election_date: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  state: string;
  description: string | null;
  candidates?: Candidate[];
  created_at: string;
}

export interface Candidate {
  id: number;
  election_id: number;
  full_name: string;
  party_code: string;
  party_name: string;
  photo_url: string | null;
  position: number;
  total_votes?: number;
  vote_percentage?: number;
}

// ==================== RESULTS ====================
export interface ResultSubmission {
  id: number;
  submission_uid: string;
  election_id: number;
  polling_unit_id: number;
  ward_id: number;
  lga_id: number;
  submitted_by: number;
  accredited_voters: number;
  total_valid_votes: number;
  rejected_votes: number;
  total_votes_cast: number;
  latitude: number | null;
  longitude: number | null;
  content_hash: string;
  digital_signature: string;
  status: ResultStatus;
  verified_by: number | null;
  verified_at: string | null;
  rejection_reason: string | null;
  is_offline_submission: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  polling_unit_name?: string;
  ward_name?: string;
  lga_name?: string;
  submitter_name?: string;
  verifier_name?: string;
  images?: ResultImage[];
  votes?: VoteData[];
}

export type ResultStatus = 'pending' | 'verified' | 'rejected' | 'flagged' | 'disputed';

export interface ResultImage {
  id: number;
  submission_id: number;
  image_url: string;
  image_type: string;
  file_size: number;
}

export interface VoteData {
  id: number;
  submission_id: number;
  candidate_id: number;
  votes: number;
  candidate_name?: string;
  party_code?: string;
  party_name?: string;
}

export interface SubmitResultRequest {
  election_id: number;
  polling_unit_id: number;
  accredited_voters: number;
  rejected_votes: number;
  votes: { candidate_id: number; votes: number }[];
  latitude?: number;
  longitude?: number;
  pin?: string;
  is_offline_submission?: boolean;
}

// ==================== COLLATION ====================
export interface CollationRecord {
  id: number;
  election_id: number;
  level: 'ward' | 'lga' | 'state';
  entity_id: number;
  entity_name: string;
  total_registered_voters: number;
  total_accredited_voters: number;
  total_valid_votes: number;
  total_rejected_votes: number;
  total_votes_cast: number;
  total_polling_units: number;
  reported_polling_units: number;
  status: 'pending' | 'completed' | 'signed';
  collated_by: number | null;
  digital_signature: string | null;
  signed_at: string | null;
  created_at: string;
  votes?: CollationVote[];
}

export interface CollationVote {
  candidate_id: number;
  candidate_name: string;
  party_code: string;
  total_votes: number;
}

// ==================== DASHBOARD ====================
export interface StateDashboard {
  election: Election;
  total_lgas: number;
  total_wards: number;
  total_polling_units: number;
  reported_polling_units: number;
  verified_polling_units: number;
  total_registered_voters: number;
  total_votes_cast: number;
  turnout_percentage: number;
  candidates: CandidateResult[];
  lgas: LGADashboardSummary[];
}

export interface CandidateResult {
  candidate_id: number;
  full_name: string;
  party_code: string;
  party_name: string;
  total_votes: number;
  vote_percentage: number;
}

export interface LGADashboardSummary {
  lga_id: number;
  lga_name: string;
  lga_code?: string;
  total_wards?: number;
  total_polling_units: number;
  reported_polling_units: number;
  verified_polling_units?: number;
  reporting_percentage: number;
  total_votes?: number;
  total_registered_voters?: number;
  total_accredited_voters?: number;
  total_votes_cast?: number;
  total_valid_votes?: number;
  rejected_votes?: number;
  turnout_percentage?: number;
  accreditation_percentage?: number;
  leading_party?: string;
  leading_candidate?: string;
  lead_margin?: number;
  latitude?: number;
  longitude?: number;
  candidates?: CandidateResult[];
}

export interface WardDashboardSummary {
  ward_id: number;
  ward_name: string;
  ward_code?: string;
  total_polling_units: number;
  reported_polling_units: number;
  verified_polling_units?: number;
  reporting_percentage: number;
  total_votes?: number;
  total_registered_voters?: number;
  total_accredited_voters?: number;
  total_votes_cast?: number;
  total_valid_votes?: number;
  rejected_votes?: number;
  turnout_percentage?: number;
  accreditation_percentage?: number;
  leading_party?: string;
  leading_candidate?: string;
  candidates?: CandidateResult[];
}

export interface Anomaly {
  id?: number;
  submission_id?: number;
  submission_uid?: string;
  polling_unit_name: string;
  ward_name?: string;
  lga_name?: string;
  type?: string;
  detail: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'warning';
  status?: 'open' | 'resolved' | 'dismissed';
  timestamp?: string;
}

export interface TimelineEntry {
  hour: string;
  count: number;
}

export interface CollationRequest {
  election_id: number;
  ward_id?: number;
  lga_id?: number;
  pin?: string;
}

// ==================== DISPUTE ====================
export interface Dispute {
  id: number;
  election_id: number;
  submission_id: number | null;
  raised_by: number;
  assigned_to: number | null;
  title: string;
  description: string;
  category: DisputeCategory;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: DisputeStatus;
  resolution_notes: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  escalation_level: 'ward' | 'lga' | 'state';
  created_at: string;
  updated_at: string;
  // Joined
  raiser_name?: string;
  assignee_name?: string;
  resolver_name?: string;
  submission_uid?: string;
  comments?: DisputeComment[];
  evidence?: DisputeEvidence[];
}

export type DisputeCategory = 'vote_count_mismatch' | 'image_quality' | 'gps_mismatch' | 'duplicate_entry' | 'tampering' | 'other';
export type DisputeStatus = 'open' | 'investigating' | 'escalated' | 'resolved' | 'dismissed';

export interface DisputeComment {
  id: number;
  dispute_id: number;
  user_id: number;
  comment: string;
  created_at: string;
  user_name?: string;
  user_role?: string;
}

export interface DisputeEvidence {
  id: number;
  dispute_id: number;
  uploaded_by: number;
  file_url: string;
  file_type: string;
  description: string;
  created_at: string;
  uploader_name?: string;
}

// ==================== NOTIFICATIONS ====================
export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  reference_type: string | null;
  reference_id: number | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreference {
  notification_type: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
}

// ==================== AUDIT ====================
export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string;
  resource_id: number | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string;
  user_agent: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

// ==================== REGISTRATION ====================
export interface RegistrationApplication {
  id: number;
  user_id: number | null;
  email: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  requested_role: UserRole;
  lga_id: number | null;
  ward_id: number | null;
  polling_unit_id: number | null;
  nin: string | null;
  accreditation_doc_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  lga_name?: string;
  ward_name?: string;
  polling_unit_name?: string;
}

// ==================== API RESPONSE ====================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T> {
  pagination: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ==================== UI STATE ====================
export interface UiState {
  sidebarOpen: boolean;
  theme: 'dark';
  isMobile: boolean;
}

// ==================== SITUATION ROOM ====================
export interface SituationRoomData {
  election: Election;
  candidates: CandidateResult[];
  total_lgas?: number;
  reported_lgas?: number;
  verified_lgas?: number;
  total_polling_units: number;
  reported_polling_units: number;
  verified_polling_units: number;
  total_registered_voters: number;
  total_accredited_voters?: number;
  total_votes_cast: number;
  total_valid_votes?: number;
  rejected_votes?: number;
  accreditation_percentage?: number;
  turnout_percentage: number;
  valid_vote_percentage?: number;
  rejected_vote_percentage?: number;
  reporting_percentage: number;
  leading_party?: string;
  leading_candidate?: string;
  lead_margin?: number;
  lga_breakdown: LGADashboardSummary[];
  last_updated: string;
}

export interface SituationRoomLGAData {
  lga: LGA;
  election: Election;
  candidates: CandidateResult[];
  wards: WardDashboardSummary[];
  total_wards?: number;
  reported_wards?: number;
  verified_wards?: number;
  total_polling_units: number;
  reported_polling_units: number;
  verified_polling_units: number;
  total_registered_voters: number;
  total_accredited_voters: number;
  total_votes_cast: number;
  total_valid_votes: number;
  rejected_votes: number;
  accreditation_percentage: number;
  turnout_percentage: number;
  valid_vote_percentage: number;
  rejected_vote_percentage: number;
  reporting_percentage: number;
  leading_party: string;
  leading_candidate: string;
  lead_margin: number;
  last_updated: string;
}

export interface PollingUnitCandidateVote {
  candidate_id: number;
  party_code: string;
  full_name: string;
  votes: number;
}

export interface SituationRoomPUDetail {
  id: number;
  name: string;
  inec_pu_code: string;
  registered_voters: number;
  submission_id: number | null;
  submission_uid: string | null;
  status: 'verified' | 'pending' | 'flagged' | 'rejected' | 'not_reported';
  accredited_voters: number | null;
  total_votes_cast: number | null;
  total_valid_votes: number | null;
  rejected_votes: number | null;
  turnout_percentage: number;
  submitted_at: string | null;
  verified_at: string | null;
  leading_party: string;
  leading_candidate: string;
  votes: PollingUnitCandidateVote[];
}

export interface SituationRoomWardData {
  ward: {
    id: number;
    name: string;
    code: string;
    lga_id: number;
    lga_name: string;
    lga_code: string;
  };
  election: Election;
  candidates: CandidateResult[];
  polling_units: SituationRoomPUDetail[];
  total_polling_units: number;
  reported_polling_units: number;
  verified_polling_units: number;
  total_registered_voters: number;
  total_accredited_voters: number;
  total_votes_cast: number;
  total_valid_votes: number;
  rejected_votes: number;
  accreditation_percentage: number;
  turnout_percentage: number;
  valid_vote_percentage: number;
  rejected_vote_percentage: number;
  reporting_percentage: number;
  lead_margin: number;
  leading_party: string;
  leading_candidate: string;
  last_updated: string;
}

// Duplicates removed

// ==================== OFFLINE ====================
export interface OfflineSubmission {
  id?: number;
  data: SubmitResultRequest;
  images: File[];
  createdAt: string;
  synced: boolean;
  syncedAt?: string;
  error?: string;
}

// ==================== REQUEST/API INTERFACES ====================
export interface ApiParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  action?: string;
  resource_type?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface RaiseDisputeRequest {
  election_id?: number;
  submission_id?: number;
  title: string;
  description: string;
  category: string;
  priority: string;
}

export interface ResolveDisputeRequest {
  dispute_id?: number;
  status: string;
  resolution_notes?: string;
}

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ChangePasswordRequest {
  current_password?: string;
  new_password?: string;
}

export interface ReviewApplicationRequest {
  application_id?: number;
  status: string;
  review_notes?: string;
}
