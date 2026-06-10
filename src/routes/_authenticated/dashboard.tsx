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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary">Welcome back</div>
          <h1 className="mt-1 text-3xl font-bold">Hi, {profile?.full_name || "founder"}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Let ZITA help you find your next app idea.</p>
        </div>
        <Button asChild size="lg" className="bg-gradient-electric text-primary-foreground shadow-glow hover:opacity-90">
          <Link to="/projects/new"><Plus className="h-4 w-4" />Start new project</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <StatCard label="Credits" value={String(profile?.credits ?? 0)} hint={`Founder tier — ${profile?.founder_tier ?? "founder_47"}`} />
        <StatCard label="Projects" value={String(projects?.length ?? 0)} hint="Recent activity" />
        <StatCard label="Cost per project" value={`~${PROJECT_TOTAL_CREDITS} cr`} hint={COST_HINT} />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent projects</h2>
          <Link to="/projects" className="text-sm text-primary hover:underline">View all <ArrowRight className="inline h-3 w-3" /></Link>
        </div>
        {projects && projects.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((p) => {
              const m = statusMeta[p.status] ?? statusMeta.profile;
              return (
                <div key={p.id} className="group relative rounded-xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-3">
                      <InlineProjectName project={p} onRenamed={refreshProjects} />
                      <div className="mt-1 text-xs text-muted-foreground">Updated {new Date(p.updated_at).toLocaleDateString()}</div>
                    </div>
                    <div className={cn("flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs", m.tone)}>
                      <m.icon className="h-3 w-3" />{m.label}
                    </div>
                  </div>
                  {/* Full-card link sits behind the name editor */}
                  <Link
                    to="/project/$id"
                    params={{ id: p.id }}
                    className="absolute inset-0 rounded-xl"
                    aria-label={`Open project ${p.name}`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">No projects yet. ZITA is ready when you are.</p>
            <Button asChild className="mt-4 bg-gradient-electric text-primary-foreground shadow-glow">
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
