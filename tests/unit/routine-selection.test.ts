import { describe, expect, it } from "vitest";
import { DEFAULT_SKINCARE_PREFERENCES } from "@/lib/skincare-preferences";
import { buildSkincareRoutine, SKINCARE_PRODUCT_CATALOG } from "@/lib/skincare-routine";
import { PRODUCT_OFFERS, ProductOfferSchema, getProductOffer } from "@/lib/product-offers";
import { selectRoutineProducts, summarizeSelectedPrices } from "@/lib/routine-selection";

const routine = () => buildSkincareRoutine({ ...DEFAULT_SKINCARE_PREFERENCES, avoid: [], owned: [] });

describe("priced product choices", () => {
  it("publishes validated dated HTTPS offers for each existing product with exact package information", () => {
    expect(Object.keys(PRODUCT_OFFERS)).toHaveLength(SKINCARE_PRODUCT_CATALOG.length);
    for (const product of SKINCARE_PRODUCT_CATALOG) {
      const offer = getProductOffer(product.id)!;
      expect(ProductOfferSchema.safeParse(offer).success).toBe(true);
      expect(offer.checkedDate).toBe("2026-10-12");
      expect(["www.target.com", "www.walmart.com"]).toContain(new URL(offer.url).hostname);
      expect(offer.size.length).toBeGreaterThan(3);
      expect(offer).not.toHaveProperty("stock");
    }
  });
  it("rejects invalid currency, fractional cents, unknown keys and unsafe shopping links", () => {
    const offer = getProductOffer("vanicream-gentle-cleanser")!;
    for (const change of [{ priceCents: -1 }, { priceCents: 1.5 }, { currency: "EUR" }, { url: "javascript:alert(1)" }, { url: "http://example.com" }, { checkedDate: "today" }, { stock: true }]) {
      expect(ProductOfferSchema.safeParse({ ...offer, ...change }).success).toBe(false);
    }
  });
  it("keeps returned offer objects independent of catalog and previous outputs", () => {
    const offer = getProductOffer("vanicream-gentle-cleanser")!;
    offer.priceCents = 1;
    expect(getProductOffer("vanicream-gentle-cleanser")!.priceCents).toBe(999);
    expect(getProductOffer("unknown")).toBeUndefined();
  });
  it("adds one selected package per missing basic using exact cents", () => {
    expect(summarizeSelectedPrices(routine().steps)).toEqual({ subtotalCents: 3946, itemCount: 3, missing: [], complete: true });
  });
  it("selecting an allowed alternative updates its price and keeps one product per step", () => {
    const chosen = selectRoutineProducts(routine(), { cleanser: "cerave-foaming-cleanser", moisturizer: "vanicream-moisturizing-cream" });
    expect(chosen.steps[0].product!.id).toBe("cerave-foaming-cleanser");
    expect(chosen.steps[1].product!.id).toBe("vanicream-moisturizing-cream");
    expect(chosen.steps.filter(step => step.product)).toHaveLength(3);
    expect(summarizeSelectedPrices(chosen.steps).subtotalCents).toBe(4246);
  });
  it("a stale or excluded choice cannot bypass ingredient restrictions", () => {
    const filtered = buildSkincareRoutine({ ...DEFAULT_SKINCARE_PREFERENCES, avoid: ["niacinamide"], owned: [] });
    expect(selectRoutineProducts(filtered, { cleanser: "cerave-foaming-cleanser" }).steps[0].product!.id).toBe("vanicream-gentle-cleanser");
    expect(selectRoutineProducts(routine(), { moisturizer: "not-in-catalog" })).toEqual(routine());
  });
  it("owned basics have no new item cost and cannot be replaced by a stored choice", () => {
    const owned = buildSkincareRoutine({ ...DEFAULT_SKINCARE_PREFERENCES, owned: ["cleanser", "moisturizer", "sunscreen"] });
    const chosen = selectRoutineProducts(owned, { cleanser: "cerave-foaming-cleanser" });
    expect(chosen.steps.every(step => step.reuseOwned && step.product === null)).toBe(true);
    expect(summarizeSelectedPrices(chosen.steps)).toEqual({ subtotalCents: 0, itemCount: 0, missing: [], complete: true });
  });
  it("an unpriced or unmatched step prevents a complete subtotal", () => {
    const steps = routine().steps;
    steps[0].product!.offer = undefined;
    steps[1].product = null;
    expect(summarizeSelectedPrices(steps)).toEqual({ subtotalCents: 1548, itemCount: 1, missing: ["cleanser", "moisturizer"], complete: false });
  });
  it("selection and subtotal never modify the source routine or choices", () => {
    const input = routine();
    const before = JSON.stringify(input);
    const choices = { cleanser: "cerave-foaming-cleanser" } as const;
    summarizeSelectedPrices(selectRoutineProducts(input, choices).steps);
    expect(JSON.stringify(input)).toBe(before);
    expect(choices).toEqual({ cleanser: "cerave-foaming-cleanser" });
  });
});
