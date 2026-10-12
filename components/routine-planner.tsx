"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ListChecks, ShieldCheck, Trash2 } from "lucide-react";
import { useAnalysis } from "@/components/analysis-provider";
import { PreferencesSurvey } from "@/components/preferences-survey";
import { RoutineRecommendations } from "@/components/routine-recommendations";
import { RoutineBudget } from "@/components/routine-budget";
import { Button } from "@/components/ui/button";
import styles from "@/components/routine-planner.module.css";

export function RoutinePlanner() {
  const { clear } = useAnalysis();
  const [revision, setRevision] = useState(0);
  function clearSession() { clear(); setRevision(value => value + 1); }
  return <div className={`container page-content ${styles.planner}`}>
    <div className="page-heading"><span className="eyebrow">YOUR BASICS · YOUR CHOICES</span><h1>A simpler routine.<br/>A clearer shopping list.</h1><p>Start with what you already use. Find examples for the gaps, then check your own price quotes against a spending limit.</p></div>
    <div className={styles.intro}><ListChecks size={27}/><div><strong>No skin image needed.</strong><p>Answer the short survey, review your morning and evening basics, and enter local prices if you want a spending check. These are preference matches, not diagnoses or treatment recommendations.</p></div></div>
    <div key={revision} className={styles.sections}><div id="routine-preferences"><PreferencesSurvey/></div><RoutineRecommendations analysisContext={false}/><RoutineBudget/></div>
    <div className={styles.session}><ShieldCheck size={21}/><p>Preferences and amounts stay in memory for this page session. Clearing the session also deletes any selected image and analysis result. Nothing here checks live prices, stock, or completes a purchase.</p><Button variant="outline" size="sm" onClick={clearSession}><Trash2 size={15}/>Clear this session</Button></div>
    <div className={styles.footer}><Link href="/skincare/">Read everyday care guidance <ArrowUpRight size={15}/></Link><Link href="/research/">Explore the separate research model <ArrowUpRight size={15}/></Link></div>
  </div>;
}
