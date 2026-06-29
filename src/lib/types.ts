export const roles = [
  "admin",
  "customer_service",
  "finance",
  "caller",
  "operator",
] as const;

export type Role = (typeof roles)[number];

export const roleLabels: Record<Role, string> = {
  admin: "Admin",
  customer_service: "Customer Service",
  finance: "Finance",
  caller: "Caller",
  operator: "Operator",
};

export const caseStatuses = [
  "documents_collected",
  "more_documents_needed",
  "submission",
  "rejected",
  "lou_received",
  "hint_submitted",
  "booking_form_received",
  "registration_needed",
  "roadtax_grant_process",
  "prepare_delivery",
  "car_delivery",
  "cancelled",
] as const;

export type CaseStatus = (typeof caseStatuses)[number];

export const statusLabels: Record<CaseStatus, string> = {
  documents_collected: "Documents Collected",
  more_documents_needed: "More Documents Needed",
  submission: "Submission",
  rejected: "Rejected",
  lou_received: "LOU Received",
  hint_submitted: "HINT Submitted",
  booking_form_received: "Booking Form Received",
  registration_needed: "Registration Needed",
  roadtax_grant_process: "Roadtax & Grant Process",
  prepare_delivery: "Prepare Delivery",
  car_delivery: "Car Delivery",
  cancelled: "Cancelled",
};

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
