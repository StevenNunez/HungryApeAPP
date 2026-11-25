'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { formatCLP } from '@/lib/utils';

/**
 * Report charts. recharts is heavy (~100 kB): this file is loaded with next/dynamic
 * only when the "Reportes" tab is shown, so the inventory loads light.
 */

import { CHART_COLORS as COLORS } from './parts';

export function SalesByDayChart({ data }: { data: { name: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(val) => `$${val / 1000}k`} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <RechartsTooltip
          cursor={{ fill: 'rgba(200,200,200,0.1)' }}
          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
          formatter={(value: any) => [formatCLP(value), 'Ventas']}
        />
        <Bar dataKey="total" fill="#be1e36" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PayMethodsChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" nameKey="name">
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

