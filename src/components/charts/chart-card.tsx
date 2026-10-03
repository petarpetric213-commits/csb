"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/patterns";

const PALETTE = [
  "hsl(221 72% 45%)",
  "hsl(152 64% 35%)",
  "hsl(35 92% 40%)",
  "hsl(205 80% 42%)",
  "hsl(0 68% 48%)",
  "hsl(270 55% 50%)",
  "hsl(180 60% 35%)",
];

const axisStyle = { fontSize: 10.5, fill: "hsl(224 10% 44%)" } as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />
          {p.name}: <span className="font-medium text-foreground">{typeof p.value === "number" ? p.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  height = 240,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
  actions?: React.ReactNode;
}) {
  return (
    <Card title={title} actions={actions} noPadding>
      <div style={{ height }} className="px-2 py-3">
        {children}
      </div>
    </Card>
  );
}

export type SeriesDef = { key: string; label: string; color?: string };

export function LineChartCard({
  title,
  data,
  series,
  xKey = "name",
  height,
  currency,
}: {
  title: string;
  data: any[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  currency?: string;
}) {
  return (
    <ChartCard title={title} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 87%)" strokeOpacity={0.6} />
          <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (currency ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function BarChartCard({
  title,
  data,
  series,
  xKey = "name",
  height,
  stacked,
}: {
  title: string;
  data: any[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  stacked?: boolean;
}) {
  return (
    <ChartCard title={title} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 87%)" strokeOpacity={0.6} />
          <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(220 14% 90%)", opacity: 0.4 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              fill={s.color ?? PALETTE[i % PALETTE.length]}
              radius={[3, 3, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AreaChartCard({
  title,
  data,
  series,
  xKey = "name",
  height,
}: {
  title: string;
  data: any[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
}) {
  return (
    <ChartCard title={title} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color ?? PALETTE[i % PALETTE.length]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color ?? PALETTE[i % PALETTE.length]} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 87%)" strokeOpacity={0.6} />
          <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DonutChartCard({ title, data, height }: { title: string; data: { name: string; value: number }[]; height?: number }) {
  return (
    <ChartCard title={title} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
