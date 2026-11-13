"use client";
// Clay "all posts" link. The fill is goopUI's goo body, tinted with the
// blog's accent, on the subtle preset: a squish and a short drip, no
// page-wide splash. Before the engine attaches, the same color is a
// plain background so the link is never empty.

import { attachGoop } from "@goopui/core";
import { useEffect, useRef } from "react";

type Props = {
  href: string;
  label: string;
};

export function GoopCta({ href, label }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = attachGoop(el, {
      preset: "subtle",
      restingDrips: 0,
      splash: "off",
      puddles: false,
      taffy: false,
      reach: false,
      gloss: 0.15,
      labelRide: 0.4,
      dripLength: 12,
      dripSize: 6,
      fallDistance: 22,
    });
    el.dataset.goopActive = "true";
    return () => {
      handle.destroy();
      delete el.dataset.goopActive;
    };
  }, []);

  return (
    <a ref={ref} href={href} className="goop-cta">
      <span data-goop-label="">
        {label}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </span>
    </a>
  );
}

export default GoopCta;
