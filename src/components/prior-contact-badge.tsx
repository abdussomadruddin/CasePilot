import type { LeadRecord } from "@/lib/types";

export function PriorContactBadge({ lead }: { lead: LeadRecord }) {
  return lead.hasBeenContacted ? <span className="inline-flex w-fit rounded border border-amber-600/50 bg-amber-950/40 px-2 py-0.5 text-xs text-amber-200">Pernah Contact</span> : null;
}
