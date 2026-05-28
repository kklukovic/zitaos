import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Check, X, ArrowRight,
  Target, Sparkles, Zap, FileCode, Rocket,
  Mail, Users, Briefcase, Star, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CTA_URL = "https://earnmoon.thrivecart.com/zita-os-founder-access/";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

const steps = [
  {
    icon: Target,
    label: "Profile",
    desc: "Tell ZITA who you are, who you help, and what you sell. This shapes every idea and recommendation that follows.",
  },
  {
    icon: Sparkles,
    label: "Discover",
    desc: "Fast AI mode or paste your own research. ZITA surfaces 5-7 evidence-led app ideas matched to your audience and skills.",
  },
  {
    icon: Zap,
    label: "Score",
    desc: "Each idea is ranked across 6 dimensions: market size, competition, buildability, monetization potential, and more. Pick your winner with confidence, not guesswork.",
  },
  {
    icon: FileCode,
    label: "Blueprint",
    desc: "Full product requirements document plus a copy-paste build prompt for Lovable, Cursor, or Claude Code. Your developer or the AI knows exactly what to build.",
  },
  {
    icon: Rocket,
    label: "Launch",
    desc: "A founder offer, social posts, DM templates, 7-day launch plan, and a $1 auction template. Because building the app is only half the job.",
  },
];

const appTypes = [
  {
    icon: Mail,
    title: "Lead Magnet App",
    text: "Turn your knowledge into a free tool that captures emails and grows your audience on autopilot. Build once, collect leads forever.",
  },
  {
    icon: Users,
    title: "Membership or Community App",
    text: "Give your audience a private space with tools, resources, or automation baked in. Charge monthly. Build loyalty.",
  },
  {
    icon: Briefcase,
    title: "App You Sell to Local Businesses",
    text: "Restaurants, clinics, salons, real estate agents. They all have repetitive problems you can solve with a simple app. Build it once, license it many times.",
  },
  {
    icon: Star,
    title: "Tool for Influencers and Creators",
    text: "Creators with audiences need tools their followers will love. Build the app they would promote to their list and split the revenue.",
  },
  {
    icon: Settings,
    title: "Internal Tool to Save Time and Money",
    text: "Automate what your team does manually. Cut costs. Eliminate repetitive tasks. Your own business becomes more valuable and you can sell the tool to others doing the same thing.",
  },
  {
    icon: Zap,
    title: "Micro App That Solves One Real Problem",
    text: "The best-selling apps do one thing perfectly. ZITA helps you find that one problem worth solving, validate it, and build it right.",
  },
];

const forYou = [
  "You have ideas but don't know which one to build",
  "You've built things nobody used or paid for",
  "You want to use AI to build but need a validated direction first",
  "You're a consultant or freelancer who wants a productized offer",
  "You want to build apps you can sell to businesses or creators",
  "You're tired of starting over",
];

const notForYou = [
  "You want someone to build the app for you",
  "You're looking for get-rich-quick shortcuts",
  "You already have a validated idea and a paying customer",
];

const features = [
  "Full 5-step ZITA OS workflow",
  "100 credits per month (3+ complete projects)",
  "Blueprint + Lovable-ready build prompt",
  "Complete launch system per project",
  "Growth Library and templates",
  "Every feature shipped going forward",
  "Founder pricing locked forever",
];

const faqs = [
  {
    q: "What exactly is ZITA OS?",
    a: "A guided 5-step system that takes you from zero idea to a validated app blueprint and launch plan in one sitting. It's not a course. It's a working tool.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. ZITA outputs a Lovable-ready build prompt. You paste it, and AI builds your app.",
  },
  {
    q: "How is this different from ChatGPT?",
    a: "ChatGPT gives you answers. ZITA gives you a system. Profile, Discover, Score, Blueprint, Launch. Each step builds on the last with proven logic under the hood.",
  },
  {
    q: "What do 100 credits get me?",
    a: "Enough to complete 3 or more full projects per month, from idea discovery to launch plan.",
  },
  {
    q: "Is there a discount available?",
    a: "If you received a coupon code, enter it at checkout. Codes are shared privately and are limited.",
  },
  {
    q: "What if I already have an idea?",
    a: "Skip to Step 3, Score. Validate your existing idea before you build it. Most people are surprised by what the scoring reveals.",
  },
];

function CtaButton({ label = "Get Founder Access - $97", large = false }: { label?: string; large?: boolean }) {
  return (
    <a
      href={CTA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-md bg-gradient-electric text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold ${large ? "px-8 py-4 text-base" : "px-6 py-3 text-sm"}`}
    >
      {label} <ArrowRight className="h-4 w-4" />
    </a>
  );
}

function Landing() {
  return (
    <div className="min-h-screen">

      {/* NAVBAR */}
      <header className="sticky top-0 z-50 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center">
            <img src="/brand/horizontal_transparent.png" alt="ZITA OS" className="hidden h-8 w-auto sm:block" />
            <img src="/brand/app_icon_512.png" alt="ZITA OS" className="block h-7 w-7 rounded-lg sm:hidden" />
          </Link>
          <a
            href={CTA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-gradient-electric px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90 transition-opacity"
          >
            Get Founder Access - $97
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">
          Founder Access - One Time $97
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl leading-tight">
          Building an app is now the easy part.<br />
          <span className="text-gradient-electric">Building one people actually buy</span><br />
          is where everyone fails.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          ZITA OS is a guided 5-step system that takes you from zero idea to a validated, blueprinted, launch-ready app in one sitting. No guessing. No wasted builds. No dev bills.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <CtaButton label="Get Instant Access - $97" large />
          <p className="text-xs text-muted-foreground">One-time payment. Lifetime access. No subscription.</p>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">The way app building used to work vs. now</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-7">
            <div className="mb-5 text-xs font-semibold uppercase tracking-widest text-red-400">Before</div>
            <ul className="space-y-4">
              {[
                "Hiring a developer: $5,000-$50,000 minimum",
                "Waiting 3-6 months to see anything working",
                "Building based on a gut feeling, not validated data",
                "Launching something nobody wanted",
                "Going back to zero",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-7">
            <div className="mb-5 text-xs font-semibold uppercase tracking-widest text-primary">After ZITA OS</div>
            <ul className="space-y-4">
              {[
                "First working version in hours, not months",
                "Idea validated before you write a single line of code",
                "Blueprint generated automatically, ready for Lovable or Cursor",
                "Launch plan included from day one",
                "Built to sell, not just to exist",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* WHAT WILL YOU BUILD */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">What will you build?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground">
          ZITA OS works for any solo builder, consultant, or entrepreneur. Here are the most common apps our users build:
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {appTypes.map((type) => (
            <div key={type.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent">
                <type.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-4 font-semibold">{type.title}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{type.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CORE MESSAGE */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-border bg-card p-10">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl leading-snug">
            The market is flooded with apps nobody needs.<br />
            <span className="text-gradient-electric">ZITA makes sure yours isn't one of them.</span>
          </h2>
          <div className="mt-6 space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              AI tools like Lovable, Cursor, and Claude have made building apps accessible to everyone. That's great news. And a serious problem.
            </p>
            <p className="font-medium text-foreground">
              Everyone is building. Few are selling.
            </p>
            <p>
              The difference between an app that generates income and one that collects digital dust is not the code. It's the thinking that happened before the first line was written.
            </p>
            <p>
              ZITA OS forces that thinking. Every step, from your profile to your launch plan, is designed to make sure you build something the market actually wants to pay for.
            </p>
          </div>
        </div>
      </section>

      {/* FIVE STEPS */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Five steps. One sitting.</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
          Each step builds on the last. You don't move forward until the previous step is solid.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-5">
          {steps.map((s, i) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-mono text-muted-foreground">0{i + 1}</span>
              </div>
              <div className="mt-3 font-semibold">{s.label}</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LAUNCH SECTION */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-3xl font-bold tracking-tight leading-snug">
          Most tools stop at "build it."<br />
          <span className="text-gradient-electric">We don't.</span>
        </h2>
        <div className="mx-auto mt-6 max-w-2xl space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Every project inside ZITA OS ends with a full launch system. Posts. DMs. Offer structure. Pricing suggestions. A 7-day action plan.
          </p>
          <p>
            Because the goal was never to have an app.<br />
            The goal was to have an app that earns.
          </p>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight">ZITA OS is for you if...</h2>
            <ul className="mt-6 space-y-3">
              {forYou.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">ZITA OS is NOT for you if...</h2>
            <ul className="mt-6 space-y-3">
              {notForYou.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card to-accent/30 p-10 text-center shadow-glow">
          <div className="text-xs uppercase tracking-widest text-primary">Founder Access</div>
          <div className="mt-3 flex items-baseline justify-center gap-3">
            <span className="text-5xl font-bold">$97</span>
            <span className="text-xl text-muted-foreground line-through">$197</span>
            <span className="text-sm text-muted-foreground">one-time</span>
          </div>
          <ul className="mx-auto mt-8 max-w-sm space-y-3 text-left text-sm">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <CtaButton large />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            One-time payment. No subscription. Use a coupon code at checkout if you have one.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">FAQ</h2>
        <div className="mt-8 space-y-4">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-xl border border-border bg-card p-5">
              <div className="font-semibold">{f.q}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Ready to build something that earns?</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Join founders who stopped guessing and started building with a system.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <CtaButton label="Get Founder Access - $97" large />
          <p className="text-xs text-muted-foreground">One-time payment. Lifetime access. No subscription.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4 mb-2">
          <Link to="/auth" className="hover:text-foreground transition-colors">Sign in</Link>
          <span>zitaos.com</span>
        </div>
        <div>ZITA OS - Zero Idea To App</div>
      </footer>

    </div>
  );
}
