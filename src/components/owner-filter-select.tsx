"use client";

import { useMemo } from "react";
import type { OwnerFilter } from "@/lib/owner-filter";
import { roleLabels, type Profile } from "@/lib/types";

export function OwnerFilterSelect({ value, onChange, members, records, className = "" }: {
  value: OwnerFilter;
  onChange: (value: OwnerFilter) => void;
  members: Profile[];
  records: { ownerId: string }[];
  className?: string;
}) {
  const ownerIds = useMemo(() => new Set(records.map((record) => record.ownerId)), [records]);
  const owners = useMemo(() => members
    .filter((member) => ["customer_service", "broker"].includes(member.role) && (member.active || ownerIds.has(member.id) || value === `user:${member.id}`))
    .sort((left, right) => left.fullName.localeCompare(right.fullName)), [members, ownerIds, value]);

  return <select className={`field min-w-0 ${className}`} value={value} onChange={(event) => onChange(event.target.value as OwnerFilter)} aria-label="Filter by CS or Broker">
    <option value="all">All CS / Broker</option>
    <option value="role:customer_service">All Customer Service</option>
    <option value="role:broker">All Brokers</option>
    {(["customer_service", "broker"] as const).map((role) => <optgroup key={role} label={roleLabels[role]}>
      {owners.filter((owner) => owner.role === role).map((owner) => <option key={owner.id} value={`user:${owner.id}`}>{owner.fullName}</option>)}
    </optgroup>)}
  </select>;
}
