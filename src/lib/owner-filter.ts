import type { Profile } from "./types";

export type OwnerFilter = "all" | "role:customer_service" | "role:broker" | `user:${string}`;

export function matchesOwnerFilter(
  record: { ownerId: string; ownerRole?: "customer_service" | "broker" },
  filter: OwnerFilter,
  members: Pick<Profile, "id" | "role">[],
) {
  if (filter === "all") return true;
  if (filter.startsWith("user:")) return record.ownerId === filter.slice(5);
  const role = members.find((member) => member.id === record.ownerId)?.role || record.ownerRole;
  return role === filter.slice(5);
}
