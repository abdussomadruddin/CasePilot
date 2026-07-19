import { getSupabaseClient } from "@/lib/supabase";
import { notifyCaseStatusChange } from "@/lib/notifications";
import { getValidAccessToken } from "@/lib/auth";
import {
  roleLabels,
  statusLabels,
  normalizeCaseStatus,
  type ActivityEvent,
  type BankDetail,
  type CaseDealer,
  type CaseDocument,
  type CaseRecord,
  type CaseStatus,
  type DatabaseCaseStatus,
  type DocumentType,
  type Profile,
  type Role,
  type UploadDocumentInput,
} from "@/lib/types";
import {
  createActivity,
  getNotificationRoles,
  nextFollowUpFrom,
} from "@/lib/workflow";

const documentRetentionMs = 60 * 24 * 60 * 60 * 1000;
const defaultUploadTimeoutMs = 5 * 60 * 1000;

type StoreResult = {
  source: "supabase";
  cases: CaseRecord[];
};

type UploadDocumentsOptions = {
  timeoutMs?: number;
  onProgress?: (progress: {
    phase: "uploading" | "uploaded" | "syncing";
    completed: number;
    total: number;
    fileName?: string;
  }) => void;
};

type CaseRow = {
  id: string;
  dealer: CaseDealer | null;
  customer_name: string;
  customer_phone: string;
  car_model: string;
  car_variant: string;
  car_color: string;
  status: DatabaseCaseStatus;
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
  expires_at: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
};

type ActivityRow = {
  id: string;
  case_id: string;
  type: ActivityEvent["type"];
  actor_role: Role;
  actor_name: string | null;
  message: string;
  status: DatabaseCaseStatus | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  phone: string | null;
  active: boolean | null;
};

function normalizeDealer(dealer?: string | null): CaseDealer {
  return dealer === "other_dealer" ? "other_dealer" : "kah_motor";
}

function mapCase(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    dealer: normalizeDealer(row.dealer),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    carModel: row.car_model,
    carVariant: row.car_variant,
    carColor: row.car_color,
    status: normalizeCaseStatus(row.status),
    remark: row.remark || "",
    banks: (row.case_banks || []).map(mapBank),
    documents: (row.case_documents || [])
      .filter((doc) => !doc.deleted_at)
      .map(mapDocument),
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
  const drivePath = parseGoogleDriveStoragePath(row.storage_path || "");

  return {
    id: row.id,
    name: row.file_name,
    url: row.file_url,
    documentType: row.document_type || "other",
    storagePath: row.storage_path || undefined,
    folderUrl: drivePath
      ? `https://drive.google.com/drive/folders/${drivePath.folderId}`
      : undefined,
    uploadedBy: row.uploaded_by_role,
    uploadedAt: row.uploaded_at,
    expiresAt: row.expires_at || undefined,
    deletedAt: row.deleted_at || undefined,
    deleteReason: row.delete_reason || undefined,
  };
}

function parseGoogleDriveStoragePath(storagePath: string) {
  const [provider, folderId, fileId] = storagePath.split(":");

  if (provider !== "google-drive" || !folderId || !fileId) return null;

  return { folderId, fileId };
}

function mapActivity(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    type: row.type,
    actorRole: row.actor_role,
    actorName: row.actor_name || roleLabels[row.actor_role],
    message: row.message,
    status: row.status ? normalizeCaseStatus(row.status) : undefined,
    createdAt: row.created_at,
  };
}

function sortOldestFirst(a: ActivityEvent, b: ActivityEvent) {
  return +new Date(a.createdAt) - +new Date(b.createdAt);
}

function toCaseRow(record: CaseRecord) {
  return {
    id: record.id,
    dealer: record.dealer || "kah_motor",
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

function normalizedBankList(banks: BankDetail[]) {
  return banks
    .map((bank) => ({
      id: bank.id,
      bankName: bank.bankName.trim(),
      bankerName: bank.bankerName.trim(),
      bankerPhone: bank.bankerPhone.trim(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function caseDetailsChanged(record: CaseRecord, previousRecord?: CaseRecord) {
  if (!previousRecord) return false;

  const comparableFields: Array<keyof CaseRecord> = [
    "dealer",
    "customerName",
    "customerPhone",
    "carModel",
    "carVariant",
    "carColor",
  ];
  const scalarChanged = comparableFields.some((field) => {
    const currentValue = String(record[field] || "").trim();
    const previousValue = String(previousRecord[field] || "").trim();

    return currentValue !== previousValue;
  });
  const banksChanged =
    JSON.stringify(normalizedBankList(record.banks)) !==
    JSON.stringify(normalizedBankList(previousRecord.banks));

  return scalarChanged || banksChanged;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email || "",
    fullName: row.full_name || row.email || roleLabels[row.role],
    role: row.role,
    phone: row.phone || undefined,
    active: row.active ?? true,
  };
}

export async function loadTeamMembers(includeInactive = false): Promise<Profile[]> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("profiles")
    .select("id,email,full_name,role,phone,active")
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) throw error;

  return ((data || []) as ProfileRow[]).map(mapProfile);
}

export async function loadCases(): Promise<StoreResult> {
  const supabase = getSupabaseClient();

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
  const detailsChanged = caseDetailsChanged(record, previousRecord);

  const activities: ActivityEvent[] = [];

  if (isNew) {
    activities.push(createActivity("case", actorRole, "Case created."));
  }

  if (statusChanged || isNew) {
    activities.push(
      createActivity(
        "status",
        actorRole,
        `Status changed to ${statusLabels[record.status]}.`,
        record.status,
      ),
    );
  }

  if (remarkChanged) {
    activities.push(createActivity("remark", actorRole, record.remark));
  }

  if (!isNew && detailsChanged) {
    activities.push(createActivity("case", actorRole, "Case details updated."));
  }

  const savedRecord: CaseRecord = {
    ...record,
    updatedBy: actorRole,
    updatedAt: now,
    createdAt: previousRecord?.createdAt || record.createdAt || now,
    nextFollowUpAt:
      record.status === "rejected" ||
      record.status === "car_delivery" ||
      record.status === "cancelled"
        ? ""
        : record.nextFollowUpAt || nextFollowUpFrom(),
    activities: [...record.activities, ...activities].sort(sortOldestFirst),
  };

  const supabase = getSupabaseClient();

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

  if (statusChanged || isNew) {
    const rolesToNotify = getNotificationRoles(savedRecord.status, savedRecord.dealer);
    const reason = isNew
      ? `New case created with status ${statusLabels[savedRecord.status]}.`
      : `Case status changed to ${statusLabels[savedRecord.status]}.`;
    const notificationSent = await notifyCaseStatusChange({
      caseId: savedRecord.id,
      status: savedRecord.status,
      roles: rolesToNotify,
      reason,
    });

    if (!notificationSent && rolesToNotify.length) {
      const { error: notificationError } = await supabase
        .from("case_notifications")
        .insert(
          rolesToNotify.map((role) => ({
            case_id: savedRecord.id,
            role,
            reason,
            status: savedRecord.status,
            due_at: now,
          })),
        );

      if (notificationError) {
        console.warn("Unable to create notification rows", notificationError.message);
      }
    }
  }

  return (await loadCases()).cases;
}

export async function removeCase(caseId: string): Promise<CaseRecord[]> {
  const accessToken = await getValidAccessToken();

  const driveResponse = await fetch("/api/google-drive/case-folder", {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ caseId }),
  });
  const responseText = await driveResponse.text();
  let driveResult: { error?: string } = {};

  if (responseText) {
    try {
      driveResult = JSON.parse(responseText) as { error?: string };
    } catch {
      driveResult = {};
    }
  }

  if (!driveResponse.ok) {
    throw new Error(
      driveResponse.status === 401
        ? "Session expired. Please sign in again."
        : driveResult.error || "Unable to delete case and Google Drive folder.",
    );
  }

  return (await loadCases()).cases;
}

async function uploadDocumentToGoogleDrive(
  record: CaseRecord,
  file: File,
  accessToken: string,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("caseId", record.id);
  formData.set("customerName", record.customerName);
  formData.set("carModel", record.carModel);
  formData.set("carVariant", record.carVariant);

  const response = await fetch("/api/google-drive/upload", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: formData,
    signal,
  });
  const result = (await response.json()) as {
    error?: string;
    fileId?: string;
    fileName?: string;
    fileUrl?: string;
    folderId?: string;
    folderUrl?: string;
  };

  if (!response.ok || !result.fileId || !result.fileUrl || !result.folderId) {
    throw new Error(result.error || "Unable to upload document to Google Drive.");
  }

  return {
    fileId: result.fileId,
    fileName: result.fileName || file.name,
    fileUrl: result.fileUrl,
    folderId: result.folderId,
    folderUrl:
      result.folderUrl ||
      `https://drive.google.com/drive/folders/${result.folderId}`,
  };
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

type DriveFolderFile = {
  id: string;
  name: string;
  fileUrl: string;
  createdTime?: string;
};

async function syncCaseDocumentsFromDrive(
  record: CaseRecord,
  actorRole: Role,
  accessToken: string,
) {
  const params = new URLSearchParams({ caseId: record.id });
  const response = await fetch(`/api/google-drive/case-folder?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const result = (await response.json()) as {
    error?: string;
    folder?: { id: string; webViewLink?: string } | null;
    files?: DriveFolderFile[];
  };

  if (!response.ok) {
    throw new Error(result.error || "Unable to sync Google Drive folder.");
  }

  if (!result.folder || !result.files?.length) return 0;

  const supabase = getSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("case_documents")
    .select("storage_path,file_url")
    .eq("case_id", record.id)
    .is("deleted_at", null);

  if (existingError) throw existingError;

  const existingKeys = new Set(
    (existing || []).flatMap((document) => [
      document.storage_path,
      document.file_url,
    ]),
  );
  const missingFiles = result.files.filter((file) => {
    const storagePath = `google-drive:${result.folder?.id}:${file.id}`;
    return !existingKeys.has(storagePath) && !existingKeys.has(file.fileUrl);
  });

  if (!missingFiles.length) return 0;

  const { error: insertError } = await supabase.from("case_documents").insert(
    missingFiles.map((file) => {
      const uploadedAt = file.createdTime || new Date().toISOString();

      return {
        id: crypto.randomUUID(),
        case_id: record.id,
        file_name: file.name,
        file_url: file.fileUrl,
        document_type: "other",
        storage_path: `google-drive:${result.folder?.id}:${file.id}`,
        uploaded_by_role: actorRole,
        uploaded_at: uploadedAt,
        expires_at: new Date(+new Date(uploadedAt) + documentRetentionMs).toISOString(),
      };
    }),
  );

  if (insertError) throw insertError;

  return missingFiles.length;
}

export async function uploadDocuments(
  record: CaseRecord,
  documents: UploadDocumentInput[],
  actorRole: Role,
  options: UploadDocumentsOptions = {},
): Promise<CaseRecord[]> {
  if (!documents.length) return (await loadCases()).cases;

  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Please sign in again before uploading documents.");
  }

  const uploaded: CaseDocument[] = [];
  const failed: string[] = [];
  const total = documents.length;
  const timeoutMs = options.timeoutMs || defaultUploadTimeoutMs;
  const startedAt = Date.now();
  let timedOut = false;

  for (const { file, documentType } of documents) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);

    if (remainingMs <= 0) {
      timedOut = true;
      failed.push("Upload timed out after 5 minutes.");
      break;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), remainingMs);

    try {
      options.onProgress?.({
        phase: "uploading",
        completed: uploaded.length,
        total,
        fileName: file.name,
      });
      const uploadedAt = new Date().toISOString();
      const driveFile = await uploadDocumentToGoogleDrive(
        record,
        file,
        session.access_token,
        controller.signal,
      );
      const document: CaseDocument = {
        id: crypto.randomUUID(),
        name: driveFile.fileName || file.name,
        url: driveFile.fileUrl,
        documentType,
        storagePath: `google-drive:${driveFile.folderId}:${driveFile.fileId}`,
        folderUrl: driveFile.folderUrl,
        uploadedBy: actorRole,
        uploadedAt,
        expiresAt: new Date(+new Date(uploadedAt) + documentRetentionMs).toISOString(),
      };

      const { error: docError } = await supabase.from("case_documents").insert({
        id: document.id,
        case_id: record.id,
        file_name: document.name,
        file_url: document.url,
        document_type: document.documentType,
        storage_path: document.storagePath,
        uploaded_by_role: document.uploadedBy,
        uploaded_at: document.uploadedAt,
        expires_at: document.expiresAt,
      });

      if (docError) throw docError;

      uploaded.push(document);
      options.onProgress?.({
        phase: "uploaded",
        completed: uploaded.length,
        total,
        fileName: document.name,
      });
    } catch (caught) {
      const message = isAbortError(caught)
        ? "Upload timed out after 5 minutes."
        : caught instanceof Error
          ? caught.message
          : "Upload failed.";
      if (isAbortError(caught)) timedOut = true;
      failed.push(`${file.name}: ${message}`);
      if (timedOut) break;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  let synced = 0;
  if (failed.length) {
    options.onProgress?.({
      phase: "syncing",
      completed: uploaded.length,
      total,
    });
    try {
      synced = await syncCaseDocumentsFromDrive(record, actorRole, session.access_token);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Sync failed.";
      failed.push(`Drive sync: ${message}`);
    }
  }

  if (!uploaded.length && !synced) {
    throw new Error(failed[0] || "Unable to upload documents.");
  }

  const activity = createActivity(
    "document",
    actorRole,
    [
      `Uploaded ${uploaded.map((doc) => doc.name).join(", ")}.`,
      synced ? `Synced ${synced} Google Drive file(s).` : "",
      failed.length ? `${failed.length} file(s) failed.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  const { error: activityError } = await supabase.from("case_activities").insert({
    id: activity.id,
    case_id: record.id,
    type: activity.type,
    actor_role: activity.actorRole,
    actor_name: activity.actorName,
    message: activity.message,
    status: activity.status || null,
    created_at: activity.createdAt,
  });

  if (activityError) {
    console.warn("Unable to create document upload activity", activityError.message);
  }

  if (failed.length) {
    console.warn("Some documents failed to upload", failed);
  }

  if (failed.length && uploaded.length + synced < documents.length) {
    throw new Error(
      `${uploaded.length + synced}/${documents.length} file(s) uploaded. ${failed.join(
        " ",
      )} Please submit the missing file(s) again.`,
    );
  }

  return (await loadCases()).cases;
}
