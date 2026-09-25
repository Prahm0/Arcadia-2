import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { isNativeIOS } from "./platform";

export type RevenueCatTier = "pro" | "max";
export type RevenueCatInterval = "week" | "month" | "year";

export interface IosPurchaseOption {
  tier: RevenueCatTier;
  interval: RevenueCatInterval;
  productIdentifier: string;
  priceString: string;
  title: string;
  /** Apple introductory price (e.g. first month discounted), when one is set up. */
  introPriceString: string | null;
}

const IOS_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? "";

const PRODUCT_IDS: Record<RevenueCatTier, Record<RevenueCatInterval, string>> = {
  pro: {
    week: process.env.NEXT_PUBLIC_REVENUECAT_IOS_PRO_WEEKLY?.trim() ?? "",
    month: process.env.NEXT_PUBLIC_REVENUECAT_IOS_PRO_MONTHLY?.trim() ?? "",
    year: process.env.NEXT_PUBLIC_REVENUECAT_IOS_PRO_YEARLY?.trim() ?? "",
  },
  max: {
    week: process.env.NEXT_PUBLIC_REVENUECAT_IOS_MAX_WEEKLY?.trim() ?? "",
    month: process.env.NEXT_PUBLIC_REVENUECAT_IOS_MAX_MONTHLY?.trim() ?? "",
    year: process.env.NEXT_PUBLIC_REVENUECAT_IOS_MAX_YEARLY?.trim() ?? "",
  },
};

let configuredUserId: string | null = null;

/**
 * Resolves to the configured RevenueCat plugin, wrapped in an object. Never
 * return a Capacitor plugin directly from an async function: awaiting it makes
 * JS call `.then()` on the native proxy, which throws
 * '"Purchases.then()" is not implemented on ios' and breaks every purchase call.
 */
async function purchasesFor(userId: string) {
  if (!isNativeIOS() || !IOS_API_KEY) return null;

  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  if (configuredUserId === userId) return { purchases: Purchases };

  const configured = await Purchases.isConfigured();
  if (!configured.isConfigured) {
    await Purchases.configure({ apiKey: IOS_API_KEY, appUserID: userId });
  } else {
    const current = await Purchases.getAppUserID();
    if (current.appUserID !== userId) await Purchases.logIn({ appUserID: userId });
  }
  configuredUserId = userId;
  return { purchases: Purchases };
}

/**
 * Configure RevenueCat once the app shell knows the signed-in Arcadia user.
 * The public iOS SDK key is deliberately absent on web, where this is a no-op.
 */
export async function initialiseRevenueCat(userId: string): Promise<boolean> {
  return Boolean(await purchasesFor(userId));
}

export async function logOutRevenueCat(): Promise<void> {
  if (!isNativeIOS() || !IOS_API_KEY) return;
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const configured = await Purchases.isConfigured();
  if (configured.isConfigured) await Purchases.logOut();
  configuredUserId = null;
}

export function revenueCatIosConfigured(): boolean {
  return Boolean(IOS_API_KEY);
}

function targetForProduct(productIdentifier: string): Pick<IosPurchaseOption, "tier" | "interval"> | null {
  for (const [tier, intervals] of Object.entries(PRODUCT_IDS) as Array<
    [RevenueCatTier, Record<RevenueCatInterval, string>]
  >) {
    for (const [interval, configuredProductId] of Object.entries(intervals) as Array<
      [RevenueCatInterval, string]
    >) {
      if (configuredProductId && configuredProductId === productIdentifier) return { tier, interval };
    }
  }
  return null;
}

async function offeringPackages(userId: string): Promise<PurchasesPackage[]> {
  const purchases = (await purchasesFor(userId))?.purchases;
  if (!purchases) return [];
  const offerings = await purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

/** Fetches only the configured App Store products from RevenueCat's current offering. */
export async function getIosPurchaseOptions(userId: string): Promise<IosPurchaseOption[]> {
  const packages = await offeringPackages(userId);
  return packages.flatMap((aPackage) => {
    const target = targetForProduct(aPackage.product.identifier);
    return target
      ? [{
          ...target,
          productIdentifier: aPackage.product.identifier,
          priceString: aPackage.product.priceString,
          title: aPackage.product.title,
          introPriceString: aPackage.product.introPrice?.priceString ?? null,
        }]
      : [];
  });
}

export async function purchaseIosOption(
  userId: string,
  tier: RevenueCatTier,
  interval: RevenueCatInterval,
): Promise<void> {
  const targetProductId = PRODUCT_IDS[tier][interval];
  if (!targetProductId) throw new Error("This App Store plan has not been configured yet.");

  const purchases = (await purchasesFor(userId))?.purchases;
  if (!purchases) throw new Error("In-app purchases are not available in this build yet.");
  const aPackage = (await offeringPackages(userId)).find(
    (candidate) => candidate.product.identifier === targetProductId,
  );
  if (!aPackage) throw new Error("This App Store plan is not available right now. Try again shortly.");
  await purchases.purchasePackage({ aPackage });
}

/**
 * Whether this Apple ID can still get the introductory price for a product.
 * Apple grants it once per subscription group, so anyone who has subscribed
 * before pays the normal price; we only advertise the offer when it's real.
 */
/**
 * Apple's intro-offer eligibility for this Apple ID: 0 unknown, 1 ineligible,
 * 2 eligible, 3 no intro offer exists. Null when purchases aren't available.
 */
export async function iosIntroOfferStatus(userId: string, productIdentifier: string): Promise<number | null> {
  const purchases = (await purchasesFor(userId))?.purchases;
  if (!purchases) return null;
  const result = await purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: [productIdentifier] });
  return result[productIdentifier]?.status ?? null;
}

/** The App Store country StoreKit is pricing in (e.g. "AUS"), for diagnostics. */
export async function iosStorefrontCountry(userId: string): Promise<string | null> {
  const purchases = (await purchasesFor(userId))?.purchases;
  if (!purchases) return null;
  try {
    return (await purchases.getStorefront()).countryCode;
  } catch {
    return null;
  }
}

export async function restoreIosPurchases(userId: string): Promise<void> {
  const purchases = (await purchasesFor(userId))?.purchases;
  if (!purchases) throw new Error("In-app purchases are not available in this build yet.");
  await purchases.restorePurchases();
}

/** Returns Apple's subscription-management URL when RevenueCat has one. */
export async function getIosSubscriptionManagementUrl(userId: string): Promise<string | null> {
  const purchases = (await purchasesFor(userId))?.purchases;
  if (!purchases) return null;
  const { customerInfo } = await purchases.getCustomerInfo();
  return customerInfo.managementURL;
}
