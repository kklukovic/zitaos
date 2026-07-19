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

    // Parse JSON robustly — strip markdown fences and any preamble/trailing text.
    // On truncated output (e.g. Anthropic Haiku 4.5's 8192-token cap cutting off
    // mid-object on large idea batches), salvage all complete top-level items.
    let ideas: unknown[];
    try {
      let raw = s2Result.text.trim();

      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenced) raw = fenced[1].trim();

      const firstObj = raw.indexOf("{");
      const firstArr = raw.indexOf("[");
      const candidates = [firstObj, firstArr].filter((i) => i >= 0);
      if (candidates.length === 0) throw new Error("no JSON start token found");
      const start = Math.min(...candidates);
      const opener = raw[start] as "[" | "{";
      const closer = opener === "[" ? "]" : "}";
      const end = raw.lastIndexOf(closer);
      const sliced = end > start ? raw.slice(start, end + 1) : raw.slice(start);

      let parsed: unknown;
      try {
        parsed = JSON.parse(sliced);
      } catch (_firstErr) {
        const repaired = repairTruncatedJson(raw.slice(start), opener);
        if (!repaired) throw _firstErr;
        parsed = JSON.parse(repaired);
        console.warn(
          `[generate-ideas] recovered from truncated JSON (raw length ${s2Result.text.length}, provider ${s2Result.provider})`,
        );
      }
      ideas = Array.isArray(parsed)
        ? parsed
        : (parsed as { ideas?: unknown[] })?.ideas ?? [];
      if (!Array.isArray(ideas)) throw new Error("not an array");
      if (ideas.length === 0) throw new Error("empty ideas array");
    } catch (e) {
      console.error(
        "[generate-ideas] RAW_PARSE_FAIL:",
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
        const buyingSignal = typeof idea.buying_signal === "string"
          ? idea.buying_signal.trim()
          : typeof idea.payment_proof === "string"
          ? idea.payment_proof.trim()
          : "";
        return {
          ...idea,
          source_links: sourceLinks,
          buying_likelihood: buyingLikelihood,
          buying_signal: buyingSignal,
        };
      })
      .filter(
        (idea) =>
          idea.source_links.length > 0 &&
          typeof idea.buying_signal === "string" &&
          idea.buying_signal.trim().length > 0,
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
  return `STEP 1 RESEARCH BRIEF (binding constraints, not optional preferences):
- Niche / target audience: ${profile.niche_audience || profile.audience || profile.niche || "not specified"}
- Maximum useful MVP shipping timeframe: ${profile.ship_time || profile.time_per_week || "not specified"}
- Target market / buyer type: ${profile.customer_type || "not specified"}`;
}

function buildStage1(
  mode: string,
  profile: Record<string, string>,
  roughIdea: string,
): { system: string; prompt: string } {
  const taskInstr =
    mode === "personalized"
      ? `Find up to 5-7 highly specific app or digital-tool opportunities inside the user's stated niche. Each opportunity must serve the stated audience, match the selected buyer type, and have a credible MVP that fits the shipping timeframe.`
      : mode === "surprise"
      ? `Find up to 5-7 non-obvious opportunities for the stated audience. "Surprise" means unexpected workflows, subsegments, or angles within or immediately adjacent to that audience — never unrelated generic niches. The selected buyer type and shipping timeframe remain hard constraints.`
      : `The user has this rough idea: "${roughIdea}"

Research up to 5-7 stronger variants or adjacent opportunities that also satisfy the Step 1 audience, buyer type, and shipping timeframe. Challenge or reject the original idea when it conflicts with the profile or evidence.`;

  const system =
    `You are a profile-led app idea demand researcher with live Google Search access. Your job is to find problems the user's specific target audience is ALREADY complaining about and showing willingness to pay to solve.

NON-NEGOTIABLE:
- Treat the primary Step 1 niche / target-audience field as a HARD constraint. Every opportunity MUST directly serve that exact audience in its specific context and workflow.
- Never substitute, broaden, generalize, or replace the primary audience. If legacy or secondary audience inputs conflict, the first/primary niche field wins and every opportunity must serve it.
- Do not paste the audience label onto a generic product. The audience's niche-specific workflow must shape the product's core function, evidence, positioning, and buyer.
- Analyze the profile before searching: identify the audience's specific roles/subsegments, recurring jobs, vocabulary, likely communities, buyer/payment context, and the maximum MVP scope allowed by the shipping timeframe.
- Every search and every retained opportunity must be traceable to that profile analysis.
- Use live web search for every claim. Do not answer from memory.
- Do not invent posts, quotes, engagement, URLs, payment behavior, or demand.
- A real source means a specific, accessible page URL — not a subreddit homepage, search-results page, or fabricated representative title.
- Paraphrase when exact wording is uncertain. Use quotation marks only for wording visible in the source.
- Return fewer ideas when evidence is thin. Never pad the result with generic, broad, or weakly matched ideas.
- Audience-agnostic ideas are banned. Reject an idea if its target audience could be replaced with an unrelated audience without materially changing the product, workflow, or positioning. Retain it only after rewriting its core function to make sense specifically for this niche's workflow.
- Every opportunity object must contain the string fields "pain_source", "paid_workaround", and "buying_signal" using those exact names.
- Respond with raw JSON only. Never use markdown code fences and never add commentary before or after the JSON.`;

  const prompt =
    `${profileStr(profile)}

TASK: ${taskInstr}

PROFILE ANALYSIS — DO THIS BEFORE SEARCHING:
1. Interpret the primary niche/audience narrowly and literally. Identify 3-6 roles or subsegments inside that audience, their recurring workflows, and niche-specific language. Never expand into adjacent or unrelated audiences when the primary field is specific.
2. Translate the selected customer type into a buyer constraint:
   - B2B: require a business workflow, identifiable budget owner, and business payment rationale. Reject consumer-only ideas.
   - B2C: require an individual end-user problem and credible personal-payment behavior. Reject ideas dependent on company procurement.
   - Creators / solopreneurs: require a creator or one-person-business workflow and self-serve purchasing. Reject enterprise-heavy and generic consumer ideas.
3. Convert the shipping timeframe into an MVP scope ceiling:
   - A few days: one narrow job, minimal screens/data model, no marketplace/network effects, and no essential complex integrations.
   - 1 week: one complete narrow workflow with at most a small number of straightforward integrations.
   - 2-4 weeks: a focused product with a few bounded workflows/integrations; still reject enterprise platforms, network-effect products, or operationally heavy concepts.
4. Derive niche-specific search terms by combining audience/role language, recurring jobs, current workarounds, and complaint/payment phrases. Broad searches that omit the user's niche or audience are not sufficient.

SEARCH PROCESS:
1. Search relevant Reddit threads using the audience's exact roles, niche vocabulary, and workflows with phrases such as "I wish there was a tool", "does anything exist that", "I'd pay for", and "how do you handle".
2. Search Indie Hackers for the same profile-specific recurring complaint patterns, especially for creators/solopreneurs and small-business buyers.
3. Search Twitter/X for "someone should build" and "I hate doing" combined with the user's audience, role, or niche-specific task.
4. Search Upwork and Fiverr for repeated paid manual work performed for or by the stated audience that a small product could simplify within the shipping limit.
5. Cross-check each opportunity against existing tools used by this audience. Keep saturated categories only when complaints prove a narrow, profile-specific underserved angle.

QUALIFICATION RULES:
- Keep an opportunity only when it has at least one specific complaint source, one buying signal, a direct audience match, a direct customer-type match, and a feasible MVP for the selected shipping timeframe.
- A buying signal can be explicit willingness to pay, repeated paid freelance gigs, an existing paid but disliked tool, or a costly manual business workflow.
- Prioritize spreadsheets, copy-paste work, repetitive admin, and tasks outsourced to freelancers.
- Record only engagement numbers visible in a source; otherwise use "not verified".
- If a platform has no usable evidence, omit it. Do not manufacture platform coverage.
- Reject broad labels such as "small businesses", "professionals", "content creators", or "consumers" unless narrowed to the actual Step 1 audience, role, workflow, and buying situation.
- Reject generic concepts such as an AI assistant, dashboard, CRM, marketplace, planner, or content generator unless the evidence establishes a narrow niche-specific job and differentiated workflow.
- Reject ideas whose smallest useful version cannot honestly deliver the core value inside the selected shipping timeframe. Do not hide excluded essential functionality behind a future roadmap.
- For every opportunity, populate exactly these three evidence fields: pain_source (real niche-specific communities where the pain is discussed), paid_workaround (an existing paid tool or manual process with rough price or time cost), and buying_signal (why this exact audience pays to solve it).
- Before retaining each opportunity, silently ask: "Would a member of the stated audience immediately recognize this as their problem?" If no, replace or rewrite it before returning the batch.

Return ONLY one JSON object with this shape:
{
  "profile_analysis": {
    "niche_interpretation": "narrow interpretation of the Step 1 audience",
    "roles_and_subsegments": ["specific roles/subsegments considered"],
    "recurring_workflows": ["profile-specific jobs/workflows worth researching"],
    "buyer_constraint": "what the selected customer type requires and excludes",
    "shipping_scope": "what can and cannot fit the selected timeframe",
    "search_terms": ["profile-specific terms and query angles used"]
  },
  "opportunities": [
{
  "hypothesis": "concise problem statement",
  "audience": "specific who",
  "app_type": "what the tool does",
  "profile_fit_reason": "how this directly follows from the Step 1 niche and customer type",
  "shipping_fit": "why the smallest useful MVP fits the selected timeframe, including essential in-scope functionality",
  "pain_source": "real niche-specific communities where this pain is publicly discussed",
  "paid_workaround": "specific paid tool or manual process used today, including rough price or time cost",
  "buying_signal": "why this exact audience spends money, labor, or costly time to solve it",
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
}
  ]
}

STRICT JSON OUTPUT CONTRACT:
- Respond with ONLY the raw JSON object matching the schema above.
- The first character must be { and the last character must be }.
- Do not use markdown code fences, including json fences.
- Do not include a preamble, explanation, commentary, or trailing text.
- Use valid double-quoted JSON and close every string, array, and object.`;

  return { system, prompt };
}

function buildStage2(
  profile: Record<string, string>,
  stage1Output: string,
): { system: string; prompt: string } {
  const has = Object.values(profile).some((v) => v?.trim());
  const founderCtx = has
    ? `niche/audience=${profile.niche_audience || profile.audience || profile.niche || "?"}, ship_time=${profile.ship_time || profile.time_per_week || "?"}, customer_type=${profile.customer_type || "?"}`
    : "no profile — score fit neutrally";

  const system =
    `You are a commercially skeptical, profile-led app strategist. Turn grounded research into a short ranked list of ideas that directly serve the founder's exact primary Step 1 niche/audience. The primary audience is a HARD constraint: never substitute, broaden, generalize, or replace it, even when another legacy or secondary audience value conflicts. Audience fit, buyer-type fit, and shipping feasibility are hard eligibility gates, not optional scoring bonuses. Audience-agnostic ideas are banned unless rewritten so their core function only makes sense for the stated audience's specific workflow. Use only the supplied research and verified source list. Never add a community, source, quote, number, price, time cost, or demand claim that is absent from the research packet. Every idea object must contain the string fields "pain_source", "paid_workaround", and "buying_signal" using those exact names. Respond with raw JSON only: no markdown code fences and no commentary before or after the JSON.`;

  const prompt =
    `FOUNDER CONTEXT: ${founderCtx}

STAGE 1 RESEARCH — hypotheses with community evidence:
${stage1Output}

HARD PROFILE GATES — APPLY BEFORE COMMERCIAL SCORING:
- Drop any idea that does not directly serve the exact primary niche/audience in the Step 1 brief and its specific context and workflow. The primary niche field always wins over conflicting legacy or secondary audience inputs.
- Never broaden the audience to a more general category or replace it with an adjacent audience. A subsegment is allowed only when it is clearly contained within the stated primary audience.
- Drop any idea that does not match the selected customer type and its payment context (B2B, B2C, or creators/solopreneurs).
- Drop any idea whose smallest useful MVP cannot deliver its core value within the selected shipping timeframe. Judge required integrations, data acquisition, compliance, operations, network effects, and workflow breadth honestly.
- Drop any idea that would remain essentially unchanged if the stated audience were replaced by any unrelated audience. Niche labels pasted onto generic products do not count as profile fit; rewrite the core function around the niche workflow or reject it.
- Drop any idea with a profile fit score below 7/10 or a shipping-timeframe simplicity score below 7/10.

EVIDENCE AND SPECIFICITY GATES:
- Drop any idea without a grounded complaint and at least a real, though potentially limited, buying signal from the grounded research.
- Drop generic or saturated ideas unless the research proves a narrow underserved angle specific to this audience.
- Prefer spreadsheet, manual, and freelancer workarounds.
- It is acceptable to return fewer than 5 ideas. Do not fill gaps with assumptions.
- Every source_links URL must be copied verbatim from VERIFIED GOOGLE SEARCH SOURCES in the research packet. Never construct or rewrite a URL.
- Every card must contain exactly these three concrete evidence fields: pain_source naming real niche-specific communities where the pain is discussed; paid_workaround naming an existing paid tool or manual process with rough price or time cost; and buying_signal explaining why this exact audience pays.

AUDIENCE RECOGNITION SELF-CHECK — DO THIS BEFORE RETURNING:
- For every idea, silently ask: "Would a member of the stated audience immediately recognize this as their problem?"
- If no, replace the idea or rewrite its core function around a workflow unique to the stated audience. Never return the failed version.

SCORING DIMENSIONS (each 1–10):
- pain: urgency — many complaints, workarounds, repeated questions = high
- willingness_to_pay: explicit price mentions, paid gigs, existing paid tools, or expensive labor = high
- simplicity: can a solo developer ship the smallest genuinely useful MVP inside THIS USER'S selected timeframe? Narrow scope and fewer dependencies = higher
- retention: recurring return? data lock-in, workflow dependency, habit = high
- fit: direct match to the exact Step 1 niche/audience AND selected customer type; superficial niche wording = low

BUYING LIKELIHOOD (1–10) is the final ranking score. Calculate it from: 30% willingness_to_pay, 20% pain, 20% profile/customer-type fit, 20% simplicity relative to the selected shipping timeframe, and 10% retention. Evidence of spending and painful recurring work still matters more than novelty, but a generic or infeasible idea can never outrank a strongly matched feasible one. Sort descending by buying_likelihood.

EVIDENCE STRENGTH RULES:
- Strong: multiple specific sources, including a clear complaint and clear payment evidence
- Medium: at least one specific complaint source plus one credible payment or paid-workaround signal
- Weak: at least one verified, audience-specific complaint source but only limited or indirect buying evidence. Keep the weakness visible; never invent stronger proof.
- Score honestly as Strong, Medium, or Weak. Do not inflate or downgrade a card merely to manipulate distribution.
- Every returned batch must contain at least 2 non-Strong cards (Medium or Weak). If the best candidates are all genuinely Strong, include two additional eligible, audience-specific opportunities with honestly Medium/Weak evidence rather than downgrading Strong cards. Never use generic filler.

Return ONLY a JSON array sorted by buying_likelihood descending. Each card:
[
{
  "name": "App Name (2–5 marketable words)",
  "evidence_strength": "Strong|Medium|Weak",
  "buying_likelihood": 0,
  "target_audience": "specific description tied directly to the Step 1 niche; never a broad substitute audience",
  "buyer": "the exact role or person who controls the budget",
  "core_problem": "the painful recurring job in 1–2 sentences",
  "pain_in_buyers_words": "short quote or faithful paraphrase from a real source",
  "evidence_summary": "what the verified sources collectively demonstrate",
  "pain_source": "real niche-specific communities where this pain is publicly discussed",
  "source_links": [
    { "url": "...", "title": "...", "platform": "...", "engagement": "..." }
  ],
  "strongest_signal": "the single most compelling data point found",
  "paid_workaround": "existing paid tool or manual process, including rough price or time cost",
  "buying_signal": "why this exact audience pays money, labor, or costly time to solve it",
  "estimated_willingness_to_pay": "price or range and evidence-based rationale",
  "why_fits_user": "specific mapping to the Step 1 niche/audience, selected customer type, and shipping timeframe",
  "usage_frequency": "daily|weekly|monthly",
  "why_people_keep_paying": "what creates lock-in or recurring value",
  "fast_mvp": "smallest useful version buildable within the selected shipping timeframe — explicitly state why it fits and what is IN and OUT",
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
}
]

STRICT JSON OUTPUT CONTRACT:
- Respond with ONLY the raw JSON array matching the complete idea schema above.
- Every idea object must include pain_source, paid_workaround, and buying_signal using those exact field names.
- The first character must be [ and the last character must be ].
- Do not use markdown code fences, including json fences.
- Do not include a preamble, explanation, commentary, or trailing text.
- Use valid double-quoted JSON and close every string, array, and object.`;

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
