export const dealerFields = {
  dealerName: "Nama syarikat / dealer", dealerRegistration: "No. pendaftaran", dealerAddress: "Alamat dealer",
  dealerPhone: "Telefon", dealerEmail: "Email", dealerFax: "Fax", salesAdvisorName: "Sales advisor",
  salesAdvisorNric: "SA NRIC", salesManagerName: "Sales manager", salesManagerNric: "Manager NRIC",
} as const;
export type DealerKey = keyof typeof dealerFields;
export type DealerDetails = Record<DealerKey, string>;
export type DealerProfile = { id: string; data: DealerDetails; version: number; active: boolean; updated_at: string };
export const emptyDealer = (): DealerDetails => Object.fromEntries(Object.keys(dealerFields).map(k => [k, ""])) as DealerDetails;
export function validateDealer(value: unknown): DealerDetails {
  if (!value || typeof value !== "object") throw new Error("Maklumat dealer tidak sah.");
  const out = emptyDealer();
  for (const key of Object.keys(dealerFields) as DealerKey[]) {
    const text = (value as Record<string, unknown>)[key];
    if (typeof text !== "string" || text.length > (key === "dealerAddress" ? 1000 : 200)) throw new Error("Maklumat dealer terlalu panjang atau tidak sah.");
    out[key] = text.trim();
  }
  if (!out.dealerName) throw new Error("Isi nama dealer.");
  return out;
}
