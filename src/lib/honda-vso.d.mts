export type VsoField = "dealerId" | "dealerVersion" | "dealerSnapshot" | "dealerName" | "dealerRegistration" | "dealerAddress" | "dealerPhone" | "dealerEmail" | "dealerFax" | "bookingDate" | "customerName" | "nric" | "mobilePhone" | "homePhone" | "officePhone" | "address" | "model" | "salesType" | "variant" | "colour" | "estimatedDelivery" | "referenceDealer" | "chassisNo" | "engineNo" | "sellingPrice" | "discount" | "numberPlate" | "roadTax" | "registrationFee" | "ownershipFee" | "accessories" | "miscSales" | "insurance" | "ncd" | "totalAmount" | "bookingFeePaid" | "totalOutstanding" | "paymentRef" | "salesAdvisorName" | "salesAdvisorNric" | "salesManagerName" | "salesManagerNric";
export type VsoData = Record<VsoField, string> & { clearCustomerSignature: boolean };
export const vsoFields: VsoField[];
export function emptyVsoData(): VsoData;
export function resolvePricing(data: VsoData): { subtotal: number | null; total: number | null; bookingFeePaid: number; outstanding: number | null };
export function buildFileName(data: VsoData): string;
export function buildVsoPdf(template: Uint8Array, data: VsoData): Promise<Uint8Array>;
