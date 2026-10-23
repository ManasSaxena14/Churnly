"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Bot, Check, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, Play, Sigma, User, Users } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NeuralScene } from "@/components/three/NeuralScene";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { AuthError, safeNext, useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";

type Mode = "login" | "signup";

const FEATURES = [
  { icon: Sigma, title: "Statistics before AI", body: "Survival models and corrected tests run first, so the AI only explains patterns that are real." },
  { icon: BadgeCheck, title: "Proof behind every claim", body: "Each recommendation links to the data, a cited source and a simulated result." },
  { icon: Users, title: "Risk score for every customer", body: "See who is likely to leave next, why, and export the list for your team." },
  { icon: Bot, title: "Ask your data anything", body: "A copilot answers in plain English and shows every query it ran." },
];

/* ── password strength (UI hint only; the server enforces the minimum) ── */
function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length > 0 && pw.length < 8) score = 0;
  return { score, label: ["Too short", "Okay", "Good", "Strong", "Excellent"][score] };
}
const STRENGTH_COLORS = ["bg-rose-400", "bg-amber-400", "bg-yellow-300", "bg-teal-300", "bg-emerald-400"];

function Field({
  id, label, labelRight, icon: Icon, type = "text", value, onChange, onKeyEvent, autoComplete, autoFocus, error, right, inputRef,
}: {
  id: string; label: string; labelRight?: React.ReactNode; icon: typeof Mail; type?: string; value: string; onChange: (v: string) => void;
  onKeyEvent?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoComplete: string; autoFocus?: boolean; error?: string | null; right?: React.ReactNode; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div data-auth="field">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="block text-[12.5px] font-medium text-zinc-300">{label}</label>
        {labelRight}
      </div>
      <div className={cn(
        "group relative flex items-center rounded-xl border bg-white/[0.03] transition-all duration-200",
        error ? "border-rose-400/60 shadow-[0_0_0_3px_rgba(251,113,133,0.12)]" : "border-white/10 focus-within:border-brand/60 focus-within:shadow-[0_0_0_3px_rgba(94,234,212,0.12)] hover:border-white/20",
      )}>
        <Icon className={cn("pointer-events-none absolute left-3.5 h-4 w-4 transition-colors", error ? "text-rose-300" : "text-zinc-500 group-focus-within:text-brand")} />
        <input
          ref={inputRef} id={id} type={type} value={value} autoComplete={autoComplete} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyEvent} onKeyUp={onKeyEvent} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
          className="h-12 w-full rounded-xl bg-transparent pl-10 pr-11 text-[14.5px] text-zinc-50 outline-none placeholder:text-zinc-600"
        />
        {right && <div className="absolute right-2">{right}</div>}
      </div>
      {error && <p id={`${id}-err`} className="mt-1.5 flex items-center gap-1.5 text-[12px] text-rose-300"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
    </div>
  );
}

function BrandPanel({ mode }: { mode: Mode }) {
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef(0.35);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setActive((a) => (a + 1) % FEATURES.length), 3800);
    return () => clearInterval(id);
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from("[data-bp='head'] > *", { y: 24, opacity: 0, stagger: 0.08, duration: 1.1 }, 0.15)
        .from("[data-bp='feat']", { x: -18, opacity: 0, stagger: 0.08, duration: 0.8 }, 0.45);
    },
    { scope: root },
  );

  return (
    <aside ref={root} className="relative hidden overflow-hidden border-r border-white/8 bg-[#06070a] lg:flex lg:flex-col">
      <NeuralScene progressRef={progress} className="absolute inset-0 opacity-80" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_30%_60%,rgba(6,7,10,0.92),rgba(6,7,10,0.55)_55%,transparent)]" />
      <div className="relative z-10 flex flex-1 flex-col p-10 xl:p-14">
        <Logo />
        <div data-bp="head" className="mt-auto max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">{mode === "signup" ? "Start free" : "Welcome back"}</p>
          <h2 className="mt-3 font-display text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-zinc-50">
            Find out why customers leave.{" "}
            <span className="font-serif font-normal italic text-brand-gradient">Keep them.</span>
          </h2>
          <p className="mt-4 text-[14.5px] leading-[1.7] text-zinc-400">{BRAND.description}</p>
        </div>
        <ul className="mt-10 flex max-w-md flex-col gap-2">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <li key={title} data-bp="feat">
              <button type="button" onClick={() => setActive(i)}
                className={cn("flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-500",
                  active === i ? "border-white/12 bg-white/[0.05]" : "border-transparent hover:bg-white/[0.02]")}>
                <span className={cn("mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl transition-colors duration-500",
                  active === i ? "bg-gradient-to-br from-brand via-brand-2 to-brand-3 text-ink" : "bg-white/[0.05] text-zinc-400")}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className={cn("block text-[14px] font-medium transition-colors", active === i ? "text-zinc-50" : "text-zinc-400")}>{title}</span>
                  <span className={cn("grid transition-all duration-500", active === i ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                    <span className="overflow-hidden text-[12.5px] leading-[1.6] text-zinc-400">{body}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-8 font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">Free · self-hosted accounts · your data stays on your server</p>
      </div>
    </aside>
  );
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { status, login, signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const pw = useMemo(() => strength(password), [password]);

  // Already logged in → straight on to where they were going.
  useEffect(() => {
    if (status === "authed" && !done) router.replace(next);
  }, [status, done, next, router]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      // fromTo + clearProps: several of these elements carry CSS transitions,
      // which made a plain from() capture a half-faded end state and leave
      // the submit button invisible.
      gsap.fromTo("[data-auth]", { y: 18, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.06, duration: 0.8, ease: "expo.out", delay: 0.1, clearProps: "transform,opacity" });
    },
    { scope: card, dependencies: [mode] },
  );

  const shake = () => {
    if (!card.current || prefersReducedMotion()) return;
    gsap.fromTo(card.current, { x: 0 }, { keyframes: { x: [-10, 9, -7, 5, -2, 0] }, duration: 0.45, ease: "power2.out" });
  };

  const validate = () => {
    const e: typeof errors = {};
    if (mode === "signup" && !name.trim()) e.name = "Tell us what to call you.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = "Enter a valid email address.";
    if (mode === "signup" ? password.length < 8 : !password) e.password = mode === "signup" ? "Use at least 8 characters." : "Enter your password.";
    if (mode === "signup" && !agreed) e.form = "Please accept the terms to create your account.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    if (!validate()) { shake(); return; }
    setBusy(true);
    try {
      if (mode === "signup") await signup(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      setDone(true);
      celebrate(mode === "signup" ? "Account created" : "Welcome back", { description: mode === "signup" ? "Your workspace is ready." : "Signed in to Churnly." });
      setTimeout(() => router.replace(next), prefersReducedMotion() ? 0 : 650);
    } catch (err) {
      const e = err as AuthError;
      if (e.status === 409) setErrors({ email: e.message });
      else if (e.status === 400 && /password/i.test(e.message)) setErrors({ password: e.message });
      else if (e.status === 400 && /email/i.test(e.message)) setErrors({ email: e.message });
      else setErrors({ form: e.message });
      shake();
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";
  return (
    <div className="grain grid min-h-screen bg-ink text-zinc-50 lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel mode={mode} />

      <main className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_70%_0%,rgba(129,140,248,0.08),transparent_70%)]" />
        <div className="relative flex items-center justify-between">
          <div className="lg:hidden"><Logo /></div>
          <Link href="/" className="group hidden items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-zinc-100 lg:inline-flex">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Back to home
          </Link>
          <span className="text-[13px] text-zinc-500">
            {isSignup ? "Already have an account?" : "New to " + BRAND.name + "?"}{" "}
            <Link href={`/${isSignup ? "login" : "signup"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-brand">
              {isSignup ? "Log in" : "Create an account"}
            </Link>
          </span>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-10">
          <div ref={card} className="w-full max-w-[420px]">
            <div data-auth>
              <h1 className="font-display text-[30px] font-semibold tracking-[-0.035em]">
                {isSignup ? "Create your account" : "Log in to " + BRAND.name}
              </h1>
              <p className="mt-2 text-[14.5px] text-zinc-400">
                {isSignup ? "Free, no card. Your analyses stay private to your account." : "Pick up where you left off — your runs are waiting."}
              </p>
            </div>

            {errors.form && (
              <div data-auth className="mt-6 flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3.5 py-3 text-[13px] text-rose-200" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300" /> {errors.form}
              </div>
            )}

            <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
              {isSignup && (
                <Field id="name" label="Name" icon={User} value={name} onChange={(v) => { setName(v); setErrors((e) => ({ ...e, name: undefined })); }}
                  autoComplete="name" autoFocus error={errors.name} />
              )}
              <Field id="email" label="Work email" icon={Mail} type="email" value={email} inputRef={emailRef}
                onChange={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: undefined, form: undefined })); }}
                autoComplete="email" autoFocus={!isSignup} error={errors.email} />
              <div data-auth="field">
                <Field id="password" label="Password" icon={Lock} type={show ? "text" : "password"} value={password}
                  onChange={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined, form: undefined })); }}
                  autoComplete={isSignup ? "new-password" : "current-password"} error={errors.password}
                  onKeyEvent={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  labelRight={!isSignup && (
                    <button type="button" onClick={() => setShowReset((v) => !v)} aria-expanded={showReset}
                      className="text-[12px] text-zinc-500 underline-offset-4 transition-colors hover:text-brand hover:underline">
                      Forgot password?
                    </button>
                  )}
                  right={
                    <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                      className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  } />
                {capsLock && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-amber-300"><AlertCircle className="h-3.5 w-3.5" />Caps Lock is on</p>
                )}
                {!isSignup && showReset && (
                  <div className="mt-3 flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-[12.5px] leading-[1.6] text-zinc-400">
                    <KeyRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
                    <div>
                      <p className="text-zinc-200">Reset your password</p>
                      <p className="mt-1">{BRAND.name} accounts are self-hosted, so resets are done by whoever runs this server. Ask them to run:</p>
                      <code className="mt-2 block overflow-x-auto rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-300">python -m app.auth reset-password {email.trim() || "you@company.com"}</code>
                    </div>
                  </div>
                )}
                {isSignup && password.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-3" aria-live="polite">
                    <div className="flex flex-1 gap-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className={cn("block h-full origin-left rounded-full transition-transform duration-500 ease-out", STRENGTH_COLORS[pw.score])}
                            style={{ transform: `scaleX(${i < pw.score ? 1 : 0})` }} />
                        </span>
                      ))}
                    </div>
                    <span className="w-20 text-right font-mono text-[11px] text-zinc-400">{pw.label}</span>
                  </div>
                )}
              </div>

              {isSignup && (
                <label data-auth className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-[1.55] text-zinc-400">
                  <span className="relative mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center">
                    <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors((x) => ({ ...x, form: undefined })); }}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-white/20 bg-white/[0.04] transition-colors checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
                    <Check className="pointer-events-none absolute h-3 w-3 text-ink opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3.5} />
                  </span>
                  <span>I agree to use {BRAND.name} responsibly and only upload data I&apos;m allowed to analyse. My data stays on this server.</span>
                </label>
              )}

              <button data-auth type="submit" disabled={busy}
                className={cn("cta-ring group relative mt-2 inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl text-[14.5px] font-semibold transition-all duration-300",
                  done ? "bg-emerald-400 text-ink" : "bg-zinc-50 text-ink hover:bg-white disabled:opacity-80")}>
                {done ? (
                  <><Check className="h-4.5 w-4.5 animate-[pop_0.5s_ease-out]" strokeWidth={3} /> {isSignup ? "Account created" : "Welcome back"}</>
                ) : busy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {isSignup ? "Creating account…" : "Logging in…"}</>
                ) : (
                  <>{isSignup ? "Create account" : "Log in"} <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" /></>
                )}
              </button>
            </form>

            <div data-auth className="my-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-zinc-600">
              <span className="h-px flex-1 bg-white/8" /> or <span className="h-px flex-1 bg-white/8" />
            </div>

            <Link data-auth href="/results/demo"
              className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-all hover:-translate-y-px hover:border-brand/40">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10"><Play className="h-3.5 w-3.5 fill-brand text-brand" /></span>
              <span className="flex-1">
                <span className="block text-[13.5px] font-medium text-zinc-100">Explore the demo first</span>
                <span className="block text-[12px] text-zinc-500">A full analysis on sample data — no account needed</span>
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-zinc-200" />
            </Link>

            {isSignup && (
              <p data-auth className="mt-6 text-center text-[11.5px] leading-[1.6] text-zinc-600">
                Passwords are hashed with scrypt and never stored in plain text. Sessions use a secure, HttpOnly cookie.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
