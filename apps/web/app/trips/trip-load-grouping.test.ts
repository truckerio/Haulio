import assert from "node:assert/strict";
import { buildGroupedTripLoads } from "./trip-load-grouping";

const loads = [
  { id: "row-1", sequence: 1, load: { id: "l1", loadNumber: "LD-1", status: "ASSIGNED", customerName: "A" } },
  { id: "row-2", sequence: 2, load: { id: "l2", loadNumber: "LD-2", status: "ASSIGNED", customerName: "B" } },
  { id: "row-3", sequence: 3, load: { id: "l3", loadNumber: "LD-3", status: "ASSIGNED", customerName: "C" } },
];

const details = {
  l1: {
    palletCount: 10,
    weightLbs: 10000,
    stops: [
      { sequence: 1, name: "Pickup A", city: "Austin", state: "TX", departedAt: "2026-02-01T10:00:00.000Z" },
      { sequence: 2, name: "Dock D", city: "Dallas", state: "TX", departedAt: null },
    ],
  },
  l2: {
    palletCount: 5,
    weightLbs: 6000,
    stops: [
      { sequence: 1, name: "Pickup B", city: "Austin", state: "TX", departedAt: "2026-02-01T10:00:00.000Z" },
      { sequence: 2, name: "Dock D", city: "Dallas", state: "TX", departedAt: null },
    ],
  },
  l3: {
    palletCount: 3,
    weightLbs: 4000,
    stops: [{ sequence: 1, name: "Hub H", city: "Houston", state: "TX", departedAt: null }],
  },
};

const ltlGroups = buildGroupedTripLoads({
  movementMode: "LTL",
  loads,
  loadDetails: details,
});

assert.equal(ltlGroups.length, 2);
assert.equal(ltlGroups[0].label, "Dock D · Dallas, TX");
assert.equal(ltlGroups[0].loads.length, 2);
assert.equal(ltlGroups[0].pallets, 15);
assert.equal(ltlGroups[0].weightLbs, 16000);
assert.equal(ltlGroups[1].label, "Hub H · Houston, TX");
assert.equal(ltlGroups[1].loads.length, 1);
assert.equal(ltlGroups[1].pallets, 3);
assert.equal(ltlGroups[1].weightLbs, 4000);

const ftlGroups = buildGroupedTripLoads({
  movementMode: "FTL",
  loads,
  loadDetails: details,
});
assert.equal(ftlGroups.length, 1);
assert.equal(ftlGroups[0].label, "Loads");
assert.equal(ftlGroups[0].loads.length, 3);
assert.equal(ftlGroups[0].pallets, 18);
assert.equal(ftlGroups[0].weightLbs, 20000);

const fallbackGroup = buildGroupedTripLoads({
  movementMode: "POOL_DISTRIBUTION",
  loads: [loads[0]],
  loadDetails: {
    l1: {
      palletCount: 1,
      weightLbs: 1000,
      stops: [
        { sequence: 2, name: "Later", city: "Lubbock", state: "TX", departedAt: "2026-02-01T10:00:00.000Z" },
        { sequence: 1, name: "Earliest", city: "El Paso", state: "TX", departedAt: "2026-02-01T09:00:00.000Z" },
      ],
    },
  },
});
assert.equal(fallbackGroup.length, 1);
assert.equal(fallbackGroup[0].label, "Earliest · El Paso, TX");

console.log("trip load grouping tests passed");

