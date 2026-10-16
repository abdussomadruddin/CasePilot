import { emptyVsoData, type VsoData } from "./honda-vso.mjs";

// Values transcribed from the customer-supplied sample PDF.
export function exampleVsoData(): VsoData {
  return {
    ...emptyVsoData(),
    bookingDate: "2026-01-08",
    customerName: "AZIZAN BIN ISMAIL @ ARIFFIN",
    nric: "770510-02-6149",
    mobilePhone: "012-3456789",
    address: "LORONG ROS, SG TENGI KANAN\n145500 TANJONG KARANG, SELANGOR",
    model: "HONDA HR-V",
    salesType: "NON-PANEL HIRE PURCHASE",
    variant: "1.5L S- SPECIAL COLORS",
    colour: "METEOROID GRAY METALLIC",
    estimatedDelivery: "2026",
    sellingPrice: "115560",
    discount: "0",
    numberPlate: "50",
    roadTax: "120",
    registrationFee: "150",
    ownershipFee: "50",
    accessories: "2000",
    miscSales: "0",
    insurance: "4100",
    ncd: "0",
    totalAmount: "122000",
    bookingFeePaid: "0",
    totalOutstanding: "109300",
    salesAdvisorName: "MUIZZUDDIN NAZMI BIN BAKRI",
    salesAdvisorNric: "990217027833",
    salesManagerName: "NAVINDER KAUR A/P",
    salesManagerNric: "710501086970",
  };
}
