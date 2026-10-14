"use client";
import { useId, useState } from "react";
import { ArrowUpRight, Droplets, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useAnalysis } from "@/components/analysis-provider";
import { PreferencesSurvey } from "@/components/preferences-survey";
import { buildSkincareRoutine } from "@/lib/skincare-routine";
import { buildConditionAwareRoutine } from "@/lib/condition-aware-routine";
import { selectRoutineProducts, summarizeSelectedPrices } from "@/lib/routine-selection";
import { formatOfferPrice } from "@/lib/product-offers";
import { buildResultGuidance } from "@/lib/result-guidance";
import { Button } from "@/components/ui/button";
import styles from "@/components/skincare-routine.module.css";

export function RoutineRecommendations({ analysisContext = true }: { analysisContext?: boolean }) {
  const { preferences, hasPreferences, result, productChoices, chooseProduct } = useAnalysis();
  const [editing, setEditing] = useState(false);
  const choiceId = useId();
  const jointSelection = analysisContext ? buildConditionAwareRoutine(preferences, result) : null;
  const startingRoutine = jointSelection?.routine ?? buildSkincareRoutine(preferences);
  const routine = selectRoutineProducts(startingRoutine, productChoices);
  const prices = summarizeSelectedPrices(routine.steps);
  const guidance = analysisContext && result?.model.supported_image_type === "dermoscopic" ? buildResultGuidance(result) : null;
  const matched = jointSelection?.decision.status === "condition_matched";
  const clinicalPhoto = result?.model.supported_image_type === "clinical_photo";
  return <section className={styles.routine} aria-labelledby="routine-title">
    <div className={styles.heading}><div><span className="eyebrow">EVERYDAY CARE · {matched ? "IMAGE + YOUR SURVEY" : hasPreferences ? "BASED ON YOUR SURVEY" : "GENERAL BASICS"}</span><h2 id="routine-title">{matched ? "Your selected skincare combination." : "Your skincare starting point."}</h2></div><Droplets size={25}/></div>
    {jointSelection && <div className={styles.resultContext} data-testid="condition-match-decision" data-status={jointSelection.decision.status} data-condition-id={jointSelection.decision.conditionId ?? "none"}>
      <span className="eyebrow">HOW YOUR COMBINATION WAS SELECTED</span><h3>{jointSelection.decision.title}</h3><p>{jointSelection.decision.explanation}</p><ul>{jointSelection.decision.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{jointSelection.decision.source && <a href={jointSelection.decision.source.url} target="_blank" rel="noreferrer">{jointSelection.decision.source.title} <ArrowUpRight size={14}/></a>}
    </div>}
    {guidance && <div className={styles.resultContext} data-testid="result-care-guidance" data-label-id={guidance.labelId ?? "none"}>
      <span className="eyebrow">YOUR ANALYSIS · EDUCATIONAL NEXT STEP</span><h3>{guidance.title}</h3><p>{guidance.description}</p><p><strong>{guidance.nextStep}</strong></p><a href={guidance.source.url} target="_blank" rel="noreferrer">{guidance.source.title} <ArrowUpRight size={14}/></a>
    </div>}
    <p>{routine.summary}</p>
    <div className={styles.boundary}><strong>{matched ? "A catalog match using your image pattern and preferences." : analysisContext ? clinicalPhoto ? "General care from your survey; this photo did not select products." : "For your everyday routine, independent of the lesion result." : "General care, chosen from your preferences."}</strong><p>{matched ? "The accepted appearance category changes formulation criteria and the starting moisturizer choice. This small catalog cannot establish the medically best products or predict individual tolerance. " : analysisContext ? "No supported appearance category was accepted for cosmetic matching. Product choices use your survey; no treatment for the photographed spot is selected. " : "Product examples are general cosmetic guidance, and personal tolerance can vary. "}Changing, bleeding, painful, or non-healing spots need professional evaluation; trying a routine must not delay it.</p></div>
    <div className={styles.dayPlan}><span><Sun size={18}/><strong>Morning</strong> Gentle cleanse if needed → moisturize → sunscreen</span><span><Moon size={18}/><strong>Evening</strong> Gentle cleanse → moisturize</span></div>
    <div className={styles.priceSummary} data-testid="routine-subtotal" aria-live="polite" aria-atomic="true">
      <div><span className="eyebrow">YOUR SELECTED COMBINATION · US PRICE SNAPSHOTS</span><h3>{prices.complete ? formatOfferPrice(prices.subtotalCents) : "Complete price unavailable"} {prices.complete && <small>USD item subtotal</small>}</h3><p>{prices.itemCount ? `One package for each of ${prices.itemCount} selected missing steps.` : "No new items selected."} Owned basics add no new item cost.</p></div>
      <p>Choose one option per missing step below. Prices were checked on 12 October 2026; they are not live quotes. Tax and delivery are excluded, and different stores may charge separate delivery fees. Recheck price, seller, size, stock, and local ingredients before buying.</p>
    </div>
    <div className={styles.productGrid}>{routine.steps.map((step, index) => {
      const startingStep = startingRoutine.steps[index];
      const options = startingStep.product ? [startingStep.product, ...startingStep.alternatives] : [];
      return <article className={styles.productCard} key={step.id} data-routine-step={step.id}>
        <div className={styles.stepTop}><span>0{index + 1}</span><span>{step.when}</span></div><h3>{step.title}</h3><p>{step.guidance}</p><div className={styles.reason}><strong>Why this was the starting choice</strong><p>{step.reason}</p></div>
        {step.reuseOwned ? <div className={styles.reuse}>✓ Keep your existing {step.id}, if it still suits you and meets the guidance above.</div> : options.length ? <fieldset className={styles.options}><legend>Choose a {step.id} example</legend>{options.map(product => <div className={`${styles.example} ${step.product?.id === product.id ? styles.selectedExample : ""}`} key={product.id} data-product-option={product.id}>
          <label className={styles.optionLabel}><input type="radio" name={`${choiceId}-${step.id}`} checked={step.product?.id === product.id} onChange={() => chooseProduct(step.id, product.id)} aria-label={`Choose ${product.brand} ${product.name}`}/><span>{product.brand} {product.name}</span></label>
          <p>{product.description}</p><p className={styles.ingredient}>{product.ingredientNote}</p>
          {product.offer ? <><div className={styles.offer}><strong>{formatOfferPrice(product.offer.priceCents)} <small>USD</small></strong><span>{product.offer.size} · {product.offer.seller}</span></div><a className={styles.shopLink} href={product.offer.url} target="_blank" rel="noreferrer">View at {product.offer.seller} <ArrowUpRight size={15}/></a><span className={styles.verified}>Price snapshot {product.offer.checkedDate} · tax & delivery extra</span></> : <p className={styles.ingredient}>Price not verified. Check the manufacturer’s shopping options.</p>}
          <a href={product.url} target="_blank" rel="noreferrer">Check manufacturer details <ArrowUpRight size={14}/></a><span className={styles.verified}>US ingredient information checked {product.sourceDate}</span>
        </div>)}{options.length === 1 && <p className={styles.ingredient}>One matching example in this small catalog. Your exclusions are kept even when they reduce the options.</p>}</fieldset> : <div className={styles.reuse}>No verified match in this small catalog. Use the category guidance and check options with a pharmacist or clinician.</div>}
      </article>;
    })}</div>
    <div className={styles.notes}><h3>Before adding anything new</h3><ul>{(analysisContext ? routine.notes : routine.notes.slice(1)).map(note => <li key={note}>{note}</li>)}</ul><p>No affiliate links, purchase flow, price ranking, or claim of a medically optimal combination. Formulas and regional availability can change.</p></div>
    <div className={styles.actions}>{analysisContext ? <Button size="sm" variant="outline" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="routine-edit"><SlidersHorizontal size={16}/>{editing ? "Close preferences" : "Adjust preferences"}</Button> : <Button asChild size="sm" variant="outline"><a href="#routine-preferences"><SlidersHorizontal size={16}/>Edit preferences above</a></Button>}<span className={styles.privacy}>Preferences reset the starting choices. Option changes update your combination immediately.</span></div>
    {analysisContext && editing && <div id="routine-edit"><PreferencesSurvey editing/></div>}
    <details className={styles.references}><summary>Read the guidance and product-selection sources</summary>{routine.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title} <ArrowUpRight size={14}/></a>)}</details>
  </section>;
}
