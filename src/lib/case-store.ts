import { seedCases } from "@/lib/demo-data";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import {
  roleLabels,
  documentTypeLabels,
  type ActivityEvent,
  type BankDetail,
  type CaseDocument,
  type CaseRecord,
  type CaseStatus,
  type DocumentType,
  type Role,
  type UploadDocumentInput,
} from "@/lib/types";
import { createActivity, nextFollowUpFrom } from "@/lib/workflow";

const storageKey = "honda-case-operation-system:cases";

type StoreResult = {
  source: "supabase" | "demo";
  cases: CaseRecord[];
};

type CaseRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  car_model: string;
  car_variant: string;
  car_color: string;
  status: CaseStatus;
  remark: string | null;
  created_by_role: Role;
  updated_by_role: Role;
  created_at: string;
  updated_at: string;
  next_follow_up_at: string | null;
  case_banks?: BankRow[];
  case_documents?: DocumentRow[];
  case_activities?: ActivityRow[];
};

type BankRow = {
  id: string;
  case_id: string;
  bank_name: string;
  banker_name: string;
  banker_phone: string;
};

type DocumentRow = {
  id: string;
  case_id: string;
  file_name: string;
  file_url: string;
  document_type: DocumentType | null;
  storage_path: string | null;
  uploaded_by_role: Role;
  uploaded_at: string;
};

type ActivityRow = {
  id: string;
  case_id: string;
  type: ActivityEvent["type"];
  actor_role: Role;
  actor_name: string | null;
  message: string;
  status: CaseStatus | null;
  created_at: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function readDemoCases() {
  if (!isBrowser()) return seedCases();

  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    const seeded = seedCases();
    window.localStorage.setItem(storageKey, JSON.stringify(seeded));
    return seeded;
  }

  try {
    return JSON.parse(stored) as CaseRecord[];
  } catch {
    const seeded = seedCases();
    window.localStorage.setItem(storageKey, JSON.stringify(seeded));
    return seeded;
  }
}

function writeDemoCases(cases: CaseRecord[]) {
  if (isBrowser()) {
    window.localStorage.setItem(storageKey, JSON.stringify(cases));
  }
}

function mapCase(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    carModel: row.car_model,
    carVariant: row.car_variant,
    carColor: row.car_color,
    status: row.status,
    remark: row.remark || "",
    banks: (row.case_banks || []).map(mapBank),
    documents: (row.case_documents || []).map(mapDocument),
    activities: (row.case_activities || []).map(mapActivity).sort(sortOldestFirst),
    createdBy: row.created_by_role,
    updatedBy: row.updated_by_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextFollowUpAt: row.next_follow_up_at || nextFollowUpFrom(new Date(row.updated_at)),
  };
}

function mapBank(row: BankRow): BankDetail {
  return {
    id: row.id,
    bankName: row.bank_name,
    bankerName: row.banker_name,
    bankerPhone: row.banker_phone,
  };
}

function mapDocument(row: DocumentRow): CaseDocument {
  return {
    id: row.id,
    name: row.file_name,
    url: row.file_url,
    documentType: row.document_type || "other",
    storagePath: row.storage_path || undefined,
    uploadedBy: row.uploaded_by_role,
    uploadedAt: row.uploaded_at,
  };
}

function mapActivity(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    type: row.type,
    actorRole: row.actor_role,
    actorName: row.actor_name || roleLabels[row.actor_role],
    message: row.message,
    status: row.status || undefined,
    createdAt: row.created_at,
  };
}

function sortOldestFirst(a: ActivityEvent, b: ActivityEvent) {
  return +new Date(a.createdAt) - +new Date(b.createdAt);
}

function toCaseRow(record: CaseRecord) {
  return {
    id: record.id,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    car_model: record.carModel,
    car_variant: record.carVariant,
    car_color: record.carColor,
    status: record.status,
    remark: record.remark,
    created_by_role: record.createdBy,
    updated_by_role: record.updatedBy,
    next_follow_up_at: record.nextFollowUpAt || null,
  };
}

export async function loadCases(): Promise<StoreResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { source: "demo", cases: readDemoCases() };
  }

  const { data, error } = await supabase
    .from("cases")
    .select(
      `
      *,
      case_banks (*),
      case_documents (*),
      case_activities (*)
    `,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return {
    source: "supabase",
    cases: ((data || []) as CaseRow[]).map(mapCase),
  };
}

export async function saveCase(
  record: CaseRecord,
  actorRole: Role,
  previousRecord?: CaseRecord,
): Promise<CaseRecord[]> {
  const now = new Date().toISOString();
  const isNew = !previousRecord;
  const statusChanged = previousRecord && previousRecord.status !== record.status;
  const remarkChanged =
    record.remark.trim() &&
    (!previousRecord || previousRecord.remark.trim() !== record.remark.trim());

  const activities: ActivityEvent[] = [];

  if (isNew) {
    activities.push(createActivity("case", actorRole, "Case created."));
  }

  if (statusChanged || isNew) {
    activities.push(
      createActivity(
        "status",
        actorRole,
        `Status changed to ${record.status.replaceAll("_", " ")}.`,
        record.status,
      ),
    );
  }

  if (remarkChanged) {
    activities.push(createActivity("remark", actorRole, record.remark));
  }

  const savedRecord: CaseRecord = {
    ...record,
    updatedBy: actorRole,
    updatedAt: now,
    createdAt: previousRecord?.createdAt || record.createdAt || now,
    nextFollowUpAt:
      record.status === "car_delivered" || record.status === "cancelled"
        ? ""
        : record.nextFollowUpAt || nextFollowUpFrom(),
    activities: [...record.activities, ...activities].sort(sortOldestFirst),
  };

  const supabase = getSupabaseClient();

  if (!supabase) {
    const existing = readDemoCases();
    const next = isNew
      ? [savedRecord, ...existing]
      : existing.map((item) => (item.id === savedRecord.id ? savedRecord : item));
    writeDemoCases(next);
    return next;
  }

  const { error: caseError } = await supabase.from("cases").upsert(toCaseRow(savedRecord));
  if (caseError) throw caseError;

  await supabase.from("case_banks").delete().eq("case_id", savedRecord.id);

  if (savedRecord.banks.length) {
    const { error: bankError } = await supabase.from("case_banks").insert(
      savedRecord.banks.map((bank) => ({
        id: bank.id,
        case_id: savedRecord.id,
        bank_name: bank.bankName,
        banker_name: bank.bankerName,
        banker_phone: bank.bankerPhone,
      })),
    );

    if (bankError) throw bankError;
  }

  if (activities.length) {
    const { error: activityError } = await supabase.from("case_activities").insert(
      activities.map((activity) => ({
        id: activity.id,
        case_id: savedRecord.id,
        type: activity.type,
        actor_role: activity.actorRole,
        actor_name: activity.actorName,
        message: activity.message,
        status: activity.status || null,
        created_at: activity.createdAt,
      })),
    );

    if (activityError) throw activityError;
  }

  return (await loadCases()).cases;
}

export async function removeCase(caseId: string): Promise<CaseRecord[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    const next = readDemoCases().filter((record) => record.id !== caseId);
    writeDemoCases(next);
    return next;
  }

  const { error } = await supabase
    .from("cases")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", caseId);

  if (error) throw error;

  return (await loadCases()).cases;
}

export async function uploadDocuments(
  caseId: string,
  documents: UploadDocumentInput[],
  actorRole: Role,
): Promise<CaseRecord[]> {
  if (!documents.length) return (await loadCases()).cases;

  const supabase = getSupabaseClient();

  if (!supabase) {
    const existing = readDemoCases();
    const next = existing.map((record) => {
      if (record.id !== caseId) return record;

      const uploadedDocs = documents.map(({ file, documentType }) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        documentType,
        uploadedBy: actorRole,
        uploadedAt: new Date().toISOString(),
      }));

      return {
        ...record,
        documents: [...record.documents, ...uploadedDocs],
        activities: [
          ...record.activities,
          createActivity(
            "document",
            actorRole,
            `Uploaded ${uploadedDocs.map((doc) => doc.name).join(", ")}.`,
          ),
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: actorRole,
      };
    });

    writeDemoCases(next);
    return next;
  }

  const uploaded: CaseDocument[] = [];

  for (const { file, documentType } of documents) {
    const storagePath = `${caseId}/${documentType}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("case-documents")
      .upload(storagePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage
      .from("case-documents")
      .getPublicUrl(storagePath);

    uploaded.push({
      id: crypto.randomUUID(),
      name: file.name,
      url: publicUrl.publicUrl,
      documentType,
      storagePath,
      uploadedBy: actorRole,
      uploadedAt: new Date().toISOString(),
    });
  }

  const { error: docError } = await supabase.from("case_documents").insert(
    uploaded.map((doc) => ({
      id: doc.id,
      case_id: caseId,
      file_name: doc.name,
      file_url: doc.url,
      document_type: doc.documentType,
      storage_path: doc.storagePath,
      uploaded_by_role: doc.uploadedBy,
      uploaded_at: doc.uploadedAt,
    })),
  );

  if (docError) throw docError;

  const activity = createActivity(
    "document",
    actorRole,
    `Uploaded ${uploaded
      .map((doc) => `${documentTypeLabels[doc.documentType]}: ${doc.name}`)
      .join(", ")}.`,
  );

  const { error: activityError } = await supabase.from("case_activities").insert({
    id: activity.id,
    case_id: caseId,
    type: activity.type,
    actor_role: activity.actorRole,
    actor_name: activity.actorName,
    message: activity.message,
    status: activity.status || null,
    created_at: activity.createdAt,
  });

  if (activityError) throw activityError;

  return (await loadCases()).cases;
}

export function usingSupabase() {
  return hasSupabaseConfig();
}
