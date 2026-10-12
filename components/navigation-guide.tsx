"use client";

import Link from "next/link";
import { useId, useRef, type KeyboardEvent } from "react";
import { ArrowUpRight, ChevronDown, CircleHelp, X } from "lucide-react";
import styles from "./navigation-guide.module.css";

/** A non-modal disclosure keeps the guide available without trapping focus. */
export function NavigationGuide() {
  const panelId = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  function close(returnFocus = false) {
    if (disclosure.current) disclosure.current.open = false;
    if (returnFocus) summary.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key === "Escape" && disclosure.current?.open) {
      event.preventDefault();
      close(true);
    }
  }

  return (
    <details ref={disclosure} className={styles.guide} onKeyDown={handleKeyDown}>
      <summary ref={summary} className={styles.summary} aria-controls={panelId}>
        <CircleHelp size={17} aria-hidden="true" />
        <span>Quick guide</span>
        <ChevronDown size={13} className={styles.chevron} aria-hidden="true" />
      </summary>
      <section id={panelId} className={styles.panel} aria-label="SkinSnap navigation guide">
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>YOUR WAY AROUND</p>
            <h2>Start here. Explore at your pace.</h2>
          </div>
          <button type="button" className={styles.close} aria-label="Close quick guide" onClick={() => close(true)}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <ol className={styles.steps}>
          <li>
            <span className={styles.number} aria-hidden="true">01</span>
            <h3>Share your preferences</h3>
            <p>Open <Link href="/analysis/" onClick={() => close()}>Skin analysis</Link> and answer the short survey. Your constraints shape the general care routine.</p>
          </li>
          <li>
            <span className={styles.number} aria-hidden="true">02</span>
            <h3>Choose a supported image</h3>
            <p>Try a labelled demo or upload a dermoscopic image you have permission to use, confirm its type, and select Analyze image. Smartphone portraits are unsupported.</p>
          </li>
          <li>
            <span className={styles.number} aria-hidden="true">03</span>
            <h3>Read the result and routine</h3>
            <p>Review model scores, quality and uncertainty. Your general care suggestions appear automatically, based on your survey. They do not treat the predicted lesion category.</p>
          </li>
        </ol>
        <div className={styles.destinations}>
          <Link href="/conditions/" onClick={() => close()}><span><strong>Skin library</strong><small>Learn about conditions and when to seek evaluation.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/skincare/" onClick={() => close()}><span><strong>Everyday care</strong><small>Explore cleansers, moisturizers and sunscreen.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/how-it-works/" onClick={() => close()}><span><strong>How it works</strong><small>Understand the upload and analysis workflow.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/research/" onClick={() => close()}><span><strong>Our research</strong><small>Inspect measured results and model limitations.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/startup/" onClick={() => close()}><span><strong>Startup direction</strong><small>See the proposed business and validation plan.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/about/" onClick={() => close()}><span><strong>About & privacy</strong><small>Check image handling and project provenance.</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
        <p className={styles.note}>This is a research and education tool, not a diagnosis. On a small screen, use the menu icon for page links. Press Escape or use the close button to dismiss this guide.</p>
      </section>
    </details>
  );
}
