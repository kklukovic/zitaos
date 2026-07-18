import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai.ts";

// Credit cost — single constant, trivial to change.
const RESEARCH_IDEAS_CREDIT_COST = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Verify JWT
    const auth = req.headers.get("Authorization");
    if (!auth) return fail("Missing authorization", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return fail("Unauthorized", 401);

    // 2. Parse body
    const body = await req.json();
    const { projectId, mode = "personalized", roughIdea = "" } = body;
    if (!projectId) return fail("projectId required", 400);
    if (!["personalized", "surprise", "validate"].includes(mode)) {
      return fail("Invalid mode — must be personalized | surprise | validate", 400);
    }
    if (typeof roughIdea !== "string") return fail("roughIdea must be a string", 400);
    if (roughIdea.length > 20000) return fail("roughIdea too long (max 20000 chars)", 400);

    // 3. Load project (RLS enforces ownership)
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("profile_data")
      .eq("id", projectId)
      .single();

    if (projErr || !project) return fail("Project not found", 404);

    // 4. Atomic credit deduction via service role (prevents TOCTOU race)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: deductErr } = await admin.rpc("deduct_credits", {
      _user_id: user.id,
      _cost: RESEARCH_IDEAS_CREDIT_COST,
    });
    if (deductErr) {
      if ((deductErr.message || "").includes("insufficient_credits")) {
        return fail(`Not enough credits — need ${RESEARCH_IDEAS_CREDIT_COST}`, 402);
      }
      return fail("Could not deduct credits", 500);
    }

    const refund = async () => {
      await admin.rpc("refund_credits", { _user_id: user.id, _amount: RESEARCH_IDEAS_CREDIT_COST });
    };

    const profile = clampProfile(project.profile_data);

    // ── STAGE 1: Hypothesis + community evidence generation ───────────────────
    const { system: s1System, prompt: s1Prompt } = buildStage1(mode, profile, roughIdea);

    let s1Result, s2Result;
    const verifiedSourceUrls = new Set<string>();
    try {
      s1Result = await callAI({
        system: s1System,
        prompt: s1Prompt,
        jsonMode: false,
        webSearch: true,
        temperature: 0.35,
        maxTokens: 16384,
      });

      if (!s1Result.text.trim()) {
        await refund();
        return fail("Research stage returned no content — try again.", 502);
      }

      if (!s1Result.groundingSources?.length) {
        await refund();
        return fail("Research found no verifiable web sources — try a more specific niche.", 502);
      }

      for (const source of s1Result.groundingSources) verifiedSourceUrls.add(source.url);

      const groundedSourceList = s1Result.groundingSources
        .map((source, index) => `${index + 1}. ${source.title} — ${source.url}`)
        .join("\n");
      const groundedResearch = `${s1Result.text}\n\nVERIFIED GOOGLE SEARCH SOURCES:\n${groundedSourceList}`;

      // ── STAGE 2: Scoring + card generation ───────────────────────────────────
      const { system: s2System, prompt: s2Prompt } = buildStage2(profile, groundedResearch);

      s2Result = await callAI({
        system: s2System,
        prompt: s2Prompt,
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 16384,
      });
    } catch (aiErr) {
      await refund();
      throw aiErr;
    }

    // Parse JSON robustly — strip markdown fences and any preamble/trailing text
    let ideas: unknown[];
    try {
      let raw = s2Result.text.trim();

      // 1. Strip markdown code fences if present
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenced) raw = fenced[1].trim();

      // 2. Trim anything before the first { or [ and after the matching last } or ]
      const firstObj = raw.indexOf("{");
      const firstArr = raw.indexOf("[");
      const candidates = [firstObj, firstArr].filter((i) => i >= 0);
      if (candidates.length === 0) throw new Error("no JSON start token found");
      const start = Math.min(...candidates);
      const opener = raw[start];
      const closer = opener === "[" ? "]" : "}";
      const end = raw.lastIndexOf(closer);
      if (end <= start) throw new Error("no JSON end token found");
      raw = raw.slice(start, end + 1);

      const parsed = JSON.parse(raw);
      ideas = Array.isArray(parsed) ? parsed : parsed?.ideas;
      if (!Array.isArray(ideas)) throw new Error("not an array");
    } catch (e) {
      console.error(
        "JSON parse failed:",
        e instanceof Error ? e.message : String(e),
        "| provider:", s2Result.provider,
        "| model:", s2Result.model,
        "| raw length:", s2Result.text.length,
        "| FULL raw text:\n", s2Result.text,
      );
      await refund();
      return fail("AI returned invalid JSON — try again.", 502);
    }

    type IdeaRecord = Record<string, unknown>;
    const isRecord = (value: unknown): value is IdeaRecord =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);

    const verifiedIdeas = ideas
      .filter(isRecord)
      .map((idea) => {
        const sourceLinks = Array.isArray(idea.source_links)
          ? idea.source_links.filter(
              (source): source is IdeaRecord =>
                isRecord(source) &&
                typeof source.url === "string" &&
                verifiedSourceUrls.has(source.url),
            )
          : [];
        const buyingLikelihood = Math.max(1, Math.min(10, Math.round(Number(idea.buying_likelihood) || 1)));
        return { ...idea, source_links: sourceLinks, buying_likelihood: buyingLikelihood };
      })
      .filter(
        (idea) =>
          idea.source_links.length > 0 &&
          typeof idea.payment_proof === "string" &&
          idea.payment_proof.trim().length > 0,
      );

    if (verifiedIdeas.length === 0) {
      await refund();
      return fail("No ideas passed the verified demand and payment-evidence checks.", 502);
    }

    // Rank by buying likelihood first, then evidence strength and WTP score.
    const evidenceOrder: Record<string, number> = { Strong: 0, Medium: 1, Weak: 2 };
    verifiedIdeas.sort((a, b) => {
      const aScores = isRecord(a.scores) ? a.scores : {};
      const bScores = isRecord(b.scores) ? b.scores : {};
      return (
        b.buying_likelihood - a.buying_likelihood ||
        (evidenceOrder[String(a.evidence_strength)] ?? 1) -
          (evidenceOrder[String(b.evidence_strength)] ?? 1) ||
        (Number(bScores.willingness_to_pay) || 0) -
          (Number(aScores.willingness_to_pay) || 0)
      );
    });
    ideas = verifiedIdeas;

    // Audit log (service role bypasses RLS — user inserts are blocked by policy)
    await admin.from("credit_usage").insert({
      user_id: user.id,
      project_id: projectId,
      action: "research_ideas",
      credits_used: RESEARCH_IDEAS_CREDIT_COST,
      ai_model: s2Result.model,
    });

    await supabase
      .from("projects")
      .update({ ideas, status: "discover", updated_at: new Date().toISOString() })
      .eq("id", projectId);

    return ok({ ideas });
  } catch (e) {
    // Surface the real error — includes full provider status + body from callAI
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate-ideas unhandled:", msg);
    return fail(msg, 500);
  }
});

// ── Prompts ───────────────────────────────────────────────────────────────────

// Hard cap each profile field server-side to prevent AI cost amplification.
const PROFILE_FIELD_MAX = 2000;
function clampProfile(raw: unknown): Record<string, string> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = typeof v === "string" ? v.slice(0, PROFILE_FIELD_MAX) : "";
  }
  return out;
}

function profileStr(profile: Record<string, string>): string {
  const has = Object.values(profile).some((v) => v?.trim());
  if (!has) return "No user profile provided — generate ideas broadly.";
  return `USER PROFILE:
- Build skills and tools: ${profile.build_capabilities || profile.expertise || "not specified"}
- Niche or audience: ${profile.niche_audience || profile.audience || profile.niche || "not specified"}
- Target price range: ${profile.price_range || "not specified"}
- Shipping timeframe: ${profile.ship_time || profile.time_per_week || "not specified"}
- Customer type: ${profile.customer_type || "not specified"}`;
}

function buildStage1(
  mode: string,
  profile: Record<string, string>,
  roughIdea: string,
): { system: string; prompt: string } {
  const taskInstr =
    mode === "personalized"
      ? `Find 5-7 specific app or digital-tool opportunities tailored to the user's niche, audience, price, and shipping constraints.`
      : mode === "surprise"
      ? `Find 5-7 diverse, specific app or digital-tool opportunities across niches. Every opportunity still needs verifiable complaint and buying evidence.`
      : `The user has this rough idea: "${roughIdea}"

Research 5-7 stronger variants or adjacent opportunities. Challenge the original idea when the evidence points elsewhere.`;

  const system =
    `You are an app idea demand researcher with live Google Search access. Your job is to find problems people are ALREADY complaining about and showing willingness to pay to solve.

NON-NEGOTIABLE:
- Use live web search for every claim. Do not answer from memory.
- Do not invent posts, quotes, engagement, URLs, payment behavior, or demand.
- A real source means a specific, accessible page URL — not a subreddit homepage, search-results page, or fabricated representative title.
- Paraphrase when exact wording is uncertain. Use quotation marks only for wording visible in the source.
- Return fewer ideas when evidence is thin. Never pad the result with generic ideas.`;

  const prompt =
    `${profileStr(profile)}

TASK: ${taskInstr}

SEARCH PROCESS:
1. Search relevant Reddit threads for phrases such as "I wish there was a tool", "does anything exist that", "I'd pay for", and "how do you handle".
2. Search Indie Hackers for the same recurring complaint patterns.
3. Search Twitter/X for "someone should build" and "I hate doing" combined with the niche or task.
4. Search Upwork and Fiverr for repeated paid manual work that software could simplify.
5. Cross-check each opportunity against existing tools. Keep saturated categories only when complaints reveal a narrow underserved angle.

QUALIFICATION RULES:
- Keep an opportunity only when it has at least one specific complaint source AND one buying signal.
- A buying signal can be explicit willingness to pay, repeated paid freelance gigs, an existing paid but disliked tool, or a costly manual business workflow.
- Prioritize spreadsheets, copy-paste work, repetitive admin, and tasks outsourced to freelancers.
- Record only engagement numbers visible in a source; otherwise use "not verified".
- If a platform has no usable evidence, omit it. Do not manufacture platform coverage.

Return ONLY a JSON array. Each item:
{
  "hypothesis": "concise problem statement",
  "audience": "specific who",
  "app_type": "what the tool does",
  "current_workaround": "spreadsheet, manual workflow, freelancer, or existing paid tool used today",
  "buying_signal": "specific evidence that money or costly labor is already involved",
  "estimated_wtp": "evidence-based price or range, with reasoning",
  "evidence": [
    {
      "platform": "Reddit",
      "source_type": "complaint|payment|paid_workaround",
      "title": "real page title",
      "url": "specific source URL",
      "pain_in_buyers_words": "short exact quote or faithful paraphrase",
      "engagement": "visible engagement or not verified",
      "payment_signal": "what this source proves about willingness to pay"
    }
  ]
}`;

  return { system, prompt };
}

function buildStage2(
  profile: Record<string, string>,
  stage1Output: string,
): { system: string; prompt: string } {
  const has = Object.values(profile).some((v) => v?.trim());
  const founderCtx = has
    ? `capabilities=${profile.build_capabilities || profile.expertise || "?"}, niche/audience=${profile.niche_audience || profile.audience || profile.niche || "?"}, price=${profile.price_range || "?"}, ship_time=${profile.ship_time || profile.time_per_week || "?"}, customer_type=${profile.customer_type || "?"}`
    : "no profile — score fit neutrally";

  const system =
    `You are a commercially skeptical app strategist. Turn grounded research into a short ranked list of app ideas. Use only the supplied research and verified source list. Never add a source, quote, number, or demand claim that is absent from the research packet. Output valid JSON arrays only.`;

  const prompt =
    `FOUNDER CONTEXT: ${founderCtx}

STAGE 1 RESEARCH — hypotheses with community evidence:
${stage1Output}

FILTER BEFORE SCORING:
- Drop any idea without both a concrete complaint and a concrete buying signal.
- Drop generic or saturated ideas unless the research proves a narrow underserved angle.
- Prefer spreadsheet, manual, and freelancer workarounds.
- It is acceptable to return fewer than 5 ideas. Do not fill gaps with assumptions.
- Every source_links URL must be copied verbatim from VERIFIED GOOGLE SEARCH SOURCES in the research packet. Never construct or rewrite a URL.

SCORING DIMENSIONS (each 1–10):
- pain: urgency — many complaints, workarounds, repeated questions = high
- willingness_to_pay: explicit price mentions, paid gigs, existing paid tools, or expensive labor = high
- simplicity: solo dev ships useful MVP in under a week? fewer integrations = higher
- retention: recurring return? data lock-in, workflow dependency, habit = high
- fit: how well does this match the founder profile, skills, and audience?

BUYING LIKELIHOOD (1–10) is the commercial ranking score. Weight evidence of actual spending and painful recurring work more heavily than novelty. Sort descending by buying_likelihood.

EVIDENCE STRENGTH RULES:
- Strong: multiple specific sources, including a clear complaint and clear payment evidence
- Medium: at least one specific complaint source plus one credible payment or paid-workaround signal
- Weak: missing or ambiguous buying evidence — omit these ideas from the final output

Return ONLY a JSON array sorted by buying_likelihood descending. Each card:
{
  "name": "App Name (2–5 marketable words)",
  "evidence_strength": "Strong|Medium",
  "buying_likelihood": 0,
  "target_audience": "specific description of who",
  "buyer": "the exact role or person who controls the budget",
  "core_problem": "the painful recurring job in 1–2 sentences",
  "pain_in_buyers_words": "short quote or faithful paraphrase from a real source",
  "evidence_summary": "what the verified sources collectively demonstrate",
  "source_links": [
    { "url": "...", "title": "...", "platform": "...", "engagement": "..." }
  ],
  "strongest_signal": "the single most compelling data point found",
  "current_workaround": "how buyers solve it today, emphasizing spreadsheets, manual work, or freelancers",
  "payment_proof": "specific proof they already spend money, labor, or costly time on it",
  "estimated_willingness_to_pay": "price or range and evidence-based rationale",
  "why_fits_user": "why this idea suits the founder profile, skills, and audience",
  "usage_frequency": "daily|weekly|monthly",
  "why_people_keep_paying": "what creates lock-in or recurring value",
  "fast_mvp": "smallest realistic version buildable within the user's shipping timeframe — clearly state what is IN and OUT",
  "unique_angle": "one clear evidence-led difference from existing tools",
  "churn_risk": "main reason users might leave and how to prevent it",
  "validation_test": "fastest way to validate demand before building anything",
  "scores": {
    "pain": 0,
    "willingness_to_pay": 0,
    "simplicity": 0,
    "retention": 0,
    "fit": 0
  },
  "final_verdict": "one commercially focused sentence on whether to build this"
}`;

  return { system, prompt };
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
