import assert from "node:assert/strict";
import { extractEntityRows } from "./chatbot-result-utils";

const rows = extractEntityRows([
  {
    key: "read_load_list",
    result: {
      loads: [
        {
          id: "load_1",
          loadNumber: "WR-LTL-6001A",
          status: "IN_TRANSIT",
          customerName: "Kernel Force",
        },
      ],
      count: 1,
    },
  },
  {
    key: "read_trip_list",
    result: {
      trips: [
        {
          id: "trip_1",
          tripNumber: "TR-6001",
          status: "ASSIGNED",
          origin: "Fontana, CA",
          destination: "Indianapolis, IN",
          loadCount: 2,
        },
      ],
      count: 1,
    },
  },
]);

assert.equal(rows.length, 2);
assert.equal(rows[0]?.entity, "load");
assert.equal(rows[0]?.href, "/loads/load_1");
assert.equal(rows[1]?.entity, "trip");
assert.equal(rows[1]?.href, "/trips/trip_1");

const deduped = extractEntityRows(
  [
    {
      key: "read_load_list",
      result: {
        loads: [
          { id: "load_1", loadNumber: "WR-LTL-6001A", status: "IN_TRANSIT", customerName: "Kernel Force" },
          { id: "load_1", loadNumber: "WR-LTL-6001A", status: "IN_TRANSIT", customerName: "Kernel Force" },
        ],
      },
    },
  ],
  10
);

assert.equal(deduped.length, 1);
console.log("chatbot result utils tests passed");
