"use client";

import { ArrowRight, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { buildFunnel, funnelPeriods, type FunnelPeriod, type FunnelRole } from "@/lib/funnel";
import type { CaseRecord, LeadRecord } from "@/lib/types";

type Stage = "leads" | "cases" | "delivered" | "direct";

export function FunnelChart({ role, leads, cases, nowMs, onOpenStage }: {
  role: FunnelRole;
  leads: LeadRecord[];
  cases: CaseRecord[];
  nowMs: number;
  onOpenStage: (stage: Stage, ids: string[], label: string) => void;
}) {
  const [period, setPeriod] = useState<FunnelPeriod>("30d");
  const funnel = useMemo(() => buildFunnel(role, leads, cases, period, nowMs), [role, leads, cases, period, nowMs]);
  const stages = role === "admin"
    ? [
        { id: "leads" as const, label: "Leads", ids: funnel.leadIds, tone: "bg-amber-400" },
        { id: "cases" as const, label: "Cases", ids: funnel.caseIds, tone: "bg-cyan-400" },
        { id: "delivered" as const, label: "Delivered", ids: funnel.deliveredIds, tone: "bg-emerald-400" },
      ]
    : [
        { id: "cases" as const, label: "Cases", ids: funnel.caseIds, tone: "bg-cyan-400" },
        { id: "delivered" as const, label: "Delivered", ids: funnel.deliveredIds, tone: "bg-emerald-400" },
      ];
  const maximum = Math.max(...stages.map((stage) => stage.ids.length));

  return <section className="min-w-0 border-t border-zinc-800 pt-5" aria-label="Conversion funnel">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-cyan-300" aria-hidden="true" /><h2 className="text-lg font-semibold text-white">Conversion funnel</h2></div><p className="mt-1 text-xs text-zinc-400">Cohort started in selected period · Kuala Lumpur time</p></div>
      <div className="flex max-w-full flex-wrap gap-1" role="group" aria-label="Funnel period">
        {funnelPeriods.map((option) => <button key={option.id} type="button" aria-pressed={period === option.id} onClick={() => setPeriod(option.id)} className={`min-h-9 rounded-md border px-2.5 text-xs font-semibold transition-colors ${period === option.id ? "border-red-500 bg-red-600 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"}`}>{option.label}</button>)}
      </div>
    </div>
    <div className="mt-5 grid gap-4">
      {stages.map((stage) => <button key={stage.id} type="button" className="group min-w-0 text-left" onClick={() => onOpenStage(stage.id, stage.ids, `${stage.label} · ${funnelPeriods.find((item) => item.id === period)?.label}`)} aria-label={`Open ${stage.ids.length} ${stage.label.toLowerCase()} in this cohort`}>
        <div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="text-sm font-medium text-zinc-200 group-hover:text-white">{stage.label}</span><span className="flex items-center gap-1 text-xl font-bold tabular-nums text-white">{stage.ids.length}<ArrowRight className="h-4 w-4 text-zinc-500 group-hover:text-white" aria-hidden="true" /></span></div>
        <div className="h-5 overflow-hidden rounded-sm bg-zinc-800" role="img" aria-label={`${stage.label}: ${stage.ids.length} of ${maximum}`}><div className={`h-full rounded-sm transition-[width] duration-300 ${stage.tone}`} style={{ width: maximum ? `${stage.ids.length / maximum * 100}%` : "0%" }} /></div>
      </button>)}
    </div>
    <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-3">
      {role === "admin" ? <><p><span className="block text-zinc-400">Lead → Linked Case</span><strong className="text-base text-white">{funnel.leadToCase}</strong></p><p><span className="block text-zinc-400">Lead → Linked Delivery</span><strong className="text-base text-white">{funnel.leadToDelivered}</strong></p></> : null}
      <p><span className="block text-zinc-400">Case → Delivered</span><strong className="text-base text-white">{funnel.caseToDelivered}</strong></p>
      {role === "admin" ? <p><span className="block text-zinc-400">Leads without case</span><strong className="text-base text-white">{funnel.notConverted}</strong></p> : null}
      <p><span className="block text-zinc-400">Cases not delivered</span><strong className="text-base text-white">{funnel.notDelivered}</strong></p>
      {role === "admin" ? <button type="button" className="text-left" onClick={() => onOpenStage("direct", funnel.directCaseIds, `Cases Created Directly · ${funnelPeriods.find((item) => item.id === period)?.label}`)}><span className="block text-zinc-400">Cases Created Directly (included)</span><strong className="inline-flex items-center gap-1 text-base text-white">{funnel.directCaseIds.length}<ArrowRight className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" /></strong></button> : null}
    </div>
  </section>;
}
