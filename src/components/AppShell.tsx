import { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Store,
  CalendarDays,
  ListChecks,
  Settings,
  AlertTriangle,
  LogOut,
  UtensilsCrossed,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import mediterraneanBg from "@/assets/mediterranean-bg.png.asset.json";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  end?: boolean;
}

const adminNav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/restaurants", label: "Restaurantes", icon: Store },
];

const restaurantNav: NavItem[] = [
  { to: "/restaurant", label: "Hoy", icon: Sun, end: true },
  { to: "/restaurant/reservations", label: "Reservas", icon: ListChecks },
  { to: "/restaurant/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/restaurant/settings", label: "Configuración", icon: Settings },
];

export function AppShell({
  variant,
  title,
  children,
}: {
  variant: "admin" | "restaurant";
  title?: string;
  children: ReactNode;
}) {
  const items = variant === "admin" ? adminNav : restaurantNav;
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isItemActive = (it: NavItem) => {
    if (it.end) return location.pathname === it.to;
    return location.pathname.startsWith(it.to);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="rounded-lg bg-primary text-primary-foreground p-1.5">
                <UtensilsCrossed className="h-4 w-4" />
              </div>
              <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold">Reservas Pro</span>
                <span className="text-[11px] text-muted-foreground">
                  {variant === "admin" ? "Platform Admin" : "Panel restaurante"}
                </span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((it) => (
                    <SidebarMenuItem key={it.to}>
                      <SidebarMenuButton asChild isActive={isItemActive(it)} tooltip={it.label}>
                        <NavLink
                          to={it.to}
                          end={it.end}
                          className={({ isActive }) =>
                            `flex items-center gap-2 ${
                              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""
                            }`
                          }
                        >
                          <it.icon className="h-4 w-4" />
                          <span>{it.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between gap-3 border-b bg-card px-3 sm:px-5">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <h1 className="text-base font-semibold truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium">{profile?.full_name || profile?.email}</span>
                <span className="text-[11px] text-muted-foreground">
                  {profile?.role === "platform_admin" ? "Platform Admin" : "Restaurant Admin"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate("/auth");
                }}
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Salir
              </Button>
            </div>
          </header>
          <main className="relative flex-1 overflow-x-auto">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.25]"
              style={{ backgroundImage: `url(${mediterraneanBg.url})` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/50 via-background/40 to-background/60"
            />
            <div className="relative p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}