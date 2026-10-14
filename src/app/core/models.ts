// Same shape as the `PredictionDto` ... `AdminSubscriptionRow` interfaces in
// the React twin's src/lib/api.ts. TypeScript interfaces are framework-
// agnostic, so this file is a near-verbatim copy — the DTO contract with the
// Java backend doesn't change because the frontend framework did.

export interface PredictionDto {
  speciesName: string;
  scientificName: string;
  confidence: number;
  confidencePercent: string;
  rank: number;
  conservationStatus?: string;
  habitat?: string;
  diet?: string;
  maxSizeCm?: number;
  description?: string;
  funFact?: string;
}

export interface IdentifyFishResult {
  predictions: PredictionDto[];
  uncertain: boolean;
  imageKey: string;
  isFish?: boolean;
}

export interface ObservationDto {
  id: string;
  userId: string;
  speciesName: string;
  scientificName?: string;
  topConfidence: number;
  imageStorageKey: string;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  observedAt: string;
  createdAt: string;
}

export interface BiteHourlyScore {
  timestamp: string;
  score: number;
  breakdown: Record<string, number>;
  weightedContribution: Record<string, number>;
  timeOfDayMultiplier: number;
  safetyFlag?: string | null;
}

export interface TimeWindow {
  start: string;
  end: string;
}

export interface SunTimes {
  date: string;
  sunrise: string;
  sunset: string;
}

export interface CurrentConditions {
  time: string;
  precipitationMm: number;
  isStorm: boolean;
  isHeavyPrecip: boolean;
}

export interface BiteForecast {
  species: string;
  lat: number;
  lon: number;
  hourly: BiteHourlyScore[];
  bestWindows: BiteHourlyScore[];
  majorWindows: TimeWindow[];
  minorWindows: TimeWindow[];
  sunTimes: SunTimes[];
  current: CurrentConditions | null;
}

export interface RegsSpeciesLimit {
  species: string;
  period: string;
  catchLimit: string;
  lengthLimit?: string | null;
  fishingDevice?: string | null;
  note?: string | null;
}

export interface RegsLimits {
  lat: number;
  lon: number;
  zoneName: string;
  zoneInfoUrl?: string | null;
  rules: RegsSpeciesLimit[];
  disclaimer: string;
}

export interface RegsStation {
  noBqma: string;
  hydronyme: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface RegsConsumption {
  lat: number;
  lon: number;
  species: string;
  stationName: string;
  distanceKm: number;
  sizeClass?: string | null;
  mealsPerMonth?: number | null;
  fishingStatus?: string | null;
  note?: string | null;
  disclaimer: string;
}

export interface RegsAskResponse {
  question: string;
  answer: string;
  sources: string[];
  disclaimer: string;
}

export interface NotificationDto {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface TokenResponse {
  token: string;
  userId: string;
  email: string;
  role: string;
}

export interface UserDto {
  id: string;
  email: string;
  displayName?: string;
  role: string;
}

export interface SubscriptionDto {
  status: string;
  plan: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
}

export interface CheckoutResponse {
  processor: string; // "stripe" | "paypal" | "adyen" — only "stripe" is handled client-side today
  clientSecret: string;
  subscriptionId: string;
  status: string;
}

// Matches BillingService.Stats exactly — a flat record, not nested.
export interface AdminStats {
  trialing: number;
  active: number;
  canceled: number;
  expired: number;
  pastDue: number;
  activeMonthly: number;
  activeYearly: number;
  mrrCad: number;
}

export interface AdminSubscriptionRow {
  userId: string;
  email: string;
  status: string;
  plan: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
}

export interface ProductDto {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  stockQuantity: number;
}

export interface CartItemDto {
  productId: string;
  quantity: number;
}

export interface CartDto {
  cartId: string;
  items: CartItemDto[];
}

export interface OrderLineDto {
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface ShippingAddressDto {
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// Status: PENDING_PAYMENT | PAID | CANCELLED | RETURN_REQUESTED | RETURNED
export interface OrderDto {
  id: string;
  status: string;
  totalCents: number;
  lines: OrderLineDto[];
  createdAt: string;
  paidAt: string | null;
  returnRequestedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  // Set once Stripe Checkout collects it, i.e. once status reaches PAID — null before that.
  shippingAddress: ShippingAddressDto | null;
}

export interface CheckoutSessionResponse {
  orderId: string;
  checkoutUrl: string;
}
