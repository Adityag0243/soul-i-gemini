"use client";

import React, { useEffect, useState } from "react";
import { Loader2, MessageSquare, Users, Clock, CheckCircle, TrendingUp, MoreHorizontal } from "lucide-react";
import { DashboardOverview } from "@/types/dashboard";
import { dashboardService } from "@/services/dashboard-service";
import { DashboardStatCard } from "@/components/dashboard/stat-card";
import { UserActivityChart } from "@/components/dashboard/user-activity-chart";
import { PracticeDistributionChart } from "@/components/dashboard/practice-distribution-chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await dashboardService.getOverview();
        setData(result);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-10 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-20 animate-in fade-in duration-700">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-zinc-900 leading-tight">Dashboard</h1>
        <p className="text-zinc-500 font-medium tracking-tight">Overview of platform analytics and user engagement</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <DashboardStatCard
          label="Total Users"
          value={data.mainStats.totalUsers.value}
          trend={data.mainStats.totalUsers.trend}
          trendLabel={data.mainStats.totalUsers.trendLabel}
        />
        <DashboardStatCard
          label="Active Sessions"
          value={data.mainStats.activeSessions.value}
          trend={data.mainStats.activeSessions.trend}
          trendLabel={data.mainStats.activeSessions.trendLabel}
        />
        <DashboardStatCard
          label="Completion Rate"
          value={data.mainStats.completionRate.value}
          trend={data.mainStats.completionRate.trend}
          trendLabel={data.mainStats.completionRate.trendLabel}
        />
        <DashboardStatCard
          label="Avg. Session Time"
          value={data.mainStats.avgSessionTime.value}
          trend={data.mainStats.avgSessionTime.trend}
          trendLabel={data.mainStats.avgSessionTime.trendLabel}
        />
      </div>

      {/* Primary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <UserActivityChart data={data.charts.userActivity} />
        <PracticeDistributionChart data={data.charts.practiceDistribution} />
      </div>

      {/* Secondary Charts & Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Practice Completion Rates (Bar Chart) */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm h-[450px] flex flex-col">
          <h3 className="text-xl font-bold text-zinc-900 mb-8">Practice Completion Rates</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.completionRates} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="practice"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 500 }}
                  interval={0}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 500 }}
                />
                <Tooltip
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="rate" radius={[8, 8, 0, 0]} barSize={40}>
                  {data.charts.completionRates.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#009688" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm flex flex-col h-[450px]">
          <h3 className="text-xl font-bold text-zinc-900 mb-6">Recent Activity</h3>
          <div className="space-y-4 overflow-y-auto no-scrollbar flex-1">
            {data.activities.map((activity) => (
              <div key={activity.id} className="p-4 rounded-2xl bg-gray-50/50 hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 group">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "size-2 rounded-full mt-2 shrink-0",
                    activity.type === 'success' ? "bg-emerald-500" :
                      activity.type === 'warning' ? "bg-rose-500" : "bg-blue-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-extrabold text-zinc-900 leading-tight mb-1">{activity.userName}</p>
                    <p className="text-[12px] font-medium text-zinc-500 leading-tight mb-2">{activity.action}</p>
                    <p className="text-[11px] font-bold text-zinc-400">{activity.timestamp}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chatbot Analytics Header */}
      <div className="mb-6 mt-16">
        <h2 className="text-2xl font-extrabold text-zinc-900 mb-2">Chatbot Analytics</h2>
      </div>

      {/* Chatbot Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <DashboardStatCard
          label="Total Conversations"
          value={data.chatbot.stats.totalConversations.value}
          trend={data.chatbot.stats.totalConversations.trend}
          className="border-teal-100 bg-teal-50/10"
        />
        <DashboardStatCard
          label="Avg. Response Time"
          value={data.chatbot.stats.avgResponseTime.value}
          trend={data.chatbot.stats.avgResponseTime.trend}
          className="border-teal-100 bg-teal-50/10"
        />
        <DashboardStatCard
          label="User Satisfaction"
          value={data.chatbot.stats.userSatisfaction.value}
          trend={data.chatbot.stats.userSatisfaction.trend}
          className="border-teal-100 bg-teal-50/10"
        />
        <DashboardStatCard
          label="Resolution Rate"
          value={data.chatbot.stats.resolutionRate.value}
          trend={data.chatbot.stats.resolutionRate.trend}
          className="border-teal-100 bg-teal-50/10"
        />
      </div>

      {/* Chatbot Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* Top Conversation Topics */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
          <h3 className="text-xl font-bold text-zinc-900 mb-8">Top Conversation Topics</h3>
          <div className="space-y-6">
            {data.chatbot.topTopics.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-bold text-zinc-800">{item.topic}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-zinc-400">{item.count}</span>
                    <span className="text-xs font-extrabold text-[#009688]">{item.percentage}%</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#009688] rounded-full transition-all duration-1000"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Sessions */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
          <h3 className="text-xl font-bold text-zinc-900 mb-8">Live Sessions</h3>
          <div className="space-y-4">
            {data.chatbot.liveSessions.map((session) => (
              <div key={session.id} className="p-4 rounded-2xl bg-cyan-50/30 border border-cyan-100 flex items-center justify-between group hover:bg-cyan-50/50 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-extrabold text-zinc-900 truncate mb-0.5">{session.user}</p>
                    <p className="text-[11px] font-medium text-zinc-500 truncate">{session.practice}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-zinc-400">{session.duration}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User Journey Funnel */}
      <div className="mb-12">
        <h2 className="text-2xl font-extrabold text-zinc-900 mb-8">User Journey Funnel</h2>
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-sm">
          <div className="space-y-12">
            {data.funnel.map((step, index) => (
              <div key={index} className="relative flex items-center">
                {/* Connector Line */}
                {index < data.funnel.length - 1 && (
                  <div className="absolute left-[19px] top-[48px] w-px h-[48px] bg-gray-100" />
                )}

                <div className="flex items-center gap-6 w-full">
                  <div className={cn(
                    "size-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg shrink-0",
                    (index + 1) === 1 ? "bg-teal-500" :
                      (index + 1) === 2 ? "bg-violet-400" :
                        (index + 1) === 3 ? "bg-emerald-400" : "bg-orange-400"
                  )}>
                    {index + 1}
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <h4 className="text-base font-extrabold text-zinc-900 leading-none mb-1">{step.step}</h4>
                        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          {step.users} users
                          {step.dropoff !== null && <span className="text-rose-500 ml-2">[{step.dropoff}% drop-off]</span>}
                        </p>
                      </div>
                      <span className={cn(
                        "text-xl font-black",
                        (index + 1) === 1 ? "text-teal-500" :
                          (index + 1) === 2 ? "text-violet-400" :
                            (index + 1) === 3 ? "text-emerald-400" : "text-orange-400"
                      )}>
                        {step.percentage}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm flex items-center justify-between">
          <span className="text-zinc-500 font-bold text-sm">Positive Feedback</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-emerald-500">{data.footerStats.positiveFeedback}%</span>
            <TrendingUp className="size-6 text-emerald-500" />
          </div>
        </div>
        <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm flex items-center justify-between">
          <span className="text-zinc-500 font-bold text-sm">Active Features</span>
          <span className="text-2xl font-black text-teal-600">{data.footerStats.activeFeatures}</span>
        </div>
        <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm flex items-center justify-between">
          <span className="text-zinc-500 font-bold text-sm">Total Content</span>
          <span className="text-2xl font-black text-zinc-900">{data.footerStats.totalContent}</span>
        </div>
      </div>
    </div>
  );
}
