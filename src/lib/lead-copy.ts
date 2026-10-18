import type { LeadRecord } from "./types";
import { hideLeadPhoneInNote } from "../../supabase/functions/_shared/lead-contact.ts";

type CopyableLead = Pick<LeadRecord,
  "source" | "sourceNote" | "customerName" | "customerPhone" | "email" | "carBrand" | "carModel"
> & Partial<Pick<LeadRecord, "status" | "whatsappUsername">>;

const sourceTitles: Record<LeadRecord["source"], string> = {
  tiktok_ads: "Tiktok",
  meta_ads: "Meta",
  manual_upload: "Manual",
};

export function formatLeadCopy(lead: CopyableLead, phoneRevealed = true): string {
  const title = `*New Car Sales Inquiry From ${sourceTitles[lead.source]}*`;
  const contactVisible = lead.status === "new" || phoneRevealed;
  const sourceNote = hideLeadPhoneInNote(lead.sourceNote.trim(), contactVisible);
  const missingContact = [lead.customerName, contactVisible ? lead.customerPhone : "", lead.email]
    .map((value) => value.trim())
    .filter((value) => value && !sourceNote.toLowerCase().includes(value.toLowerCase()));
  const details = sourceNote
    ? [...missingContact, sourceNote]
    : [lead.customerName, contactVisible ? lead.customerPhone : "", lead.email, lead.carModel || lead.carBrand]
      .map((value) => value.trim()).filter(Boolean);
  if (lead.whatsappUsername && !details.join("\n").toLowerCase().includes(lead.whatsappUsername.toLowerCase())) details.push(`WhatsApp: @${lead.whatsappUsername}`);
  const body = details.join("\n");
  return `${title}\n\n${body}`.trimEnd();
}
