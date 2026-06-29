import type { CaseRecord } from "@/lib/types";
import { nextFollowUpFrom } from "@/lib/workflow";

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
