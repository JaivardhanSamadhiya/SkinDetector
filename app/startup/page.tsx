import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Fingerprint, GraduationCap, Lightbulb, MoveRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow, SafetyNote } from "@/components/shared";
import styles from "./startup.module.css";

export const metadata: Metadata = {
  title: "The startup idea",
  description: "SkinSnap's education-first business hypothesis, proposed buyer, validation plan, and commercial licensing requirements.",
};

const milestones = [
  { number: "01", title: "Listen before selling", target: "10 instructor interviews", body: "Find out how university health and AI courses teach image-model limitations today, what preparation takes time, and who controls the budget." },
  { number: "02", title: "Test the learning experience", target: "20 supervised learner sessions", body: "Measure whether learners can complete the flow, distinguish a dataset label from a diagnosis, and explain why a selfie is unsupported." },
  { number: "03", title: "Check a reason to return", target: "3 noncommercial workshop trials", body: "Observe repeat use, instructor preparation time, support requests, and whether preference-based routine education is useful alongside the research lesson." },
  { number: "04", title: "Earn the right to charge", target: "Rights clearance + purchase-intent testing", body: "Obtain suitable data/model rights or replace the research model, test willingness to pay with budget holders, and measure delivery costs before a paid launch." },
];

export default function StartupPage() {
  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="startup-title">
        <div>
          <Eyebrow>THE STARTUP IDEA</Eyebrow>
          <h1 id="startup-title">Better skin literacy.<br /><em>A business to test.</em></h1>
          <p className={styles.lead}>Help educators turn confusing skin information and opaque image AI into a clear, practical learning experience.</p>
          <p className={styles.status}><span /> Working research prototype · Business model unvalidated</p>
          <div className={styles.actions}>
            <Button asChild><Link href="/analysis/">Experience the product <MoveRight size={17} /></Link></Button>
            <Link className="text-link" href="#business-model">Explore the business <ArrowUpRight size={17} /></Link>
          </div>
        </div>
        <aside className={styles.buyerCard} aria-label="Initial customer hypothesis">
          <GraduationCap size={33} strokeWidth={1.4} />
          <span className={styles.smallLabel}>ONE INITIAL BUYER</span>
          <h2>University course instructors</h2>
          <p>Teaching introductory health literacy or medical-image AI, with a department budget for learning resources.</p>
          <div className={styles.buyerDetail}><strong>The job to do</strong><span>Run an understandable lesson without rebuilding an image-model demo from scratch.</span></div>
          <div className={styles.buyerDetail}><strong>The users</strong><span>Students and workshop learners. The instructor is the proposed buyer.</span></div>
        </aside>
      </section>

      <section className={styles.problemSection} aria-labelledby="problem-title">
        <div><Eyebrow>THE PROBLEM TO VALIDATE</Eyebrow><h2 id="problem-title">Information is everywhere.<br />Context takes work.</h2></div>
        <div><p>Skin information, product marketing, and image-model demos often arrive separately. An educator must explain what an image can support, what a score means, and why a product suggestion is not treatment.</p><p>SkinSnap brings those lessons into one workflow: preferences, a documented research task, clear limitations, and a simple care routine. Whether this saves preparation time or improves understanding still needs to be measured.</p></div>
      </section>

      <section className={styles.section} aria-labelledby="difference-title">
        <Eyebrow>THE PROPOSED DIFFERENCE</Eyebrow>
        <h2 id="difference-title">Clarity at every step.</h2>
        <div className={styles.featureGrid}>
          <article><BookOpen size={25} strokeWidth={1.5} /><h3>A lesson people can follow</h3><p>Navigation guidance, real model outputs, source-linked education, and a routine that explains its choices.</p></article>
          <article><ShieldCheck size={25} strokeWidth={1.5} /><h3>Evidence people can inspect</h3><p>Reproducible training, actual held-out evaluation, visible uncertainty, and an explicitly limited dermoscopic task.</p></article>
          <article><Fingerprint size={25} strokeWidth={1.5} /><h3>Less personal data</h3><p>Default inference stays on the device; image and survey preferences stay in memory and can be cleared.</p></article>
        </div>
        <p className={styles.quietNote}>These are product attributes, not proven advantages over competitors or evidence of medical benefit. The routine uses survey preferences; the lesion model does not select skincare treatment.</p>
      </section>

      <section id="business-model" className={styles.section} aria-labelledby="business-title">
        <Eyebrow>HOW IT COULD MAKE MONEY</Eyebrow>
        <h2 id="business-title">Free learning.<br />A proposed educator subscription.</h2>
        <p className={styles.sectionIntro}>The paid offer would fund teaching materials and support, rather than commissions on a person’s skin concerns. Both pricing and willingness to pay are hypotheses.</p>
        <div className={styles.planGrid}>
          <article className={styles.plan}><span className={styles.smallLabel}>PROPOSED LEARNER ACCESS</span><h3>Explore</h3><p className={styles.price}>Free</p><p>Skin education and a basic routine planner, with a separate noncommercial research demonstration.</p><ul><li><Check size={16} /> Source-linked learning</li><li><Check size={16} /> Preference-based basic routine</li><li><Check size={16} /> Transparent research limitations</li></ul><span className={styles.planState}>Future access model · Current demo is a prototype</span></article>
          <article className={`${styles.plan} ${styles.paidPlan}`}><span className={styles.smallLabel}>PROPOSED DEPARTMENT LICENSE</span><h3>Teach</h3><p className={styles.price}>$499 <span>/ year</span></p><p>A test price for one department’s teaching toolkit, pending interviews, development, and rights clearance.</p><ul><li><Check size={16} /> Planned instructor lesson packs</li><li><Check size={16} /> Planned workshop facilitation guides</li><li><Check size={16} /> Planned onboarding and support</li></ul><span className={styles.planState}>Not available to purchase · No paying customers</span></article>
        </div>
        <div className={styles.licenseGate}><ShieldCheck size={23} /><div><h3>Commercial rights are a launch gate.</h3><p>The current DermaMNIST-C image release is CC BY-NC 4.0, and this project distributes its data-derived model for noncommercial research and education. A paid deployment needs separate rights clearance or a rights-cleared replacement. We have not obtained that clearance.</p><a href="https://zenodo.org/records/12739457" target="_blank" rel="noreferrer">Read the dataset’s exact terms <ArrowUpRight size={15} /></a></div></div>
        <details className={styles.finance}><summary>Illustrative finances: a small first cohort</summary><p className={styles.quietNote}>A planning exercise only; no revenue, costs, quotes, or demand have been measured. All amounts are USD.</p><dl><div><dt>10 department licenses × $499 / year</dt><dd>$4,990 revenue hypothesis</dd></div><div><dt>Hosting allowance</dt><dd>$300 / year assumed</dd></div><div><dt>Support: 20 hours × $40</dt><dd>$800 / year assumed</dd></div><div><dt>Content review: 10 hours × $100</dt><dd>$1,000 / year assumed</dd></div><div><dt>Maintenance: 40 hours × $40</dt><dd>$1,600 / year assumed</dd></div><div><dt>Remainder before other costs</dt><dd>$1,290 / year</dd></div></dl><p className={styles.quietNote}>This remainder is not profit. It excludes customer acquisition, payment fees, taxes, insurance, licensing, validation, compliance, and additional product development; those costs could make the plan uneconomic. Measure them before setting a real price.</p></details>
      </section>

      <section className={styles.section} aria-labelledby="validation-title">
        <Eyebrow>THE FIRST ROUTE TO MARKET</Eyebrow>
        <h2 id="validation-title">Start with a lesson.<br />Prove a reason to pay.</h2>
        <p className={styles.sectionIntro}>Reach university instructors through student societies, course demonstrations, and nonclinical education workshops. The following are proposed next experiments, not completed pilots or partnerships.</p>
        <div className={styles.milestones}>{milestones.map(item => <article key={item.number}><span className={styles.number}>{item.number}</span><div><span className={styles.target}>{item.target}</span><h3>{item.title}</h3><p>{item.body}</p></div></article>)}</div>
        <div className={styles.validationBar}><Lightbulb size={24} /><p><strong>Define success before the trial:</strong> a proposed target is at least 16 of 20 learners correctly distinguishing a model label from a diagnosis, with no learner interpreting a low score as an all-clear. Collect feedback with consent, without retaining personal skin images.</p></div>
      </section>

      <section className={styles.boundaries} aria-labelledby="boundaries-title"><div><Eyebrow>GROWTH WITH REAL BOUNDARIES</Eyebrow><h2 id="boundaries-title">Earn trust before expanding.</h2><p>The present model is a teaching baseline for dermoscopic dataset images. It does not diagnose everyday photos, choose medicines, or establish that a lesion is harmless.</p></div><div><h3>Before clinical use</h3><p>Appropriate data rights, independent external and prospective evaluation, representative skin-tone and device data, clinician-led safety work, security/privacy review, and jurisdiction-specific regulatory assessment would be required. No clinical or regulatory approval is claimed.</p><div className={styles.boundaryLinks}><Link href="/research/" className="text-link">Inspect the research <ArrowUpRight size={16} /></Link><Link href="/about/#privacy" className="text-link">Read privacy practices <ArrowUpRight size={16} /></Link></div></div></section>
      <SafetyNote />
    </div>
  );
}
