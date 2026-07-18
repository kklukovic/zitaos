import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, FolderKanban, BookOpen, Bookmark, Settings, Plus, LogOut, Sparkles, Coins, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AuthedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/saved-ideas", label: "Saved Ideas", icon: Bookmark },
  { to: "/library", label: "Growth Library", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("credits, full_name, founder_tier").single();
      return data;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const displayName = profile?.full_name || email.split("@")[0] || "Founder";
  const initials = displayName.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "Z";
  const tierLabel = profile?.founder_tier === "founder_97" ? "Founder Pro" : "Founder Tier";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/95 backdrop-blur md:flex">
        {/* Brand */}
        <Link to="/dashboard" className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="brand-mark">Z</div>
          <div className="leading-none">
            <div className="text-[1.05rem] font-bold tracking-tight text-sidebar-foreground">
              ZITA <span className="text-gradient-electric">OS</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
              Zero Idea → App
            </div>
          </div>
        </Link>

        {/* CTA */}
        <div className="px-4">
          <Button asChild className="h-11 w-full justify-center gap-2 rounded-xl bg-gradient-electric text-primary-foreground shadow-glow hover:opacity-95">
            <Link to="/projects/new"><Plus className="h-4 w-4" />New Project</Link>
          </Button>
        </div>

        {/* Nav */}
        <nav className="mt-7 flex-1 space-y-1.5 px-3">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">
            Workspace
          </div>
          {nav.map((n) => {
            const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            return (
              <Link key={n.to} to={n.to} className={cn("nav-item", active && "nav-item-active")}>
                <n.icon className={cn("nav-icon h-[18px] w-[18px]", !active && "text-sidebar-foreground/55")} />
                <span className="flex-1">{n.label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_theme(colors.primary.DEFAULT)]" />}
              </Link>
            );
          })}
        </nav>

        {/* Co-Pilot hint */}
        <div className="px-4">
          <div className="copilot-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI Co-Pilot
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-sidebar-foreground/65">
              ZITA is ready to help you find and validate your next app idea.
            </p>
          </div>
        </div>

        {/* Credits */}
        <div className="mt-3 px-4">
          <div className="flex items-center justify-between rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Coins className="h-4 w-4 text-primary" />
              <span className="font-mono text-base font-bold text-sidebar-foreground">{profile?.credits ?? "—"}</span>
              <span className="text-sidebar-foreground/55">credits</span>
            </div>
            <span className="scene-chip !py-0.5 !px-2 !text-[9px] !tracking-[0.14em]">Live</span>
          </div>
        </div>

        {/* User */}
        <div className="mt-4 border-t border-sidebar-border/60 p-4">
          <div className="user-pill">
            <div className="avatar-ring grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">{displayName}</div>
              <div className="truncate text-[10.5px] font-medium uppercase tracking-wider text-primary/80">{tierLabel}</div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
          </div>
          <button onClick={signOut} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[11px] text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <LogOut className="h-3 w-3" />Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="brand-mark h-8 w-8 text-sm">Z</div>
            <span className="font-bold">ZITA OS</span>
          </Link>
          <div className="flex items-center gap-1 text-xs"><Coins className="h-3 w-3 text-primary" /><span className="font-mono">{profile?.credits ?? "—"}</span></div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
