"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocitySeries } from "@/lib/db/types";

const colors = ["#e0b15a", "#f07167", "#7eb6ff", "#3dbe8a"];

export function ViralityChart({ series }: { series: VelocitySeries[] }) {
  if (series.length === 0 || series.every((item) => item.points.length === 0)) {
    return <p className="text-sm text-muted">Belum ada jejak sebaran pada umpan demo.</p>;
  }
  const length = Math.max(...series.map((item) => item.points.length));
  const data = Array.from({ length }, (_, index) => {
    const row: Record<string, number> = { langkah: index + 1 };
    for (const item of series) {
      const point = item.points[index];
      if (point) row[item.id] = point.shares;
    }
    return row;
  });
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#24344d" strokeDasharray="3 3" />
          <XAxis dataKey="langkah" stroke="#93a4bd" fontSize={12} />
          <YAxis stroke="#93a4bd" fontSize={12} />
          <Tooltip contentStyle={{ background: "#10192b", border: "1px solid #24344d" }} />
          <Legend />
          {series.map((item, index) => (
            <Line
              key={item.id}
              type="monotone"
              dataKey={item.id}
              name={item.label}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
