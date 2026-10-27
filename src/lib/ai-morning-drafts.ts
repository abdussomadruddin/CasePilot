// Daily drafts use Malaysia calendar dates; reminder eligibility remains 24 hours.
export function morningDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
export function morningCutoff(day = morningDay()) { return new Date(`${day}T09:30:00+08:00`); }
export function morningExpiry(day = morningDay()) { return new Date(`${day}T23:59:59.999+08:00`).toISOString(); }
export function morningEligible(lead: {status:string;follow_up_count:number;follow_up_activity_at:string|null;owner_id:string;deleted_at?:string|null}, userId:string, day = morningDay()) {
  return lead.owner_id===userId && !lead.deleted_at && lead.status==="contacted" && lead.follow_up_count<4 && Boolean(lead.follow_up_activity_at) && Date.parse(lead.follow_up_activity_at!)<=morningCutoff(day).getTime()-86400000;
}
export function morningWindow(now = new Date()) {
  const malaysia = new Date(now.getTime()+8*3600000);
  const minute = malaysia.getUTCHours()*60+malaysia.getUTCMinutes();
  return minute>=510 && minute<720;
}
export function draftPurpose(userId:string,id:string) { return `ai-morning-draft:${userId}:${id}`; }
