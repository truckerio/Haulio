import assert from "node:assert/strict";
import { scoreSuggestion } from "./scoring";

const baseInput = {
  driverId: "driver-1",
  truckId: null as string | null,
  distanceMiles: 50,
  pingAgeMinutes: 20,
  onTimeRate: 0.9,
  laneCount: 2,
  pairCount: 0,
  recentLoadCount: 1,
  hosFeasible: null,
  appointmentStart: new Date(Date.now() + 2 * 60 * 60 * 1000),
  pickupLabel: "Dallas, TX → Houston, TX",
  truckLabel: null as string | null,
};

const close = scoreSuggestion({ ...baseInput, distanceMiles: 10 });
const far = scoreSuggestion({ ...baseInput, distanceMiles: 150 });
assert.ok(close.score > far.score, "Closer driver should score higher");

const fresh = scoreSuggestion({ ...baseInput, pingAgeMinutes: 10 });
const stale = scoreSuggestion({ ...baseInput, pingAgeMinutes: 300 });
assert.ok(fresh.score > stale.score, "Fresh ping should score higher than stale ping");

const highReliability = scoreSuggestion({ ...baseInput, onTimeRate: 0.95 });
const lowReliability = scoreSuggestion({ ...baseInput, onTimeRate: 0.4 });
assert.ok(highReliability.score > lowReliability.score, "Higher on-time rate should score higher");

const hasHosWarning = scoreSuggestion({ ...baseInput, hosFeasible: null });
assert.ok(hasHosWarning.warnings.includes("HOS unknown"), "HOS unknown should add warning");

const locationUnknown = scoreSuggestion({ ...baseInput, pingAgeMinutes: null });
assert.ok(locationUnknown.warnings.includes("Location unknown"), "Missing ping should warn about location");

const laneFamiliar = scoreSuggestion({
  ...baseInput,
  distanceMiles: null,
  onTimeRate: null,
  pingAgeMinutes: null,
  laneCount: 4,
  pickupLabel: "Dallas, TX → Houston, TX",
  pairCount: 0,
});
assert.ok(laneFamiliar.reasons.some((reason) => reason.includes("Familiar")), "Lane familiarity should add reason");

const consistency = scoreSuggestion({
  ...baseInput,
  distanceMiles: null,
  onTimeRate: null,
  pingAgeMinutes: null,
  laneCount: 0,
  pairCount: 3,
  truckLabel: "TX-12",
});
assert.ok(consistency.reasons.some((reason) => reason.includes("Truck")), "Consistency should add truck reason");

const bounded = scoreSuggestion({ ...baseInput, distanceMiles: 0, onTimeRate: 1, laneCount: 10, pairCount: 10, recentLoadCount: 0 });
assert.ok(bounded.score <= 100 && bounded.score >= 0, "Score should be clamped between 0 and 100");

console.log("assignment assist scoring tests passed");
