"use client";
import { useId, useState } from "react";
import { ArrowUpRight, Check, Droplets, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useAnalysis } from "@/components/analysis-provider";
import { PreferencesSurvey } from "@/components/preferences-survey";
import { LifestyleGuidance } from "@/components/lifestyle-guidance";
import { buildSkincareRoutine, SKINCARE_PRODUCT_CATALOG, type SkincareProduct, type SkincareRoutineStep } from "@/lib/skincare-routine";
import { buildConditionAwareRoutine, type CareDecision } from "@/lib/condition-aware-routine";
import { buildLifestyleGuidance } from "@/lib/lifestyle-guidance";
import type { SkincarePreferences } from "@/lib/skincare-preferences";
import { selectRoutineProducts, summarizeSelectedPrices } from "@/lib/routine-selection";
import { formatOfferPrice } from "@/lib/product-offers";
import { buildResultGuidance } from "@/lib/result-guidance";
import { Button } from "@/components/ui/button";
import styles from "@/components/skincare-routine.module.css";

/** Explain the actual option, so switching a radio cannot inherit the top pick's texture rationale. */
function productFitReasons(product: SkincareProduct, step: SkincareRoutineStep, preferences: SkincarePreferences, decision?: CareDecision): string[] {
  const facts = SKINCARE_PRODUCT_CATALOG.find(item => item.id === product.id);
  if (!facts) return ["Check the full manufacturer information before choosing this product."];
  const reasons: string[] = [];
  if (preferences.avoid.length && preferences.avoid.every(ingredient => !facts.contains[ingredient])) {
    reasons.push(`Your selected exclusions (${preferences.avoid.join(", ")}) are absent from the checked US ingredient list. Other allergens are not assessed.`);
  }
  if (preferences.sensitivity !== "no" && step.id !== "sunscreen" && !facts.botanicalIngredients) {
    reasons.push("For reported or unknown sensitivity, this example has no botanical extracts in the checked formula. This does not guarantee that you will tolerate it.");
  }
  if (step.id === "moisturizer") {
    const texture = facts.texture === "rich" ? "rich cream" : "light lotion or gel";
    reasons.push(preferences.texture !== "any"
      ? facts.texture === preferences.texture
        ? `The ${texture} matches your selected ${preferences.texture}-texture preference.`
        : `This ${texture} differs from your ${preferences.texture}-texture preference; choosing it is a texture trade-off.`
      : preferences.skinFeel === "dry"
        ? facts.texture === "rich"
          ? "The richer texture follows your self-reported dry skin feel."
          : "A lighter alternative to the rich texture prioritized for your dry skin feel."
        : facts.texture === "rich"
          ? "A richer cream texture if you prefer a heavier feel."
          : "A light texture for your basic routine; you did not request a rich cream.");
  } else if (step.id === "cleanser") {
    reasons.push(facts.id === "cerave-foaming-cleanser"
      ? "The manufacturer markets this foaming formula for normal to oily skin; it contains niacinamide."
      : "A soap-free cleanser with no botanical extracts in the checked ingredient list.");
  } else {
    reasons.push("Meets the catalog's broad-spectrum SPF 30+ and water-resistance criteria. Finish and tolerance still need your own check.");
  }
  const condition = decision?.status === "condition_matched" ? decision.conditionId : undefined;
  if (condition === "acne") reasons.push(step.id === "sunscreen"
    ? "The acne-like category does not establish this sunscreen's acne compatibility; a noncomedogenic claim was not verified."
    : "Eligible under the acne-like appearance policy because the manufacturer labels this example noncomedogenic. This does not establish acne treatment efficacy.");
  else if (condition === "dermatitis") reasons.push(step.id === "sunscreen"
    ? "The dermatitis-like category does not establish tolerance; this sunscreen contains aloe."
    : step.id === "moisturizer" && facts.texture === "light"
      ? "A light-texture compromise: eczema guidance favors a cream or ointment. The appearance category does not confirm eczema."
      : "Eligible under the dermatitis-like appearance policy for simple basic barrier care. This is not a treatment for a confirmed rash diagnosis.");
  else reasons.push("The image result did not select this formula; this is a general-care and survey match.");
  const difference = product.offer && step.product?.offer ? product.offer.priceCents - step.product.offer.priceCents : null;
  if (difference !== null && product.id !== step.product?.id) reasons.push(difference === 0
    ? "The listed package costs the same as the starting choice; compare formula and package size."
    : `Substituting this package ${difference > 0 ? "adds" : "saves"} ${formatOfferPrice(Math.abs(difference))} USD versus the starting choice. Sizes differ; this is a package-cost comparison, not a per-use value claim.`);
  return reasons;
}

export function RoutineRecommendations({ analysisContext = true }: { analysisContext?: boolean }) {
  const { preferences, hasPreferences, result, productChoices, chooseProduct } = useAnalysis();
  const [editing, setEditing] = useState(false);
  const choiceId = useId();
  const jointSelection = analysisContext ? buildConditionAwareRoutine(preferences, result) : null;
  const startingRoutine = jointSelection?.routine ?? buildSkincareRoutine(preferences);
  const routine = selectRoutineProducts(startingRoutine, productChoices);
  const prices = summarizeSelectedPrices(routine.steps);
  const capCents = routine.budgetSelection?.capCents ?? Math.round((preferences.totalBudgetUsd ?? 50) * 100);
  const budgetStatus = !prices.complete ? "incomplete_catalog" : prices.subtotalCents <= capCents ? "within_budget" : "over_budget";
  const guidance = analysisContext && result?.model.supported_image_type === "dermoscopic" ? buildResultGuidance(result) : null;
  const matched = jointSelection?.decision.status === "condition_matched";
  const clinicalPhoto = result?.model.supported_image_type === "clinical_photo";
  const habits = buildLifestyleGuidance(preferences, jointSelection?.decision);
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
    <div className={styles.topMatches} data-testid="top-catalog-matches">
      <div><span className="eyebrow">YOUR THREE CATEGORY PICKS</span><h3>Top matches in our small catalog.</h3><p>One starting option per missing step, chosen together using care criteria, survey preferences, and your {formatOfferPrice(capCents)} USD cap. “Top” describes this catalog match; comparative effectiveness and individual tolerance have not been established.</p></div>
      <div className={styles.matchSummary}>{startingRoutine.steps.map(step => <a key={step.id} href={`#routine-${step.id}-options`} className={styles.matchSummaryCard} data-top-match={step.product?.id ?? (step.reuseOwned ? "owned" : "none")}>
        <span>{step.id}</span><strong>{step.reuseOwned ? "Keep your tolerated basic" : step.product ? `${step.product.brand} ${step.product.name}` : "No verified catalog match"}</strong><small>{step.reuseOwned ? "No duplicate purchase" : step.product?.offer ? `${formatOfferPrice(step.product.offer.priceCents)} USD · ${step.product.offer.size}` : "Use the category guidance"}</small><span className={styles.matchSummaryLink}>See reasoning & options <ArrowUpRight size={14}/></span>
      </a>)}</div>
    </div>
    <div className={styles.priceSummary} data-testid="routine-subtotal" aria-live="polite" aria-atomic="true">
      <div><span className="eyebrow">YOUR SELECTED COMBINATION · US PRICE SNAPSHOTS</span><h3>{prices.complete ? formatOfferPrice(prices.subtotalCents) : "Complete price unavailable"} {prices.complete && <small>USD item subtotal</small>}</h3><p>{prices.itemCount ? `One package for each of ${prices.itemCount} selected missing steps.` : "No new items selected."} Owned basics add no new item cost.</p><p data-testid="routine-budget-status" data-status={budgetStatus}><strong>{!prices.complete ? "Budget fit cannot be confirmed." : budgetStatus === "within_budget" ? `Within your ${formatOfferPrice(capCents)} USD budget · ${formatOfferPrice(capCents - prices.subtotalCents)} remaining before extras.` : `${formatOfferPrice(prices.subtotalCents - capCents)} USD over your ${formatOfferPrice(capCents)} budget.`}</strong></p></div>
      <p>Choose one option per missing step below. Prices were checked on 12 October 2026; they are not live quotes. Tax and delivery are excluded, and different stores may charge separate delivery fees. Recheck price, seller, size, stock, and local ingredients before buying.</p>
    </div>
    {startingRoutine.budgetSelection?.status === "over_budget" && <div className={styles.resultContext} data-testid="routine-no-budget-fit"><strong>No complete eligible catalog combination fits this cap.</strong><p>The lowest listed package subtotal is {formatOfferPrice(startingRoutine.budgetSelection.minimumSubtotalCents!)} USD. The starting picks show that combination for comparison; no step was dropped and no ingredient exclusion was relaxed to make the total look affordable. Keep tolerated owned basics, compare current local options, or change your cap if you choose.</p></div>}
    <details className={styles.references}><summary>How the starting combination is ranked</summary><p>First, remove products that contain your selected avoided ingredients and apply any accepted appearance criteria. Preserve owned basics. Rank the remaining products by documented formula traits and your self-reported skin feel, sensitivity, and texture preference. Compare {startingRoutine.budgetSelection?.eligibleBasketCount ?? 0} complete eligible catalog combinations: within the cap, prefer the lowest sum of category preference ranks, then lower package cost. If none fits, show the lowest-cost complete combination. A rank describes these rules, not treatment effectiveness; an alternative may make a disclosed texture trade-off.</p><p>This is a small US catalog. Prices are package snapshots, not live quotes or a comparison of the whole market. Your manual choices update the subtotal and budget status immediately.</p></details>
    <div className={styles.productGrid}>{routine.steps.map((step, index) => {
      const startingStep = startingRoutine.steps[index];
      const options = startingStep.product ? [startingStep.product, ...startingStep.alternatives] : [];
      return <article className={styles.productCard} key={step.id} data-routine-step={step.id} id={`routine-${step.id}-options`}>
        <div className={styles.stepTop}><span>0{index + 1}</span><span>{step.when}</span></div><h3>{step.title}</h3><p>{step.guidance}</p><div className={styles.reason}><strong>{startingStep.product ? `Why ${startingStep.product.brand} ${startingStep.product.name} is the starting match` : "Why this step is included"}</strong><p>{startingStep.reason}</p>{startingStep.budgetReason && <p>{startingStep.budgetReason}</p>}</div>
        {step.reuseOwned ? <div className={styles.reuse}>✓ Keep your existing {step.id}, if it still suits you and meets the guidance above.</div> : options.length ? <fieldset className={styles.options}><legend>Choose a {step.id} example</legend>{options.map((product, optionIndex) => <div className={`${styles.example} ${step.product?.id === product.id ? styles.selectedExample : ""}`} key={product.id} data-product-option={product.id}>
          <div className={styles.optionBadges}><span className={optionIndex === 0 ? styles.topMatchBadge : styles.alternativeBadge}>{optionIndex === 0 ? "Top catalog match" : "Alternative"}</span><span className={styles.alternativeBadge}>Preference rank {(startingStep.rankedProductIds?.indexOf(product.id) ?? optionIndex) + 1}</span>{step.product?.id === product.id && <span className={styles.selectedBadge}><Check size={12} aria-hidden="true"/>Selected</span>}</div>
          <label className={styles.optionLabel}><input type="radio" name={`${choiceId}-${step.id}`} checked={step.product?.id === product.id} onChange={() => chooseProduct(step.id, product.id)} aria-label={`Choose ${product.brand} ${product.name}`}/><span>{product.brand} {product.name}</span></label>
          <p>{product.description}</p><p className={styles.ingredient}>{product.ingredientNote}</p>
          <div className={styles.productFit}><strong>How this option fits</strong><ul>{productFitReasons(product, startingStep, preferences, jointSelection?.decision).map(reason => <li key={reason}>{reason}</li>)}</ul></div>
          {product.offer ? <><div className={styles.offer}><strong>{formatOfferPrice(product.offer.priceCents)} <small>USD</small></strong><span>{product.offer.size} · {product.offer.seller}</span></div><a className={styles.shopLink} href={product.offer.url} target="_blank" rel="noreferrer">View at {product.offer.seller} <ArrowUpRight size={15}/></a><span className={styles.verified}>Price snapshot {product.offer.checkedDate} · tax & delivery extra</span></> : <p className={styles.ingredient}>Price not verified. Check the manufacturer’s shopping options.</p>}
          <a href={product.url} target="_blank" rel="noreferrer">Check manufacturer details <ArrowUpRight size={14}/></a><span className={styles.verified}>US ingredient information checked {product.sourceDate}</span>
        </div>)}{options.length === 1 && <p className={styles.ingredient}>Only one eligible catalog example; no comparison between products was possible. Your exclusions are kept even when they reduce the options.</p>}</fieldset> : <div className={styles.reuse}>No verified match in this small catalog. Use the category guidance and check options with a pharmacist or clinician.</div>}
      </article>;
    })}</div>
    <div className={styles.notes}><h3>Before adding anything new</h3><ul>{(analysisContext ? routine.notes : routine.notes.slice(1)).map(note => <li key={note}>{note}</li>)}</ul><p>No affiliate links, purchase flow, or claim of a medically optimal combination. Budget ranking uses these dated US listings only; formulas and regional availability can change.</p></div>
    <div className={styles.actions}>{analysisContext ? <Button size="sm" variant="outline" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="routine-edit"><SlidersHorizontal size={16}/>{editing ? "Close preferences" : "Adjust preferences"}</Button> : <Button asChild size="sm" variant="outline"><a href="#routine-preferences"><SlidersHorizontal size={16}/>Edit preferences above</a></Button>}<span className={styles.privacy}>Preferences reset the starting choices. Option changes update your combination immediately.</span></div>
    {analysisContext && editing && <div id="routine-edit"><PreferencesSurvey editing/></div>}
    <LifestyleGuidance guidance={habits}/>
    <details className={styles.references}><summary>Read the guidance and product-selection sources</summary>{routine.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title} <ArrowUpRight size={14}/></a>)}</details>
  </section>;
}
