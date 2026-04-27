import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider style={{ "--sidebar": "#EAF7F6" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="bg-white">
        <div className="p-8 pb-16">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
