import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Target, Sparkles, Zap, FileCode, Rocket, Check, Lock, ArrowRight, Loader2,
  RefreshCw, ChevronDown,
} from "lucide-react";
import { type Idea, type ScoredIdea } from "@/lib/zita.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/project/$id")({
  component: ProjectWorkspace,
});

type Status = "profile" | "discover" | "score" | "blueprint" | "launch" | "completed";
const STEPS: { key: Status; label: string; icon: any; desc: string }[] = [
  { key: "profile", label: "Profile", icon: Target, desc: "Tell ZITA about you and your audience." },
  { key: "discover", label: "Discover", icon: Sparkles, desc: "Find real, painful problems worth solving." },
  { key: "score", label: "Score", icon: Zap, desc: "Rank ideas across 6 dimensions." },
  { key: "blueprint", label: "Blueprint", icon: FileCode, desc: "Generate the build spec for your tool." },
  { key: "launch", label: "Launch", icon: Rocket, desc: "Get your launch kit and go live." },
];
const idx = (s: string) => Math.max(0, STEPS.findIndex((x) => x.key === s));

function ProjectWorkspace() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) {
        console.error("Failed to load project:", error);
        throw error;
      }
      return data;
    },
  });

  useEffect(() => {
    if (error) console.error("Project workspace error:", error);
  }, [error]);

  const reached = project ? (project.status === "completed" ? 4 : idx(project.status)) : 0;
  const [active, setActive] = useState<Status>("profile");

  useEffect(() => {
    if (project) setActive((project.status === "completed" ? "launch" : project.status) as Status);
  }, [project?.status]);

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (error || !project) {
    return <div className="mx-auto max-w-2xl px-6 py-20 text-center text-sm text-muted-foreground">Could not load this project.</div>;
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ["project", id] });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <ProjectHeader project={project} onSaved={refresh} />

      <StepBar active={active} reached={reached} status={project.status} onPick={setActive} />

      <div className="mt-8">
        {active === "profile" && <ProfilePanel project={project} onSaved={(next) => { refresh(); setActive(next); }} />}
        {active === "discover" && <DiscoverPanel project={project} onSaved={(next) => { refresh(); setActive(next); }} />}
        {active === "score" && <ScorePanel project={project} onSaved={(next) => { refresh(); setActive(next); }} />}
        {active === "blueprint" && <Placeholder step={STEPS[3]} />}
        {active === "launch" && <Placeholder step={STEPS[4]} />}
      </div>
    </div>
  );
}

// ---------- Header with inline-editable name + status badge ----------
function ProjectHeader({ project, onSaved }: { project: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.name]);

  const save = async () => {
    setEditing(false);
    const trimmed = name.trim() || "Untitled Project";
    if (trimmed === project.name) return;
    const { error } = await supabase.from("projects").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renamed");
    onSaved();
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="text-xs uppercase tracking-widest text-primary">Project</div>
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setName(project.name); setEditing(false); } }}
          className="h-9 max-w-md text-xl font-bold"
        />
      ) : (
        <h1 onClick={() => setEditing(true)} className="cursor-text rounded px-1 text-2xl font-bold hover:bg-accent/40" title="Click to rename">
          {project.name}
        </h1>
      )}
      <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs uppercase tracking-wider text-primary">
        {project.status}
      </span>
    </div>
  );
}

// ---------- Step bar ----------
function StepBar({ active, reached, status, onPick }: { active: Status; reached: number; status: string; onPick: (s: Status) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="relative flex items-center justify-between gap-2">
        <div className="absolute left-5 right-5 top-5 h-0.5 -translate-y-1/2 bg-border" />
        <div className="absolute left-5 top-5 h-0.5 -translate-y-1/2 bg-gradient-electric transition-all" style={{ width: `calc((100% - 2.5rem) * ${reached / (STEPS.length - 1)})` }} />
        {STEPS.map((s, i) => {
          const locked = i > reached;
          const done = i < reached || status === "completed";
          const current = active === s.key;
          return (
            <button
              key={s.key}
              disabled={locked}
              onClick={() => !locked && onPick(s.key)}
              title={locked ? "Complete previous steps first" : s.label}
              className={cn(
                "relative z-10 flex flex-1 flex-col items-center gap-1.5 rounded-lg px-2 py-2 transition",
                locked ? "cursor-not-allowed opacity-40" : "hover:bg-accent/40",
              )}
            >
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition",
                current && "border-primary bg-gradient-electric text-primary-foreground shadow-glow",
                !current && done && "border-success bg-success/20 text-success",
                !current && !done && !locked && "border-border bg-card text-foreground",
                locked && "border-border bg-card text-muted-foreground",
              )}>
                {locked ? <Lock className="h-4 w-4" /> : done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <s.icon className={cn("h-3 w-3", current ? "text-primary" : "text-muted-foreground")} />
                <span className={cn(current && "font-semibold text-foreground", !current && "text-muted-foreground")}>{s.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Step 1: Profile (fully functional) ----------
const TOOL_TYPES = ["Lead magnet", "Paid mini-tool", "Client tool", "Internal business tool", "Not sure yet"];
const SKILLS = ["Beginner", "Intermediate", "Advanced"];
const TIMES = ["<5h", "5-10h", "10-20h", "20+h"];

function ProfilePanel({ project, onSaved }: { project: any; onSaved: (next: Status) => void }) {
  const existing = (project.profile_data ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    expertise: existing.expertise ?? "",
    audience: existing.audience ?? "",
    offer: existing.offer ?? "",
    topic: existing.topic ?? "",
    tool_type: existing.tool_type ?? "Not sure yet",
    skill_level: existing.skill_level ?? "Beginner",
    time_per_week: existing.time_per_week ?? "5-10h",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.expertise.trim() || !form.audience.trim() || !form.offer.trim()) {
      toast.error("Please fill the first three fields.");
      return;
    }
    setSaving(true);
    const nextStatus = project.status === "profile" ? "discover" : project.status;
    const { error } = await supabase
      .from("projects")
      .update({ profile_data: form, status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved — Discover unlocked");
    onSaved("discover");
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-card">
      <div>
        <h2 className="text-lg font-semibold">Step 1 — Your Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">ZITA uses this to tailor every idea to you.</p>
      </div>

      <Field label="What do you do? *">
        <Textarea rows={2} value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} placeholder="Your expertise / background" />
      </Field>
      <Field label="Who do you help? *">
        <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Target audience" />
      </Field>
      <Field label="What do you sell or want to sell? *">
        <Textarea rows={2} value={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.value })} placeholder="Your current or planned offer" />
      </Field>
      <Field label="Problem area or niche (optional)">
        <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
      </Field>

      <RadioGroup label="Preferred tool type" value={form.tool_type} options={TOOL_TYPES} onChange={(v) => setForm({ ...form, tool_type: v })} />
      <RadioGroup label="Your build skill level" value={form.skill_level} options={SKILLS} onChange={(v) => setForm({ ...form, skill_level: v })} />
      <RadioGroup label="Time available per week" value={form.time_per_week} options={TIMES} onChange={(v) => setForm({ ...form, time_per_week: v })} />

      <Button type="submit" disabled={saving} className="bg-gradient-electric text-primary-foreground shadow-glow">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save & Continue → Discover <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RadioGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              value === o
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Step 2: Discover ----------
function DiscoverPanel({ project, onSaved }: { project: any; onSaved: (next: Status) => void }) {
  const existingIdeas = (project.ideas as Idea[] | null) ?? null;
  const autoRun = !existingIdeas;
  const didAutoRun = useRef(false);

  const [mode, setMode] = useState<"fast" | "manual">("fast");
  const [notes, setNotes] = useState<string>(project.manual_research ?? "");
  const [running, setRunning] = useState(autoRun);
  const [ideas, setIdeas] = useState<Idea[] | null>(existingIdeas);
  const [expanded, setExpanded] = useState<number | null>(null);

  const run = async (isRegen = false) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ideas", {
        body: { projectId: project.id, researchNotes: notes },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setIdeas(data.ideas);
      toast.success(isRegen ? "Ideas regenerated!" : `${data.ideas.length} ideas generated!`);
    } catch (err: any) {
      toast.error(err?.message ?? "Generation failed — try again.");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (autoRun && !didAutoRun.current) {
      didAutoRun.current = true;
      run();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goToScore = async () => {
    if (["profile", "discover"].includes(project.status as string)) {
      const { error } = await supabase
        .from("projects")
        .update({ status: "score", updated_at: new Date().toISOString() })
        .eq("id", project.id);
      if (error) { toast.error(error.message); return; }
    }
    onSaved("score");
  };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Step 2 — Discover Ideas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find real, painful problems worth solving.</p>
        </div>
        {ideas && !running && (
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={running}>
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {(["fast", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              mode === m
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "fast" ? "⚡ Fast AI Mode" : "📋 Manual Research Mode"}
          </button>
        ))}
      </div>

      {/* Research notes */}
      <Field label="Research notes (optional)">
        <Textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste notes from Reddit, YouTube comments, Facebook groups, customer calls, or emails…"
          disabled={running}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Live Reddit and YouTube research will be added later. For now, paste any research notes or use Fast AI Mode.
        </p>
      </Field>

      {/* Primary CTA — shown only before first generation */}
      {!ideas && !running && (
        <Button onClick={() => run()} className="bg-gradient-electric text-primary-foreground shadow-glow">
          <Sparkles className="h-4 w-4" />
          Discover Ideas (8 credits)
        </Button>
      )}

      {/* Loading skeleton */}
      {running && (
        <div className="space-y-3">
          <p className="animate-pulse text-sm text-muted-foreground">Generating ideas — this can take 15–30 s…</p>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Ideas list */}
      {ideas && !running && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{ideas.length} ideas generated</p>
          {ideas.map((idea, i) => (
            <IdeaCard
              key={i}
              idea={idea}
              expanded={expanded === i}
              onToggle={() => setExpanded(expanded === i ? null : i)}
            />
          ))}
          <div className="border-t border-border pt-4">
            <Button onClick={goToScore} className="bg-gradient-electric text-primary-foreground shadow-glow">
              Score these Ideas <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, expanded, onToggle }: { idea: Idea; expanded: boolean; onToggle: () => void }) {
  const diff = idea.build_difficulty_1_10;
  const diffColor = diff <= 3 ? "text-green-500" : diff <= 6 ? "text-yellow-500" : "text-red-500";
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-accent/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{idea.name}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {idea.usage_frequency}
            </span>
            <span className={cn("text-xs font-medium", diffColor)}>Difficulty {diff}/10</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{idea.promise}</p>
        </div>
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border px-4 py-4 text-sm">
          <IdeaDetail label="The real problem" value={idea.problem} />
          <IdeaDetail label="Evidence / reasoning" value={idea.evidence} />
          <IdeaDetail label="Target user" value={idea.target_user} />
          <IdeaDetail label="Why they care" value={idea.why_they_care} />
          <IdeaDetail label="Monetization angle" value={idea.monetization_angle} />
          <IdeaDetail label="Content angle" value={idea.content_angle} />
        </div>
      )}
    </div>
  );
}

function IdeaDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

// ---------- Step 3: Score ----------
function ScorePanel({ project, onSaved }: { project: any; onSaved: (next: Status) => void }) {
  const existingScored = (project.scored_ideas as ScoredIdea[] | null) ?? null;
  const existingChosen = (project.chosen_idea as { name: string } | null)?.name ?? null;
  const autoRun = !existingScored;
  const didAutoRun = useRef(false);

  const [scored, setScored] = useState<ScoredIdea[] | null>(existingScored);
  const [chosen, setChosen] = useState<string | null>(existingChosen);
  const [running, setRunning] = useState(autoRun);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-ideas", {
        body: { projectId: project.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setScored(data.scored);
      toast.success("Ideas scored!");
    } catch (err: any) {
      toast.error(err?.message ?? "Scoring failed — try again.");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (autoRun && !didAutoRun.current) {
      didAutoRun.current = true;
      run();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (ideaName: string) => {
    const ideaObj =
      (project.ideas as Idea[] | null)?.find((i) => i.name === ideaName) ??
      { name: ideaName };
    const { error } = await supabase
      .from("projects")
      .update({ chosen_idea: ideaObj, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    setChosen(ideaName);
    toast.success(`"${ideaName}" selected`);
  };

  const goToBlueprint = async () => {
    const below = ["profile", "discover", "score"];
    if (below.includes(project.status as string)) {
      const { error } = await supabase
        .from("projects")
        .update({ status: "blueprint", updated_at: new Date().toISOString() })
        .eq("id", project.id);
      if (error) { toast.error(error.message); return; }
    }
    onSaved("blueprint");
  };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Step 3 — Score Ideas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ranked across 6 founder-fit dimensions. Pick the one you'll build.</p>
        </div>
        {scored && !running && (
          <Button variant="outline" size="sm" onClick={run} disabled={running}>
            <RefreshCw className="h-3.5 w-3.5" />
            Re-score (4 credits)
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {running && (
        <div className="space-y-3">
          <p className="animate-pulse text-sm text-muted-foreground">Scoring ideas — this can take 15–30 s…</p>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2.5 h-4 w-1/4 rounded bg-muted" />
              <div className="flex gap-2">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="h-5 w-9 rounded bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ranked table */}
      {scored && !running && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">#</th>
                  <th className="px-3 py-2.5 text-left font-medium">Idea</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Pain level">Pain</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Build ease">Build</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Monetization potential">$$$</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Content potential">Content</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Conversation potential">Convo</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Founder offer potential">Offer</th>
                  <th className="px-3 py-2.5 text-center font-medium">Total</th>
                  <th className="px-3 py-2.5 text-left font-medium">Verdict</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {scored.map((idea, i) => {
                  const isChosen = chosen === idea.name;
                  return (
                    <tr
                      key={idea.name}
                      className={cn(
                        "border-b border-border last:border-0 transition",
                        isChosen ? "bg-primary/10" : "hover:bg-accent/20",
                      )}
                    >
                      <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {isChosen && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          <span className={cn("font-medium", isChosen && "text-primary")}>{idea.name}</span>
                        </div>
                      </td>
                      <ScoreCell v={idea.scores.pain_level} />
                      <ScoreCell v={idea.scores.build_ease} />
                      <ScoreCell v={idea.scores.monetization_potential} />
                      <ScoreCell v={idea.scores.content_potential} />
                      <ScoreCell v={idea.scores.conversation_potential} />
                      <ScoreCell v={idea.scores.founder_offer_potential} />
                      <td className="px-3 py-3 text-center">
                        <span className={cn(
                          "font-bold tabular-nums",
                          idea.total >= 48 ? "text-green-500" : idea.total >= 36 ? "text-yellow-500" : "text-muted-foreground",
                        )}>
                          {idea.total}/60
                        </span>
                      </td>
                      <td className="max-w-[180px] px-3 py-3 text-xs text-muted-foreground">
                        <p className="line-clamp-2">{idea.verdict}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          variant={isChosen ? "default" : "outline"}
                          onClick={() => choose(idea.name)}
                          className={cn(isChosen && "border-primary/30 bg-primary/20 text-primary hover:bg-primary/30")}
                        >
                          {isChosen ? <><Check className="h-3 w-3" /> Chosen</> : "Choose this Idea"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom CTA */}
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button
              onClick={goToBlueprint}
              disabled={!chosen}
              className="bg-gradient-electric text-primary-foreground shadow-glow"
            >
              Create Blueprint <ArrowRight className="h-4 w-4" />
            </Button>
            {!chosen && (
              <p className="text-xs text-muted-foreground">Choose an idea above to continue</p>
            )}
            {chosen && (
              <p className="text-xs text-muted-foreground">
                Building: <span className="font-medium text-foreground">{chosen}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCell({ v }: { v: number }) {
  const color = v >= 8 ? "text-green-500" : v >= 6 ? "text-yellow-500" : "text-muted-foreground";
  return (
    <td className={cn("px-3 py-3 text-center font-medium tabular-nums", color)}>{v}</td>
  );
}

// ---------- Placeholder for steps 2-5 ----------
function Placeholder({ step }: { step: { key: Status; label: string; icon: any; desc: string } }) {
  const Icon = step.icon;
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 text-lg font-semibold">{step.label}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{step.desc}</p>
      <Button disabled className="mt-5 opacity-50">Run {step.label}</Button>
      <div className="mt-3 text-xs uppercase tracking-widest text-primary/70">Building this step next</div>
    </div>
  );
}
