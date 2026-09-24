export type LeadVehicle = { brand: string; model: string };

export const leadVehicleModels: LeadVehicle[] = Object.entries({
  Proton: ["Proton S70", "Proton NEW S70 1.5 i-GT", "Proton Saga", "Proton Persona", "Proton Iriz", "Proton X50", "Proton X70", "Proton X90", "Proton e.MAS 5", "Proton e.MAS 7"],
  JAECOO: ["JAECOO J5", "JAECOO J5 EV", "JAECOO J7", "JAECOO J7 PHEV", "JAECOO J8"],
  JETOUR: ["JETOUR Dashing", "JETOUR VT9", "JETOUR T1", "JETOUR T2", "JETOUR T2 i-DM"],
  Chery: ["Chery TIGGO Cross", "Chery O5", "Chery OMODA E5", "Chery TIGGO 7 Pro", "Chery TIGGO 7 PHEV", "Chery TIGGO 8", "Chery TIGGO 8 PHEV", "Chery TIGGO 9"],
  Honda: ["Honda City", "Honda City Hatchback", "Honda WR-V", "Honda HR-V", "Honda Civic", "Honda CR-V", "Honda e:N1", "Honda Civic Type R", "Honda Prelude"],
}).flatMap(([brand, models]) => models.map((model) => ({ brand, model })));

function contains(haystack: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(haystack);
}

export function extractLeadVehicle(note: string, supplied: Partial<LeadVehicle> = {}): LeadVehicle {
  const brands = [...new Set(leadVehicleModels.map((item) => item.brand))];
  const directBrand = brands.find((brand) => brand.toLowerCase() === (supplied.brand || "").trim().toLowerCase()) || "";
  const directModel = (supplied.model || "").trim();
  const findModel = (text: string) => leadVehicleModels.flatMap((item) => {
    const aliases = [item.model, item.model.slice(item.brand.length).trim()];
    if (item.model === "Proton NEW S70 1.5 i-GT") aliases.push("Proton NEW S70", "NEW S70");
    return aliases.filter((alias) => contains(text, alias)).map((alias) => ({ ...item, length: alias.length }));
  }).sort((a, b) => b.length - a.length)[0];
  const match = (directModel && findModel(directModel)) || findModel(note);
  if (match) return { brand: match.brand, model: match.model };
  const noteBrand = brands.find((brand) => contains(note, brand)) || "";
  return { brand: directBrand || noteBrand, model: directModel };
}
