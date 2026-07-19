export const roles = [
  "admin",
  "customer_service",
  "finance",
  "caller",
  "operator",
  "sales_manager",
] as const;

export type Role = (typeof roles)[number];

export const roleLabels: Record<Role, string> = {
  admin: "Admin",
  customer_service: "Customer Service",
  finance: "Finance",
  caller: "Caller",
  operator: "Operator",
  sales_manager: "Sales Manager",
};

export const caseDealers = ["kah_motor", "other_dealer"] as const;

export type CaseDealer = (typeof caseDealers)[number];

export const caseDealerLabels: Record<CaseDealer, string> = {
  kah_motor: "KAH MOTOR",
  other_dealer: "OTHER DEALER",
};

export const caseStatuses = [
  "documents_collected",
  "more_documents_needed",
  "submission",
  "rejected",
  "lou_received",
  "pending_sign_agreement",
  "pending_allocation",
  "waiting_ehakmilik",
  "registered",
  "grant_roadtax_collected",
  "prepare_delivery",
  "car_delivery",
  "cancelled",
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export const legacyCaseStatuses = [
  "hint_submitted",
  "booking_form_received",
  "registration_needed",
  "roadtax_grant_process",
] as const;

export type LegacyCaseStatus = (typeof legacyCaseStatuses)[number];
export type DatabaseCaseStatus = CaseStatus | LegacyCaseStatus;

export const statusLabels: Record<CaseStatus, string> = {
  documents_collected: "Document collected",
  more_documents_needed: "More document needed",
  submission: "Submission",
  rejected: "Rejected",
  lou_received: "LOU received",
  pending_sign_agreement: "Pending sign agreement",
  pending_allocation: "Pending allocation",
  waiting_ehakmilik: "Waiting ehakmilik",
  registered: "Registered",
  grant_roadtax_collected: "Grant & roadtax collected",
  prepare_delivery: "Prepare delivery",
  car_delivery: "Delivered",
  cancelled: "Cancelled",
};

const legacyStatusMap: Record<LegacyCaseStatus, CaseStatus> = {
  hint_submitted: "pending_allocation",
  booking_form_received: "waiting_ehakmilik",
  registration_needed: "registered",
  roadtax_grant_process: "grant_roadtax_collected",
};

export function normalizeCaseStatus(status: DatabaseCaseStatus): CaseStatus {
  return status in legacyStatusMap
    ? legacyStatusMap[status as LegacyCaseStatus]
    : (status as CaseStatus);
}

export type ActivityType =
  | "case"
  | "status"
  | "remark"
  | "document"
  | "bank"
  | "notification"
  | "follow_up";

export type BankDetail = {
  id: string;
  bankName: string;
  bankerName: string;
  bankerPhone: string;
};

export const documentTypes = [
  "ic",
  "license",
  "pay_slip",
  "bank_statement",
  "offer_letter",
  "vso",
  "lou",
  "booking_form",
  "jpj_registration_slip",
  "roadtax_grant",
] as const;

export type DocumentType = (typeof documentTypes)[number] | "other";

export const documentTypeLabels: Record<DocumentType, string> = {
  ic: "IC",
  license: "License",
  pay_slip: "Pay Slip",
  bank_statement: "Bank Statement",
  offer_letter: "Offer Letter",
  vso: "VSO",
  lou: "LOU",
  booking_form: "Booking Form",
  jpj_registration_slip: "JPJ Registration Slip",
  roadtax_grant: "Roadtax & Grant",
  other: "Other Documents",
};

export type CaseDocument = {
  id: string;
  name: string;
  url: string;
  documentType: DocumentType;
  storagePath?: string;
  folderUrl?: string;
  uploadedBy: Role;
  uploadedAt: string;
  expiresAt?: string;
  deletedAt?: string;
  deleteReason?: string;
};

export type UploadDocumentInput = {
  file: File;
  documentType: DocumentType;
};

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  actorRole: Role;
  actorName: string;
  message: string;
  status?: CaseStatus;
  createdAt: string;
};

export type CaseRecord = {
  id: string;
  dealer: CaseDealer | "";
  customerName: string;
  customerPhone: string;
  carModel: string;
  carVariant: string;
  carColor: string;
  status: CaseStatus;
  remark: string;
  banks: BankDetail[];
  documents: CaseDocument[];
  activities: ActivityEvent[];
  createdBy: Role;
  updatedBy: Role;
  createdAt: string;
  updatedAt: string;
  nextFollowUpAt: string;
};

export type CaseFormValues = {
  dealer: CaseDealer | "";
  customerName: string;
  customerPhone: string;
  carModel: string;
  carVariant: string;
  carColor: string;
  status: CaseStatus;
  remark: string;
  banks: BankDetail[];
};

export type DashboardTab =
  | "all"
  | "tasks"
  | "attention"
  | "followup"
  | "completed"
  | "team";

export type Profile = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  active?: boolean;
};
