"use client";
import { useState } from "react";
import { Wallet } from "lucide-react";
import { useAnalysis } from "@/components/analysis-provider";
import { buildSkincareRoutine, type SkincareRoutineStep } from "@/lib/skincare-routine";
import { calculateRoutineBudget, formatBudgetMoney, ROUTINE_CURRENCIES, type RoutineCurrency } from "@/lib/routine-budget";
import styles from "@/components/routine-planner.module.css";
import { selectRoutineProducts } from "@/lib/routine-selection";

export function RoutineBudget() {
  const { preferences, productChoices } = useAnalysis();
  const steps = selectRoutineProducts(buildSkincareRoutine(preferences), productChoices).steps;
  const [currency, setCurrency] = useState<RoutineCurrency>("USD");
  const signature = steps.map(step => step.reuseOwned ? `${step.id}:reuse` : `${step.id}:${step.product?.id ?? "unmatched"}`).join("|");
  return <section className={styles.budget} aria-labelledby="budget-title" data-testid="routine-budget">
    <div className={styles.heading}><div><span className="eyebrow">OPTIONAL · BEFORE YOU BUY</span><h2 id="budget-title">Check your spending plan.</h2></div><Wallet size={25}/></div>
    <p>Enter the total item prices and fees quoted by your chosen retailer, in one currency. We add only examples for the steps you don’t already own; this is a manual calculation, not a retailer feed or a cheapest-basket search.</p>
    <label className={styles.currency}>Currency<select aria-label="Currency" value={currency} onChange={event => setCurrency(event.target.value as RoutineCurrency)}>{ROUTINE_CURRENCIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <p className={styles.hint}>Changing currency or selected product examples clears all amounts. No currency conversion is performed. Enter 0 for a confirmed zero fee.</p>
    <QuoteForm key={`${currency}|${signature}`} currency={currency} steps={steps}/>
  </section>;
}

function QuoteForm({ currency, steps }: { currency: RoutineCurrency; steps: SkincareRoutineStep[] }) {
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const [cap, setCap] = useState("");
  const [tax, setTax] = useState("");
  const [delivery, setDelivery] = useState("");
  const result = calculateRoutineBudget({ currency, steps, quotes, cap, tax, delivery });
  const money = (value: number) => formatBudgetMoney(value, currency);
  function amountField(label: string, value: string, setValue: (value: string) => void, help?: string) {
    return <label className={styles.amount}>{label}<div className={styles.moneyInput}><span aria-hidden="true">{currency}</span><input type="text" inputMode="decimal" autoComplete="off" maxLength={8} value={value} onChange={event => setValue(event.target.value)} aria-label={label}/></div>{help && <small>{help}</small>}</label>;
  }
  return <>
    <div className={styles.quoteList}>{steps.map(step => <div className={styles.quoteRow} key={step.id}>
      {step.reuseOwned ? <><strong>{step.title}</strong><span className={styles.reuse}>Reuse your existing product · no new item cost</span></> : step.product ? amountField(`Price for ${step.product.brand} ${step.product.name}`, quotes[step.product.id] ?? "", value => setQuotes(previous => ({ ...previous, [step.product!.id]: value })), "Use the item price for the quantity you intend to purchase; exclude tax and delivery here.") : <><strong>{step.title}</strong><span>No verified catalog match. The basket will stay incomplete.</span></>}
    </div>)}</div>
    <div className={styles.fees}>{amountField("Sales tax amount", tax, setTax, "Enter the amount, not the tax percentage.")}{amountField("Delivery amount", delivery, setDelivery)}{amountField("Spending limit", cap, setCap)}</div>
    <div className={`${styles.status} ${result.status === "complete" && !result.withinBudget ? styles.over : ""}`} aria-live="polite" aria-atomic="true" data-testid="budget-status">
      {result.status === "complete" ? <><span className="eyebrow">BASED ON YOUR ENTERED QUOTES</span><h3>{result.withinBudget ? "Within your entered limit" : "Above your entered limit"}</h3><dl><div><dt>Missing-step items</dt><dd>{money(result.subtotalCents)}</dd></div><div><dt>Total with tax & delivery</dt><dd>{money(result.totalCents)}</dd></div><div><dt>Your limit</dt><dd>{money(result.capCents)}</dd></div><div><dt>{result.withinBudget ? "Room in your limit" : "Amount above your limit"}</dt><dd>{money(Math.abs(result.differenceCents))}</dd></div></dl><p>{result.withinBudget ? "The quoted basket fits the amount you entered. Recheck retailer totals and labels before deciding whether to buy." : "Consider keeping your current tolerated basics or comparing current quotes for the missing steps. SkinSnap has not found or verified a cheaper alternative."}</p></> : <><h3>{result.status === "invalid" ? "Check the entered amounts" : "Your budget check is incomplete"}</h3><p>We can compare the total only when every required quote, both fees, and your spending limit are supplied.</p><ul>{result.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></>}
    </div>
    <p className={styles.hint}>Manufacturer links above describe products; they do not verify your quote, retailer, availability, or suitability. No affiliate relationship or checkout is active.</p>
  </>;
}
