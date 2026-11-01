import type { Campaign, PayoutModel } from "../types";

// Deal math for campaigns, in one place so the create form, the campaign page,
// stats and exports always agree.
//
// fixed   — you lock a fee with each creator (e.g. 2,000) and pitch the brand
//           a higher price (e.g. 5,000). Creator payout = sum of fees, your
//           profit = brand price − fees (3,000).
// percent — the creator receives a share of what the brand pays.

type DealShape = Pick<Campaign, "agreed_payment" | "agency_percent" | "creator_ids"> & {
  payout_model?: PayoutModel;
  creator_fees?: Record<string, number>;
};

const n = (value: unknown) => {
  const v = Number(value);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Fees only for creators still on the campaign. */
export const feesFor = (fees: Record<string, number> | undefined, creatorIds: string[]) =>
  creatorIds.reduce((sum, id) => sum + n(fees?.[id]), 0);

export const computePayout = (deal: DealShape) =>
  deal.payout_model === "fixed" ? feesFor(deal.creator_fees, deal.creator_ids) : (n(deal.agreed_payment) * n(deal.agency_percent)) / 100;

/** Creator share in percent — stored for both models so older clients and
 *  reports that only know the percentage still show the right split. */
export const creatorShare = (deal: DealShape) => {
  const price = n(deal.agreed_payment);
  if (deal.payout_model !== "fixed") return n(deal.agency_percent);
  return price ? Math.round((computePayout(deal) / price) * 10000) / 100 : 0;
};

export const profitOf = (deal: DealShape) => n(deal.agreed_payment) - computePayout(deal);

/** Profit as a share of the brand price ("margin"). */
export const marginOf = (deal: DealShape) => {
  const price = n(deal.agreed_payment);
  return price ? Math.round((profitOf(deal) / price) * 100) : 0;
};

/** Brand price as a multiple of creator cost ("markup", e.g. 2.5×). */
export const markupOf = (deal: DealShape) => {
  const cost = computePayout(deal);
  return cost ? Math.round((n(deal.agreed_payment) / cost) * 10) / 10 : 0;
};

/** Brand price that leaves the given margin on top of a creator cost. */
export const priceForMargin = (cost: number, marginPercent: number) =>
  cost > 0 && marginPercent < 100 ? Math.round(cost / (1 - marginPercent / 100) / 50) * 50 : 0;

export const normalizeFees = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, n(v)]).filter(([, v]) => (v as number) > 0));
};

/** Every derived money field, recomputed from the inputs. */
export const withDealMath = <T extends DealShape>(deal: T): T & { creator_payout: number; agency_percent: number } => {
  const payout_model: PayoutModel = deal.payout_model === "fixed" ? "fixed" : "percent";
  const shaped = { ...deal, payout_model, creator_fees: normalizeFees(deal.creator_fees) };
  return { ...shaped, creator_payout: computePayout(shaped), agency_percent: creatorShare(shaped) };
};
