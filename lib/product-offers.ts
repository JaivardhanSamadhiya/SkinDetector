import { z } from "zod";

const shoppingUrl = z.string().url().refine(value => new URL(value).protocol === "https:", "Shopping links must use HTTPS.");
export const ProductOfferSchema = z.strictObject({
  seller: z.string().min(1),
  url: shoppingUrl,
  currency: z.literal("USD"),
  priceCents: z.number().int().positive(),
  size: z.string().min(1),
  checkedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ProductOffer = z.infer<typeof ProductOfferSchema>;

/** Manually verified public retail listings, not live inventory or checkout quotes. */
export const PRODUCT_OFFERS: Readonly<Record<string, ProductOffer>> = {
  "vanicream-gentle-cleanser": { seller: "Target", url: "https://www.target.com/p/-/A-17425434", currency: "USD", priceCents: 999, size: "8 fl oz", checkedDate: "2026-10-12" },
  "cerave-foaming-cleanser": { seller: "Target", url: "https://www.target.com/p/-/A-14694910", currency: "USD", priceCents: 1379, size: "12 fl oz", checkedDate: "2026-10-12" },
  "vanicream-daily-moisturizer": { seller: "Target", url: "https://www.target.com/p/-/A-80038093", currency: "USD", priceCents: 1399, size: "3 fl oz", checkedDate: "2026-10-12" },
  "vanicream-moisturizing-cream": { seller: "Target", url: "https://www.target.com/p/-/A-14768513", currency: "USD", priceCents: 1319, size: "16 oz jar", checkedDate: "2026-10-12" },
  "aveeno-oat-gel": { seller: "Walmart", url: "https://www.walmart.com/ip/909682689", currency: "USD", priceCents: 1997, size: "1.7 oz", checkedDate: "2026-10-12" },
  "blue-lizard-sensitive-spf50": { seller: "Walmart", url: "https://www.walmart.com/ip/900975115", currency: "USD", priceCents: 1548, size: "5 fl oz", checkedDate: "2026-10-12" },
};

export function getProductOffer(id: string): ProductOffer | undefined {
  const value = PRODUCT_OFFERS[id];
  return value ? ProductOfferSchema.parse(value) : undefined;
}

export function formatOfferPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
