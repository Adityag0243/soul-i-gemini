"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { DistributionPoint } from "@/types/dashboard";

interface PracticeDistributionChartProps {
  data: DistributionPoint[];
}

export function PracticeDistributionChart({ data }: PracticeDistributionChartProps) {
  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm h-[400px] flex flex-col">
      <div className="mb-2">
        <h3 className="text-xl font-bold text-zinc-900 leading-tight">Practice Type Distribution</h3>
      </div>
      <div className="flex-1 w-full min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            />
            <Legend 
              verticalAlign="middle" 
              align="right" 
              layout="vertical"
              iconType="circle"
              formatter={(value) => <span className="text-zinc-600 font-bold text-sm ml-2">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
