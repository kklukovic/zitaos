import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ArrowRight, Sparkles, Target, Zap, FileCode, Rocket, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CREDIT_COSTS, PROJECT_TOTAL_CREDITS } from "@/lib/credit-costs";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const statusMeta: Record<string, { label: string; icon: any; tone: string }> = {
  profile: { label: "Profile", icon: Target, tone: "text-muted-foreground" },
  discover: { label: "Discovering", icon: Sparkles, tone: "text-primary" },
  score: { label: "Scoring", icon: Zap, tone: "text-primary" },
  blueprint: { label: "Blueprint", icon: FileCode, tone: "text-primary" },
  launch: { label: "Launch", icon: Rocket, tone: "text-warning" },
  completed: { label: "Completed", icon: CheckCircle2, tone: "text-success" },
};

const COST_HINT = `Discover ${CREDIT_COSTS.discover} · Score ${CREDIT_COSTS.score} · Blueprint ${CREDIT_COSTS.blueprint} · Launch ${CREDIT_COSTS.launch}`;

function Dashboard() {
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").single()).data,
  });
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("id,name,status,updated_at").order("updated_at", { ascending: false }).limit(6)).data ?? [],
  });

  const refreshProjects = () => qc.invalidateQueries({ queryKey: ["projects"] });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="scene-chip mb-3"><Sparkles className="h-3 w-3" /> Welcome back</div>
          <h1 className="step-title">
            Hi, <span className="text-gradient-heading">{profile?.full_name?.split(" ")[0] || "founder"}</span>.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Let ZITA help you find and ship your next app idea.</p>
        </div>
        <Button asChild size="lg" className="h-12 rounded-xl bg-gradient-electric px-5 text-primary-foreground shadow-glow hover:opacity-95">
          <Link to="/projects/new"><Plus className="h-4 w-4" />Start new project</Link>
        </Button>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <StatCard label="Credits" value={String(profile?.credits ?? 0)} hint={`Founder tier — ${profile?.founder_tier ?? "founder_47"}`} />
        <StatCard label="Projects" value={String(projects?.length ?? 0)} hint="Recent activity" />
        <StatCard label="Cost per project" value={`~${PROJECT_TOTAL_CREDITS} cr`} hint={COST_HINT} />
      </div>

      <div className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Recent projects</h2>
          <Link to="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {projects && projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const m = statusMeta[p.status] ?? statusMeta.profile;
              return (
                <div key={p.id} className="card-premium group relative p-6 transition-transform hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <InlineProjectName project={p} onRenamed={refreshProjects} />
                      <div className="mt-1.5 text-xs text-muted-foreground">Updated {new Date(p.updated_at).toLocaleDateString()}</div>
                    </div>
                    <div className={cn("relative z-10 flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium", m.tone)}>
                      <m.icon className="h-3 w-3" />{m.label}
                    </div>
                  </div>
                  <Link
                    to="/project/$id"
                    params={{ id: p.id }}
                    className="absolute inset-0 rounded-[1.25rem]"
                    aria-label={`Open project ${p.name}`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card-premium p-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-electric shadow-glow">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <p className="mt-4 text-base font-semibold">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">ZITA is ready when you are.</p>
            <Button asChild className="mt-5 rounded-xl bg-gradient-electric text-primary-foreground shadow-glow">
              <Link to="/projects/new"><Plus className="h-4 w-4" />Start your first project</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InlineProjectName({ project, onRenamed }: { project: { id: string; name: string }; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.name]);

  const save = async () => {
    setEditing(false);
    const trimmed = name.trim() || "Untitled Project";
    if (trimmed === project.name) return;
    const { error } = await supabase
      .from("projects")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renamed");
    onRenamed();
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setName(project.name); setEditing(false); }
        }}
        className="relative z-10 h-7 text-sm font-semibold"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
      className="relative z-10 block cursor-text truncate font-semibold group-hover:text-primary"
      title="Click to rename"
    >
      {project.name}
    </span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gradient-electric">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
