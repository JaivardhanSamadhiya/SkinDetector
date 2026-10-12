"use client";
import { useState } from "react";
import { ArrowUpRight, Droplets, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useAnalysis } from "@/components/analysis-provider";
import { PreferencesSurvey } from "@/components/preferences-survey";
import { buildSkincareRoutine } from "@/lib/skincare-routine";
import { Button } from "@/components/ui/button";
import styles from "@/components/skincare-routine.module.css";

export function RoutineRecommendations() {
  const { preferences, hasPreferences } = useAnalysis();
  const [editing, setEditing] = useState(false);
  const routine = buildSkincareRoutine(preferences);
  return <section className={styles.routine} aria-labelledby="routine-title">
    <div className={styles.heading}><div><span className="eyebrow">EVERYDAY CARE · {hasPreferences ? "BASED ON YOUR SURVEY" : "GENERAL BASICS"}</span><h2 id="routine-title">Your skincare starting point.</h2></div><Droplets size={25}/></div>
    <p>{routine.summary}</p>
    <div className={styles.boundary}><strong>For your everyday routine, independent of the lesion result.</strong><p>These products do not diagnose or treat the photographed lesion. Changing, bleeding, painful, or non-healing spots need professional evaluation; trying a routine must not delay it.</p></div>
    <div className={styles.dayPlan}><span><Sun size={18}/><strong>Morning</strong> Gentle cleanse if needed → moisturize → sunscreen</span><span><Moon size={18}/><strong>Evening</strong> Gentle cleanse → moisturize</span></div>
    <div className={styles.productGrid}>{routine.steps.map((step, index) => <article className={styles.productCard} key={step.id} data-routine-step={step.id}>
      <div className={styles.stepTop}><span>0{index + 1}</span><span>{step.when}</span></div><h3>{step.title}</h3><p>{step.guidance}</p><div className={styles.reason}><strong>Why this fits</strong><p>{step.reason}</p></div>
      {step.reuseOwned ? <div className={styles.reuse}><CheckMark/>Keep your existing {step.id}, if it still suits you and meets the guidance above.</div> : step.product ? <div className={styles.example}><span className={styles.productLabel}>PRODUCT EXAMPLE</span><h4>{step.product.brand} {step.product.name}</h4><p>{step.product.description}</p><p className={styles.ingredient}>{step.product.ingredientNote}</p><a href={step.product.url} target="_blank" rel="noreferrer">Check manufacturer details <ArrowUpRight size={15}/></a><span className={styles.verified}>US formulation checked {step.product.sourceDate}</span>{preferences.budget === "flexible" && step.alternatives?.length ? <details><summary>Compare another option</summary>{step.alternatives.map(product => <a key={product.id} href={product.url} target="_blank" rel="noreferrer">{product.brand} {product.name} <ArrowUpRight size={14}/></a>)}</details> : null}</div> : <div className={styles.reuse}>No verified match in this small catalog. Use the category guidance and check options with a pharmacist or clinician.</div>}
    </article>)}</div>
    <div className={styles.notes}><h3>Before adding anything new</h3><ul>{routine.notes.map(note => <li key={note}>{note}</li>)}</ul><p>No affiliate links, purchase flow, price ranking, or claim of a medically optimal combination. Formulas and regional availability can change.</p></div>
    <div className={styles.actions}><Button size="sm" variant="outline" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="routine-edit"><SlidersHorizontal size={16}/>{editing ? "Close preferences" : "Adjust preferences"}</Button><span className={styles.privacy}>Changes update the routine immediately.</span></div>
    {editing && <div id="routine-edit"><PreferencesSurvey editing/></div>}
    <details className={styles.references}><summary>Read the guidance and product-selection sources</summary>{routine.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title} <ArrowUpRight size={14}/></a>)}</details>
  </section>;
}
function CheckMark() { return <span aria-hidden="true">✓ </span>; }
