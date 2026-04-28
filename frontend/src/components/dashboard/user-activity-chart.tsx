"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ActivityPoint } from "@/types/dashboard";

interface UserActivityChartProps {
  data: ActivityPoint[];
}

export function UserActivityChart({ data }: UserActivityChartProps) {
  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm h-[400px] flex flex-col">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-zinc-900 leading-tight">User Activity (Last 7 Days)</h3>
      </div>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis 
              dataKey="label" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 500 }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 500 }}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            />
            <Legend 
              verticalAlign="bottom" 
              align="center" 
              iconType="circle"
              wrapperStyle={{ paddingTop: '20px' }}
            />
            <Line 
              type="monotone" 
              dataKey="users" 
              stroke="#009688" 
              strokeWidth={3} 
              dot={{ r: 4, fill: '#009688', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              name="Users"
            />
            <Line 
              type="monotone" 
              dataKey="sessions" 
              stroke="#A78BFA" 
              strokeWidth={3} 
              dot={{ r: 4, fill: '#A78BFA', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              name="Sessions"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
