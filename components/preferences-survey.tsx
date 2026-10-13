"use client";
import { useId, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalysis } from "@/components/analysis-provider";
import type { SkincarePreferences } from "@/lib/skincare-preferences";
import styles from "@/components/skincare-routine.module.css";

export function PreferencesSurvey({ compact = false, disabled = false, editing = false }: { compact?: boolean; disabled?: boolean; editing?: boolean }) {
  const { preferences, hasPreferences, setPreferences, resetPreferences } = useAnalysis();
  const formId = useId();
  const [expanded, setExpanded] = useState(!compact);
  function update<K extends keyof SkincarePreferences>(key: K, value: SkincarePreferences[K]) { setPreferences({ ...preferences, [key]: value }); }
  function toggle<K extends "avoid" | "owned">(key: K, value: SkincarePreferences[K][number]) {
    const current: string[] = preferences[key];
    update(key, (current.includes(value) ? current.filter(item => item !== value) : [...current, value]) as SkincarePreferences[K]);
  }
  return <section className={styles.survey} aria-labelledby={`${formId}-title`}>
    <div className={styles.heading}><div><span className="eyebrow">{compact || editing ? "YOUR PREFERENCES" : "STEP 01 · A 30-SECOND START"}</span><h2 id={`${formId}-title`}>{compact || editing ? "Adjust your routine" : "A routine that fits your day."}</h2></div><SlidersHorizontal size={24}/></div>
    <p>Tell us about comfort, ingredients, and purchases. These answers combine with an accepted supported skin-photo appearance category to select cosmetic catalog matches. Without an accepted category, they shape general care only; neither flow chooses medical treatment.</p>
    {!expanded ? <div className={styles.summary}><span><Check size={17}/>{hasPreferences ? "Preferences saved for this session" : "Using general care basics"}</span><Button variant="outline" size="sm" onClick={() => setExpanded(true)} disabled={disabled}>Edit preferences</Button></div> : <>
      <fieldset className={styles.surveyFields} disabled={disabled}><legend className="visually-hidden">Skincare preferences</legend>
        <label>How does your skin usually feel?<select value={preferences.skinFeel} onChange={e => update("skinFeel", e.target.value as SkincarePreferences["skinFeel"])}><option value="unsure">Not sure / prefer not to say</option><option value="dry">Dry or tight</option><option value="oily">Oily</option><option value="combination">A mix of dry and oily</option><option value="balanced">Generally comfortable</option></select></label>
        <label>Does it react easily to new products?<select value={preferences.sensitivity} onChange={e => update("sensitivity", e.target.value as SkincarePreferences["sensitivity"])}><option value="unsure">Not sure / prefer not to say</option><option value="yes">Yes, often</option><option value="no">Usually no</option></select></label>
        <label>Your purchasing priority<select value={preferences.budget} onChange={e => update("budget", e.target.value as SkincarePreferences["budget"])}><option value="minimal">Keep purchases to a minimum</option><option value="flexible">Open to comparing alternatives</option></select></label>
        <label>Preferred moisturizer feel<select value={preferences.texture} onChange={e => update("texture", e.target.value as SkincarePreferences["texture"])}><option value="any">No preference</option><option value="light">A lighter lotion</option><option value="rich">A richer cream</option></select></label>
        <fieldset className={styles.checkGroup}><legend>Ingredients you want to avoid</legend>{([{value:"fragrance",label:"Fragrance"},{value:"niacinamide",label:"Niacinamide"},{value:"oat",label:"Oat ingredients"}] as const).map(item => <label key={item.value}><input type="checkbox" checked={preferences.avoid.includes(item.value)} onChange={() => toggle("avoid", item.value)}/>{item.label}</label>)}<p>This small catalog cannot screen every allergy. Check the current package with a pharmacist or clinician if you have a known allergy.</p></fieldset>
        <fieldset className={styles.checkGroup}><legend>Basics you already use and tolerate</legend>{([{value:"cleanser",label:"Cleanser"},{value:"moisturizer",label:"Moisturizer"},{value:"sunscreen",label:"Sunscreen"}] as const).map(item => <label key={item.value}><input type="checkbox" checked={preferences.owned.includes(item.value)} onChange={() => toggle("owned", item.value)}/>{item.label}</label>)}<p>Reuse suitable products rather than buying a whole new set.</p></fieldset>
      </fieldset>
      <div className={styles.actions}><Button size="sm" disabled={disabled} onClick={() => { setPreferences(preferences); setExpanded(false); }}>Save preferences <Check size={16}/></Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => { resetPreferences(); setExpanded(false); }}>Skip · use general basics</Button></div>
    </>}
    <p className={styles.privacy}>Optional and held only in this page session. Clearing the session or deleting an image clears these preferences; no survey answers are sent to the inference API.</p>
  </section>;
}
