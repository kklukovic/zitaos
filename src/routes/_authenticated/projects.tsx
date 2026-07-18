import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/projects")({
  component: Projects,
});

function Projects() {
  const { data: projects } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => (await supabase.from("projects").select("id,name,status,updated_at,created_at").order("updated_at", { ascending: false })).data ?? [],
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="scene-chip mb-3">Workspaces</div>
          <h1 className="step-title">Your <span className="text-gradient-heading">projects</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">All your ZITA OS workspaces in one place.</p>
        </div>
        <Button asChild className="h-12 rounded-xl bg-gradient-electric px-5 text-primary-foreground shadow-glow hover:opacity-95">
          <Link to="/projects/new"><Plus className="h-4 w-4" />New project</Link>
        </Button>
      </div>

      <div className="card-premium mt-10 overflow-hidden">
        {projects && projects.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <tr><th className="px-6 py-4">Name</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Updated</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0 transition-colors hover:bg-primary/[0.04]">
                  <td className="px-6 py-4">
                    <Link to="/project/$id" params={{ id: p.id }} className="font-semibold hover:text-primary">{p.name}</Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium capitalize text-primary/90">{p.status}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-sm text-muted-foreground">No projects yet.</div>
        )}
      </div>
    </div>
  );
}
