"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Menu, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavigationGuide } from "@/components/navigation-guide";
import styles from "./navigation-guide.module.css";

const links = [
  { href: "/analysis/", label: "Skin analysis" },
  { href: "/routine/", label: "Build a routine" },
  { href: "/conditions/", label: "Skin library" },
  { href: "/skincare/", label: "Everyday care" },
  { href: "/how-it-works/", label: "How it works" },
  { href: "/research/", label: "Our research" },
  { href: "/startup/", label: "Startup" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className={`container header-inner ${styles.headerInner}`}>
        <Link href="/" className="brand" aria-label="SkinSnap home" onClick={() => setOpen(false)}>
          <span className="brand-symbol"><ScanLine size={21} strokeWidth={1.7} aria-hidden="true" /></span>
          SkinSnap<span className="brand-dot">.</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(link => <Link key={link.href} href={link.href} className={pathname.startsWith(link.href.slice(0, -1)) ? "active" : ""} aria-current={pathname.startsWith(link.href.slice(0, -1)) ? "page" : undefined}>{link.label}</Link>)}
        </nav>
        <div className={styles.headerActions}>
          <NavigationGuide />
          <Button asChild className="header-cta" size="sm"><Link href="/analysis/">Analyze my skin <ArrowUpRight size={16} aria-hidden="true" /></Link></Button>
          <button className="mobile-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
        </div>
      </div>
      {open && <nav id="mobile-navigation" className={`mobile-nav ${styles.mobileNav}`} aria-label="Mobile navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href.slice(0, -1)) ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight size={16} aria-hidden="true" /></Link>)}<Link href="/about/" onClick={() => setOpen(false)}>About SkinSnap</Link></nav>}
    </header>
  );
}
