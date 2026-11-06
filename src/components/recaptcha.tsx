"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
      reset: (id?: number) => void;
    };
  }
}

const SCRIPT = "https://www.google.com/recaptcha/api.js?render=explicit&hl=pt-BR";
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => window.grecaptcha?.ready(() => resolve());
    if (window.grecaptcha) return done();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const s = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT, async: true });
    s.addEventListener("load", done);
    s.addEventListener("error", () => reject(new Error("recaptcha_load_failed")));
    if (!existing) document.head.appendChild(s);
  });
}

/**
 * "Não sou um robô" check (Google reCAPTCHA v2). Adds the
 * `g-recaptcha-response` field to the surrounding form; the server verifies
 * it. `resetKey` changes after each submission, since tokens are single-use.
 * Renders nothing while no site key is configured.
 */
export function Recaptcha({ resetKey }: { resetKey: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<number | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.grecaptcha || widget.current !== null) return;
        widget.current = window.grecaptcha.render(box.current, { sitekey: SITE_KEY, theme: "dark" });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (widget.current !== null && window.grecaptcha) window.grecaptcha.reset(widget.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-[78px]" />;
}
