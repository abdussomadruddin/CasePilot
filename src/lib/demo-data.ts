import {
  roleLabels,
  type ActivityEvent,
  type BankDetail,
  type CaseDocument,
  type CaseRecord,
  type CaseStatus,
  type DocumentType,
  type Profile,
  type Role,
} from "@/lib/types";
import { nextFollowUpFrom } from "@/lib/workflow";

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function retentionFrom(uploadedAt: string) {
  return new Date(+new Date(uploadedAt) + 45 * 24 * 60 * 60 * 1000).toISOString();
}

function activity(
  type: ActivityEvent["type"],
  actorRole: Role,
  message: string,
  createdAt: string,
  status?: CaseStatus,
): ActivityEvent {
  return {
    id: crypto.randomUUID(),
    type,
    actorRole,
    actorName: roleLabels[actorRole],
    message,
    status,
    createdAt,
  };
}

function bank(
  bankName: string,
  bankerName: string,
  bankerPhone: string,
): BankDetail {
  return {
    id: crypto.randomUUID(),
    bankName,
    bankerName,
    bankerPhone,
  };
}

function document(
  name: string,
  uploadedBy: Role,
  uploadedAt: string,
  documentType: DocumentType = "other",
): CaseDocument {
  return {
    id: crypto.randomUUID(),
    name,
    url: "#",
    documentType,
    uploadedBy,
    uploadedAt,
    expiresAt: retentionFrom(uploadedAt),
  };
}

export function createEmptyCase(): CaseRecord {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    customerName: "",
    customerPhone: "",
    carModel: "Honda City",
    carVariant: "",
    carColor: "",
    status: "documents_collected",
    remark: "",
    banks: [],
    documents: [],
    activities: [],
    createdBy: "customer_service",
    updatedBy: "customer_service",
    createdAt: now,
    updatedAt: now,
    nextFollowUpAt: nextFollowUpFrom(),
  };
}

export function seedCases(): CaseRecord[] {
  const aliCreated = daysAgo(3);
  const meiCreated = daysAgo(4);
  const kumarCreated = daysAgo(8);
  const aisyahCreated = daysAgo(2);
  const danielCreated = daysAgo(9);

  return [
    {
      id: crypto.randomUUID(),
      customerName: "Ali Rahman",
      customerPhone: "+60 12-234 8891",
      carModel: "Honda City",
      carVariant: "V Sensing",
      carColor: "Platinum White Pearl",
      status: "documents_collected",
      remark: "Documents are ready for bank submission.",
      banks: [
        bank("Maybank", "Nadia", "+60 17-220 0101"),
        bank("CIMB", "Farid", "+60 19-654 7878"),
      ],
      documents: [
        document("IC front.pdf", "customer_service", daysAgo(3), "ic"),
        document("License.pdf", "customer_service", daysAgo(3), "license"),
        document("Salary slip March.pdf", "customer_service", daysAgo(3), "pay_slip"),
        document("Bank statement.pdf", "customer_service", daysAgo(3), "bank_statement"),
        document("VSO.pdf", "customer_service", daysAgo(3), "vso"),
      ],
      activities: [
        activity("case", "customer_service", "Case created.", aliCreated),
        activity(
          "document",
          "customer_service",
          "Uploaded IC and salary slip.",
          daysAgo(3),
        ),
        activity(
          "status",
          "customer_service",
          "Status changed to documents collected.",
          hoursAgo(9),
          "documents_collected",
        ),
      ],
      createdBy: "customer_service",
      updatedBy: "customer_service",
      createdAt: aliCreated,
      updatedAt: hoursAgo(9),
      nextFollowUpAt: hoursAgo(1),
    },
    {
      id: crypto.randomUUID(),
      customerName: "Mei Ling",
      customerPhone: "+60 13-808 7731",
      carModel: "Honda HR-V",
      carVariant: "RS e:HEV",
      carColor: "Meteoroid Grey",
      status: "more_documents_needed",
      remark: "Need updated EPF statement before resubmission.",
      banks: [bank("Public Bank", "Daniel Tan", "+60 16-445 9012")],
      documents: [
        document("IC.pdf", "customer_service", daysAgo(4), "ic"),
        document("Bank statement.pdf", "customer_service", daysAgo(4), "bank_statement"),
      ],
      activities: [
        activity("case", "customer_service", "Case created.", meiCreated),
        activity(
          "status",
          "finance",
          "Bank requested supporting EPF statement.",
          hoursAgo(7),
          "more_documents_needed",
        ),
      ],
      createdBy: "customer_service",
      updatedBy: "finance",
      createdAt: meiCreated,
      updatedAt: hoursAgo(7),
      nextFollowUpAt: daysFromNow(1),
    },
    {
      id: crypto.randomUUID(),
      customerName: "Kumar Velu",
      customerPhone: "+60 18-700 4422",
      carModel: "Honda Civic",
      carVariant: "E",
      carColor: "Crystal Black Pearl",
      status: "lou_received",
      remark: "LOU received from bank. Customer needs a call today.",
      banks: [bank("RHB", "Amira", "+60 14-991 2525")],
      documents: [
        document("LOU RHB.pdf", "finance", daysAgo(1), "lou"),
        document("Loan application.pdf", "customer_service", daysAgo(8), "bank_statement"),
      ],
      activities: [
        activity("case", "customer_service", "Case created.", kumarCreated),
        activity(
          "status",
          "finance",
          "LOU received from RHB.",
          hoursAgo(4),
          "lou_received",
        ),
        activity(
          "remark",
          "finance",
          "Banker confirmed approval is valid for 30 days.",
          hoursAgo(4),
        ),
      ],
      createdBy: "customer_service",
      updatedBy: "finance",
      createdAt: kumarCreated,
      updatedAt: hoursAgo(4),
      nextFollowUpAt: hoursAgo(2),
    },
    {
      id: crypto.randomUUID(),
      customerName: "Aisyah Zain",
      customerPhone: "+60 11-3377 6810",
      carModel: "Honda CR-V",
      carVariant: "V",
      carColor: "Canyon River Blue",
      status: "car_registered",
      remark: "Registration complete. Arrange delivery slot.",
      banks: [bank("Hong Leong Bank", "Jason", "+60 12-111 6609")],
      documents: [
        document("JPJ registration.pdf", "operator", hoursAgo(8), "jpj_registration"),
        document("LOU.pdf", "finance", daysAgo(1), "lou"),
      ],
      activities: [
        activity("case", "customer_service", "Case created.", aisyahCreated),
        activity(
          "status",
          "operator",
          "Vehicle registered with JPJ.",
          hoursAgo(8),
          "car_registered",
        ),
      ],
      createdBy: "customer_service",
      updatedBy: "operator",
      createdAt: aisyahCreated,
      updatedAt: hoursAgo(8),
      nextFollowUpAt: daysFromNow(2),
    },
    {
      id: crypto.randomUUID(),
      customerName: "Daniel Chong",
      customerPhone: "+60 12-909 3388",
      carModel: "Honda WR-V",
      carVariant: "RS",
      carColor: "Ignite Red Metallic",
      status: "car_delivered",
      remark: "Delivered with signed handover form.",
      banks: [bank("Ambank", "Liyana", "+60 17-909 1100")],
      documents: [
        document("Delivery handover.pdf", "operator", daysAgo(1)),
        document("Warranty booklet.pdf", "operator", daysAgo(1)),
      ],
      activities: [
        activity("case", "customer_service", "Case created.", danielCreated),
        activity(
          "status",
          "operator",
          "Car delivered to customer.",
          daysAgo(1),
          "car_delivered",
        ),
      ],
      createdBy: "customer_service",
      updatedBy: "operator",
      createdAt: danielCreated,
      updatedAt: daysAgo(1),
      nextFollowUpAt: "",
    },
  ];
}

export function seedTeamMembers(): Profile[] {
  return [
    {
      id: "demo-admin",
      email: "admin@honda-case.local",
      fullName: "Admin Team",
      role: "admin",
      phone: "+60 12-100 0001",
    },
    {
      id: "demo-customer-service",
      email: "cs@honda-case.local",
      fullName: "Customer Service",
      role: "customer_service",
      phone: "+60 12-100 0002",
    },
    {
      id: "demo-finance",
      email: "finance@honda-case.local",
      fullName: "Finance Team",
      role: "finance",
      phone: "+60 12-100 0003",
    },
    {
      id: "demo-caller",
      email: "caller@honda-case.local",
      fullName: "Caller Team",
      role: "caller",
      phone: "+60 12-100 0004",
    },
    {
      id: "demo-operator",
      email: "operator@honda-case.local",
      fullName: "Operator Team",
      role: "operator",
      phone: "+60 12-100 0005",
    },
  ];
}
