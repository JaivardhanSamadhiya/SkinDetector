import { ArrowUpRight, Leaf } from "lucide-react";
import type { LifestyleGuidance as LifestyleGuidanceData } from "@/lib/lifestyle-guidance";
import styles from "@/components/skincare-routine.module.css";

const BASIS_LABELS = {
  general: "General skin care",
  survey: "From your survey",
  accepted_appearance: "From the accepted appearance category",
} as const;

export function LifestyleGuidance({ guidance }: { guidance: LifestyleGuidanceData }) {
  return <section className={styles.lifestyle} aria-labelledby="lifestyle-title" data-testid="lifestyle-guidance" data-basis={guidance.basis}>
    <div className={styles.heading}><div><span className="eyebrow">LIFESTYLE & DAILY CARE</span><h3 id="lifestyle-title">Small habits alongside your routine.</h3></div><Leaf size={24} aria-hidden="true"/></div>
    <p>{guidance.explanation}</p>
    {guidance.basis === "review_first" && <div className={styles.habitReview}><strong>{guidance.review.title}</strong><p>{guidance.review.action}</p><a href={guidance.review.source.url} target="_blank" rel="noreferrer">{guidance.review.source.title}<ArrowUpRight size={14}/></a></div>}
    <div className={styles.habitGrid}>{guidance.tips.map((tip) => <article className={styles.habitCard} key={tip.id} data-habit={tip.id} data-basis={tip.basis}>
      <span className={styles.habitBasis}>{BASIS_LABELS[tip.basis]}</span>
      <h4>{tip.title}</h4><p>{tip.action}</p><p className={styles.habitReason}><strong>Why it appears:</strong> {tip.reason}</p>
      <a href={tip.source.url} target="_blank" rel="noreferrer">Read the guidance<ArrowUpRight size={14}/><span className="sr-only">: {tip.source.title}</span></a>
    </article>)}</div>
    {guidance.basis !== "review_first" && <details className={styles.habitReview}><summary>{guidance.review.title}</summary><p>{guidance.review.action}</p><a href={guidance.review.source.url} target="_blank" rel="noreferrer">{guidance.review.source.title}<ArrowUpRight size={14}/></a></details>}
  </section>;
}
