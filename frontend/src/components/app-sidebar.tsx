"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  MessageSquareWarning,
  ClipboardList,
  ToggleRight,
  LogOut,
  MoreHorizontal,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { UserFooter } from "@/components/shared/user-footer";
import { User } from "@/types/auth";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import Image from "next/image";

const items = [
  {
    title: "Dashboard",
    url: "/admin/dashboard",
    icon: LayoutGrid,
  },
  {
    title: "Reports & Feedback",
    url: "/admin/feedbacks",
    icon: MessageSquareWarning,
  },
  {
    title: "Content Management",
    url: "/admin/cms",
    icon: ClipboardList,
  },
  {
    title: "Feature Control",
    url: "/admin/features",
    icon: ToggleRight,
  },
];

import { useAuth } from "@/context/AuthContext";

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <Sidebar className="border-r border-teal-50/50 [&>[data-slot=sidebar-inner]]:bg-[#EAF7F6]">
      <SidebarHeader className="p-6 pb-2">
        <div className="flex flex-col items-center justify-center gap-1">
          <Image src="/logo.png" alt="Logo" width={100} height={100} />
          <span className="text-[10px] uppercase tracking-wider text-teal-600/70 font-semibold">
            Admin Console
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 pt-6">
        <SidebarMenu className="gap-2">
          {items.map((item) => {
            const isActive = pathname === item.url || (item.url !== "/" && pathname.startsWith(item.url));
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  render={
                    <Link href={item.url} className="flex items-center gap-3">
                      <item.icon className={cn("size-5", isActive ? "text-[#008080]" : "text-zinc-500")} />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  }
                  isActive={isActive}
                  className={cn(
                    "h-12 px-4 rounded-2xl transition-all duration-200",
                    isActive
                      ? "bg-[#BFEDED] text-[#008080] hover:bg-[#BFEDED] hover:text-[#008080]"
                      : "text-zinc-600 hover:bg-teal-50 hover:text-teal-700"
                  )}
                />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-teal-50/30">
        <UserFooter user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
