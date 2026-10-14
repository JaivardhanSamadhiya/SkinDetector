import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, Fingerprint, Lightbulb, MoveRight, PackageCheck, ShieldCheck, Store, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow, SafetyNote } from "@/components/shared";
import styles from "./startup.module.css";

export const metadata: Metadata = {
  title: "The startup idea",
  description: "A proposed skincare shopping assistant for independent retailers: customer constraints, a clear basket, and a business hypothesis to test.",
};

const milestones = [
  { number: "01", title: "Find a costly shopping problem", target: "5 merchant interviews", body: "Ask independent multi-brand skincare stores about product-selection enquiries, their existing quizzes, support time, purchasing authority, and whether a different tool would earn its fee." },
  { number: "02", title: "Observe real decisions", target: "20 adult beginner shoppers", body: "Use a merchant-approved catalog to compare the current shopping flow with the prototype. Observe completion, decision time, budget comprehension, and whether shoppers understand that a routine is not diagnosis." },
  { number: "03", title: "Test willingness to pay", target: "2 contingent paid-pilot commitments", body: "Ask for specific commitments at the proposed price, contingent on a usable integration. A conversation or letter of intent is not a paying customer, a contract, or revenue." },
  { number: "04", title: "Measure value before scaling", target: "A properly planned storefront experiment", body: "After integration, randomize eligible sessions against the store's current flow. Predefine the sample and decision rule; measure incremental gross margin, support time, returns, and misunderstanding—not just clicks or basket size." },
];

export default function StartupPage() {
  return (
    <div className={"container " + styles.page}>
      <section className={styles.hero} aria-labelledby="startup-title">
        <div>
          <Eyebrow>THE STARTUP IDEA</Eyebrow>
          <h1 id="startup-title">A simpler routine.<br /><em>A clearer purchase.</em></h1>
          <p className={styles.lead}>Build toward combining skin-photo research appearances with preferences, explaining a small catalog selection, and helping shoppers use what they own.</p>
          <p className={styles.status}><span /> Working research prototype · Retail business unvalidated</p>
          <p className={styles.quietNote}>The current photo baseline failed its fixed numeric minimums. A data audit also required cohort correction with previously examined test overlap, so photo classification remains unavailable. Joint rules need a stronger model and new independent evaluation before real uploads can activate them.</p>
          <div className={styles.actions}>
            <Button asChild><Link href="/analysis/">Try image + preferences <MoveRight size={17} /></Link></Button>
            <Link className="text-link" href="#business-model">Explore the business <ArrowUpRight size={17} /></Link>
          </div>
        </div>
        <aside className={styles.buyerCard} aria-label="Initial customer hypothesis">
          <Store size={33} strokeWidth={1.4} />
          <span className={styles.smallLabel}>ONE INITIAL BUYER</span>
          <h2>Independent skincare retailers</h2>
          <p>Small online stores with a multi-brand catalog and shoppers who need help choosing a simple routine.</p>
          <div className={styles.buyerDetail}><strong>The proposed payer</strong><span>The retailer pays for a storefront assistant only if it earns its cost through measured shopping value or support savings.</span></div>
          <div className={styles.buyerDetail}><strong>The shopper</strong><span>An adult beginner, using the assistant free to explore everyday care. A survey-only flow is also available.</span></div>
        </aside>
      </section>

      <section className={styles.problemSection} aria-labelledby="problem-title">
        <div><Eyebrow>THE PROBLEM TO VALIDATE</Eyebrow><h2 id="problem-title">A full shelf.<br />An unfinished decision.</h2></div>
        <div><p>A shopper may already own a moisturizer, have a strict spending limit, and want to avoid particular ingredients. A list of individually recommended products does not necessarily answer what is missing, what the complete basket costs, or why each item belongs.</p><p>The proposed job is a clear purchase decision: reuse existing basics, fill the gaps, and explain the full combination. Whether this reduces confusion, support work, or abandoned purchases is a question to test with stores and shoppers.</p></div>
      </section>

      <section className={styles.section} aria-labelledby="difference-title">
        <Eyebrow>THE PRODUCT DIRECTION</Eyebrow>
        <h2 id="difference-title">Start with constraints.<br />Explain the whole routine.</h2>
        <div className={styles.featureGrid}>
          <article><PackageCheck size={25} strokeWidth={1.5} /><h3>Use what is already owned</h3><p>The working survey reuses cleanser, moisturizer, and sunscreen basics. Product examples fill the gaps instead of requiring an entirely new routine.</p></article>
          <article><ShieldCheck size={25} strokeWidth={1.5} /><h3>Connect appearance and preferences</h3><p>The implemented rules let accepted acne-like or dermatitis-like research appearances change catalog criteria alongside the survey. They stay inactive for the current failed photo baseline; no diagnosis or best-product claim is established.</p></article>
          <article><Wallet size={25} strokeWidth={1.5} /><h3>Show the total, then verify it</h3><p>Selected examples have dated retail prices, seller links and an item subtotal. A separate manual calculator adds shopper-entered tax and delivery. Live feeds and full-budget optimization are planned.</p></article>
        </div>
        <p className={styles.quietNote}>This is a proposed focus, not a claim of unique technology or measured superiority. <a href="https://skinsort.com/support/what-is-skinsort-premium" target="_blank" rel="noreferrer">SkinSort</a> and <a href="https://getskinbliss.com/quiz/pro" target="_blank" rel="noreferrer">Skin Bliss</a> already offer substantial routine and product tools; SkinSnap must earn a reason to be chosen.</p>
      </section>

      <section id="business-model" className={styles.section} aria-labelledby="business-title">
        <Eyebrow>HOW IT COULD MAKE MONEY</Eyebrow>
        <h2 id="business-title">Free for the shopper.<br />A store pays for proven value.</h2>
        <p className={styles.sectionIntro}>The proposed revenue model is retailer software. Stores would pay only if the assistant performs better for their needs than their current workflow or an existing quiz.</p>
        <div className={styles.planGrid}>
          <article className={styles.plan}><span className={styles.smallLabel}>WORKING RESEARCH PROTOTYPE</span><h3>Explain the selection</h3><p className={styles.price}>Free</p><p>Survey-driven cosmetic examples work now. Joint photo rules are implemented, while the failed photo model stays unavailable.</p><ul><li><Check size={16} /> Honest unavailable and uncertainty states</li><li><Check size={16} /> Ingredient constraints and owned basics</li><li><Check size={16} /> Dated prices, seller links and subtotal</li></ul><span className={styles.planState}>Research use · No retail transaction occurs</span></article>
          <article className={styles.plan + " " + styles.paidPlan}><span className={styles.smallLabel}>PROPOSED STORE SUBSCRIPTION</span><h3>Guide a purchase</h3><p className={styles.price}>$49 <span>/ store / month</span></p><p>A USD test price for an integrated retail assistant. Demand, performance, support cost, and sustainable pricing remain unverified.</p><ul><li><Check size={16} /> Planned live catalog, prices, and stock</li><li><Check size={16} /> Planned budget-constrained baskets</li><li><Check size={16} /> Planned embed, checkout handoff, and aggregate measurement</li></ul><span className={styles.planState}>Not available to purchase · No paying customers or pilots</span></article>
        </div>
        <p className={styles.quietNote}>Existing paid tools establish a competitive category, not demand for SkinSnap: <a href="https://revenuehunt.com/" target="_blank" rel="noreferrer">RevenueHunt</a> advertises a $39/month Basic plan and <a href="https://prehook.com/pricing/" target="_blank" rel="noreferrer">Prehook</a> a $45/month Basic plan when billed monthly. Checked October 12, 2026; pricing can change. Neither company endorses or partners with this project.</p>
        <details className={styles.finance}><summary>What would have to be true for $49 to make sense?</summary><p className={styles.quietNote}>{"Use a store's measured margins and costs. The figures below illustrate arithmetic, not observed performance or a revenue forecast."}</p><dl><div><dt>Proposed monthly software fee</dt><dd>$49 / store · Test assumption</dd></div><div><dt>Illustrative gross margin per additional order</dt><dd>$5 · Assumption</dd></div><div><dt>Additional orders to cover the fee alone</dt><dd>ceil($49 ÷ $5) = 10</dd></div><div><dt>Merchant net value to measure</dt><dd>Incremental gross margin + support savings − fee − other costs</dd></div><div><dt>SkinSnap contribution to measure</dt><dd>Fee − infrastructure − fees − support − refunds</dd></div></dl><p className={styles.quietNote}>Ten extra orders is not a target validated for any store and does not establish profit. Account for returns, discounts, attribution, integration and acquisition costs; measure churn, onboarding time, support load, maintenance, privacy work, and catalog review. Small discovery sessions cannot establish a conversion lift.</p></details>
        <div className={styles.licenseGate}><ShieldCheck size={23} /><div><h3>Research is not paid-launch clearance.</h3><p>The older dermoscopic artifacts use CC BY-NC 4.0 data. The new SCIN photo task has custom attribution and no-re-identification terms, plus separate ImageNet pretrained-weight rights to review. Neither the small internal benchmark nor cosmetic rules establish clinical or product-response validation. Complete model/data/code rights and intended-use assessment before including either model in a paid offer.</p><Link href="/research/">Inspect both tasks and their rights <ArrowUpRight size={15} /></Link></div></div>
      </section>

      <section className={styles.section} aria-labelledby="validation-title">
        <Eyebrow>THE FIRST ROUTE TO MARKET</Eyebrow>
        <h2 id="validation-title">Start with stores.<br />Test a reason to pay.</h2>
        <p className={styles.sectionIntro}>Seek direct discovery conversations with small independent multi-brand retailers, then test within their existing traffic rather than buying a consumer audience. These are proposed experiments, not completed interviews, partnerships, or commitments.</p>
        <div className={styles.milestones}>{milestones.map(item => <article key={item.number}><span className={styles.number}>{item.number}</span><div><span className={styles.target}>{item.target}</span><h3>{item.title}</h3><p>{item.body}</p></div></article>)}</div>
        <div className={styles.validationBar}><Lightbulb size={24} /><p><strong>Define the decision before the pilot:</strong> shoppers must understand their total and the nonclinical nature of the guidance. Continue only if merchants commit to testing a real paid offer and a sufficiently powered comparison supports value after costs. Revise or stop if existing tools solve the job better.</p></div>
      </section>

      <section className={styles.boundaries} aria-labelledby="boundaries-title"><div><Eyebrow>TRUST IS PART OF THE PRODUCT</Eyebrow><h2 id="boundaries-title">Explain every boundary.</h2><p>The implemented photo task has two tentative appearance groups but is unavailable in this release. A future accepted result could inform basic cosmetic traits alongside preferences; uncertain or other outputs abstain, and dermoscopic lesion labels never choose a treatment. The catalog cannot prove an absolute best product, assess every allergy or replace professional evaluation.</p><div className={styles.boundaryLinks}><Link href="/routine/" className="text-link">Try survey-only care <ArrowUpRight size={16} /></Link><Link href="/research/" className="text-link">Inspect model evidence <ArrowUpRight size={16} /></Link></div></div><div><Fingerprint size={25} strokeWidth={1.5} /><h3>Keep the data footprint small</h3><p>Current survey preferences, photos and results remain in browser memory by default and can be cleared. Retail integration and aggregate measurement need their own consent, security, retention, and disclosure design; those services are not implemented. Do not claim medical, clinical, or regulatory approval.</p><div className={styles.boundaryLinks}><Link href="/about/#privacy" className="text-link">Read current privacy practices <ArrowUpRight size={16} /></Link></div></div></section>
      <SafetyNote />
    </div>
  );
}
