# Settlements Debug Bundle

## Repro Steps
1) Start API (Docker) on port `4001` and login as Admin (`admin@demo.test` / `demo1234`).
2) Confirm there are delivered loads with miles for the demo driver (SQL output in DB Evidence).
3) Generate a settlement for the driver for `2026-01-20` → `2026-01-22` via `POST /settlements/generate` (response in `/tmp/truckerio_settlement_generate.json`).
   - This generates a settlement with non-zero net/gross.
4) Fetch paid settlements via `GET /settlements?status=PAID&groupBy=none` and observe settlement `cmknl8j6c000r13ensdctex1y` with `net: "0"` (API response in this bundle).
   - This is the row that appears as net `0` in the Settlements list.
5) (UI note) I used API responses instead of browser screenshots in this CLI environment; the Settlements UI reads the same `net`/`gross` fields from the API.

## API Responses (JSON)
### 1) GET /settlements?status=PAID&groupBy=none
```json
{
  "settlements": [
    {
      "id": "cmknl8j6c000r13ensdctex1y",
      "orgId": "cmknfn4fd0000en4hpjsu8p5f",
      "driverId": "cmknforwc000di3tgh7ozsqol",
      "periodStart": "2026-02-20T00:00:00.000Z",
      "periodEnd": "2026-02-01T00:00:00.000Z",
      "status": "PAID",
      "gross": "0",
      "deductions": "0",
      "net": "0",
      "finalizedAt": "2026-01-21T07:12:46.384Z",
      "paidAt": "2026-01-21T07:12:48.062Z",
      "createdAt": "2026-01-21T05:34:08.916Z",
      "driver": {
        "id": "cmknforwc000di3tgh7ozsqol",
        "orgId": "cmknfn4fd0000en4hpjsu8p5f",
        "userId": "cmknforwb000bi3tg204xxxzd",
        "name": "Demo Driver",
        "phone": null,
        "license": "D1234567",
        "licenseState": "TX",
        "licenseExpiresAt": null,
        "medCardExpiresAt": null,
        "payRatePerMile": "0.65",
        "createdAt": "2026-01-21T02:58:49.021Z"
      },
      "weekKey": "2026-W05",
      "weekLabel": "Week of Jan 26–Feb 1"
    },
    {
      "id": "cmknop92p000f6zaaa0jxv0nq",
      "orgId": "cmknfn4fd0000en4hpjsu8p5f",
      "driverId": "cmknforwc000di3tgh7ozsqol",
      "periodStart": "2026-01-18T08:00:00.000Z",
      "periodEnd": "2026-01-25T07:59:59.999Z",
      "status": "PAID",
      "gross": "1852.5",
      "deductions": "0",
      "net": "1852.5",
      "finalizedAt": "2026-01-21T07:11:10.518Z",
      "paidAt": "2026-01-21T07:11:13.159Z",
      "createdAt": "2026-01-21T07:11:07.826Z",
      "driver": {
        "id": "cmknforwc000di3tgh7ozsqol",
        "orgId": "cmknfn4fd0000en4hpjsu8p5f",
        "userId": "cmknforwb000bi3tg204xxxzd",
        "name": "Demo Driver",
        "phone": null,
        "license": "D1234567",
        "licenseState": "TX",
        "licenseExpiresAt": null,
        "medCardExpiresAt": null,
        "payRatePerMile": "0.65",
        "createdAt": "2026-01-21T02:58:49.021Z"
      },
      "weekKey": "2026-W04",
      "weekLabel": "Week of Jan 19–Jan 25"
    },
    {
      "id": "cmkni35zw000713endomrfrkp",
      "orgId": "cmknfn4fd0000en4hpjsu8p5f",
      "driverId": "cmknforwc000di3tgh7ozsqol",
      "periodStart": "2004-11-21T00:00:00.000Z",
      "periodEnd": "2004-11-21T00:00:00.000Z",
      "status": "PAID",
      "gross": "0",
      "deductions": "0",
      "net": "0",
      "finalizedAt": "2026-01-21T04:06:35.011Z",
      "paidAt": "2026-01-21T04:06:41.006Z",
      "createdAt": "2026-01-21T04:05:59.708Z",
      "driver": {
        "id": "cmknforwc000di3tgh7ozsqol",
        "orgId": "cmknfn4fd0000en4hpjsu8p5f",
        "userId": "cmknforwb000bi3tg204xxxzd",
        "name": "Demo Driver",
        "phone": null,
        "license": "D1234567",
        "licenseState": "TX",
        "licenseExpiresAt": null,
        "medCardExpiresAt": null,
        "payRatePerMile": "0.65",
        "createdAt": "2026-01-21T02:58:49.021Z"
      },
      "weekKey": "2004-W47",
      "weekLabel": "Week of Nov 15–Nov 21"
    }
  ],
  "totals": {
    "count": 3,
    "net": "1852.50"
  },
  "weeks": [
    {
      "weekKey": "2026-W05",
      "weekLabel": "Week of Jan 26–Feb 1"
    },
    {
      "weekKey": "2026-W04",
      "weekLabel": "Week of Jan 19–Jan 25"
    },
    {
      "weekKey": "2004-W47",
      "weekLabel": "Week of Nov 15–Nov 21"
    }
  ]
}
```

### 2) GET /settlements?status=PENDING&groupBy=week
```json
{
  "groups": [
    {
      "weekKey": "2026-W04",
      "weekLabel": "Week of Jan 19–Jan 25",
      "settlements": [
        {
          "id": "cmkoh3lm30005hjccq0rpgxb8",
          "orgId": "cmknfn4fd0000en4hpjsu8p5f",
          "driverId": "cmknforwc000di3tgh7ozsqol",
          "periodStart": "2026-01-20T00:00:00.000Z",
          "periodEnd": "2026-01-22T23:59:59.999Z",
          "status": "DRAFT",
          "gross": "1852.5",
          "deductions": "0",
          "net": "1852.5",
          "finalizedAt": null,
          "paidAt": null,
          "createdAt": "2026-01-21T20:26:06.507Z",
          "driver": {
            "id": "cmknforwc000di3tgh7ozsqol",
            "orgId": "cmknfn4fd0000en4hpjsu8p5f",
            "userId": "cmknforwb000bi3tg204xxxzd",
            "name": "Demo Driver",
            "phone": null,
            "license": "D1234567",
            "licenseState": "TX",
            "licenseExpiresAt": null,
            "medCardExpiresAt": null,
            "payRatePerMile": "0.65",
            "createdAt": "2026-01-21T02:58:49.021Z"
          },
          "weekKey": "2026-W04",
          "weekLabel": "Week of Jan 19–Jan 25"
        }
      ],
      "totals": {
        "count": 1,
        "net": "1852.50"
      }
    }
  ],
  "totals": {
    "count": 1,
    "net": "1852.50"
  },
  "weeks": [
    {
      "weekKey": "2026-W04",
      "weekLabel": "Week of Jan 19–Jan 25"
    }
  ]
}
```

### 3) Prisma object before serialization
Not captured (no debug logging enabled). DB outputs below show the stored values.

## DB Evidence (SQL outputs / values)
### Delivered loads for Demo Driver
```sql
select id, "loadNumber", miles, "deliveredAt", "assignedDriverId" from "Load"
where "assignedDriverId"='cmknforwc000di3tgh7ozsqol' and "deliveredAt" is not null
order by "deliveredAt" desc limit 5;
```
```text
            id             | loadNumber | miles |       deliveredAt       |     assignedDriverId
---------------------------+------------+-------+-------------------------+---------------------------
 cmknm3gg5000x13env5gpm31u | 500        |  2400 | 2026-01-21 06:43:04.822 | cmknforwc000di3tgh7ozsqol
 cmknforwl000li3tg0lys7jlr | DEMO-1001  |   450 | 2026-01-21 03:08:28.638 | cmknforwc000di3tgh7ozsqol
(2 rows)
```

### Settlement row (net = 0)
```sql
select id, status, "periodStart", "periodEnd", gross, deductions, net, "createdAt", "finalizedAt", "paidAt"
from "Settlement"
where id='cmknl8j6c000r13ensdctex1y';
```
```text
            id             | status |     periodStart     |      periodEnd      | gross | deductions | net  |        createdAt        |       finalizedAt       |         paidAt
---------------------------+--------+---------------------+---------------------+-------+------------+------+-------------------------+-------------------------+-------------------------
 cmknl8j6c000r13ensdctex1y | PAID   | 2026-02-20 00:00:00 | 2026-02-01 00:00:00 |  0.00 |       0.00 | 0.00 | 2026-01-21 05:34:08.916 | 2026-01-21 07:12:46.384 | 2026-01-21 07:12:48.062
(1 row)
```

### SettlementItem rows for that settlement
```sql
select id, "settlementId", "loadId", amount
from "SettlementItem"
where "settlementId"='cmknl8j6c000r13ensdctex1y';
```
```text
 id | settlementId | loadId | amount
----+--------------+--------+--------
(0 rows)
```
Note: `SettlementItem` table does not have `miles` or `ratePerMile` columns (see schema in Code Snippets).

### Load rows referenced by SettlementItems
```sql
select id, "loadNumber", miles, rate, "deliveredAt", "assignedDriverId"
from "Load"
where id in (
  select "loadId" from "SettlementItem" where "settlementId"='cmknl8j6c000r13ensdctex1y'
);
```
```text
 id | loadNumber | miles | rate | deliveredAt | assignedDriverId
----+------------+-------+------+-------------+------------------
(0 rows)
```

## Code Snippets
### Settlement generation + totals (API)
`apps/api/src/index.ts`
```ts
function parseDateInput(value: string, mode: "start" | "end") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (mode === "start") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }
  return date;
}

app.get("/settlements", requireAuth, async (req, res) => {
  const role = req.user!.role;
  const isDriver = role === "DRIVER";
  if (!isDriver && !hasPermission(req.user, Permission.SETTLEMENT_GENERATE)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let driverId = typeof req.query.driverId === "string" ? req.query.driverId : undefined;
  if (isDriver) {
    const driver = await prisma.driver.findFirst({
      where: { userId: req.user!.id, orgId: req.user!.orgId },
    });
    if (!driver) {
      res.status(404).json({ error: "Driver not found" });
      return;
    }
    driverId = driver.id;
  } else if (driverId && !["ADMIN", "DISPATCHER", "BILLING"].includes(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
  const groupBy = req.query.groupBy === "none" ? "none" : "week";
  const weekParam = typeof req.query.week === "string" ? req.query.week : undefined;
  const fromParam = typeof req.query.from === "string" ? req.query.from : undefined;
  const toParam = typeof req.query.to === "string" ? req.query.to : undefined;

  let fromDate = fromParam ? parseDateInput(fromParam, "start") : null;
  let toDate = toParam ? parseDateInput(toParam, "end") : null;
  if (weekParam) {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekParam);
    if (!match) {
      res.status(400).json({ error: "Invalid week format" });
      return;
    }
    const year = Number(match[1]);
    const week = Number(match[2]);
    const firstWeekStart = startOfISOWeek(new Date(Date.UTC(year, 0, 4)));
    const weekStart = addDays(firstWeekStart, (week - 1) * 7);
    fromDate = weekStart;
    toDate = endOfISOWeek(weekStart);
  }
  if (fromDate && Number.isNaN(fromDate.getTime())) fromDate = null;
  if (toDate && Number.isNaN(toDate.getTime())) toDate = null;

  const where: any = { orgId: req.user!.orgId };
  if (driverId) {
    where.driverId = driverId;
  }
  if (statusParam === "PENDING") {
    where.status = { in: [SettlementStatus.DRAFT, SettlementStatus.FINALIZED] };
  } else if (statusParam && Object.values(SettlementStatus).includes(statusParam as SettlementStatus)) {
    where.status = statusParam as SettlementStatus;
  }
  if (fromDate || toDate) {
    where.periodEnd = {};
    if (fromDate) where.periodEnd.gte = fromDate;
    if (toDate) where.periodEnd.lte = toDate;
  }

  const settlements = await prisma.settlement.findMany({
    where,
    include: { driver: true },
    orderBy: { periodEnd: "desc" },
  });

  const enriched = settlements.map((settlement) => {
    const periodEnd = settlement.periodEnd ?? settlement.periodStart;
    const weekKey = getWeekKey(periodEnd);
    const weekLabel = getWeekLabel(periodEnd);
    return { ...settlement, weekKey, weekLabel };
  });

  let totalNet = new Prisma.Decimal(0);
  for (const item of enriched) {
    const base = item.net ?? item.gross ?? new Prisma.Decimal(0);
    totalNet = add(totalNet, toDecimal(base) ?? new Prisma.Decimal(0));
  }
  const totals = { count: enriched.length, net: totalNet.toFixed(2) };

  const weeks = Array.from(
    new Map(enriched.map((item) => [item.weekKey, item.weekLabel])).entries()
  ).map(([weekKey, weekLabel]) => ({ weekKey, weekLabel }));

  if (groupBy === "week") {
    const groups = Array.from(
      enriched.reduce((map, item) => {
        const existing = map.get(item.weekKey) || {
          weekKey: item.weekKey,
          weekLabel: item.weekLabel,
          settlements: [],
          totals: { count: 0, net: "0.00" },
        };
        existing.settlements.push(item);
        map.set(item.weekKey, existing);
        return map;
      }, new Map<string, any>())
    ).map(([, group]) => {
      let groupNet = new Prisma.Decimal(0);
      for (const item of group.settlements) {
        const base = item.net ?? item.gross ?? new Prisma.Decimal(0);
        groupNet = add(groupNet, toDecimal(base) ?? new Prisma.Decimal(0));
      }
      return { ...group, totals: { count: group.settlements.length, net: groupNet.toFixed(2) } };
    });
    res.json({ groups, totals, weeks });
    return;
  }

  res.json({ settlements: enriched, totals, weeks });
});

app.post("/settlements/generate", requireAuth, requireCsrf, requirePermission(Permission.SETTLEMENT_GENERATE), async (req, res) => {
  const schema = z.object({
    driverId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const periodStart = parseDateInput(parsed.data.periodStart, "start");
  const periodEnd = parseDateInput(parsed.data.periodEnd, "end");
  if (!periodStart || !periodEnd) {
    res.status(400).json({ error: "Invalid dates" });
    return;
  }
  const existing = await prisma.settlement.findFirst({
    where: {
      orgId: req.user!.orgId,
      driverId: parsed.data.driverId,
      periodStart,
      periodEnd,
    },
  });
  if (existing) {
    res.status(409).json({ error: "Settlement already exists", settlementId: existing.id });
    return;
  }
  const driver = await prisma.driver.findFirst({
    where: { id: parsed.data.driverId, orgId: req.user!.orgId },
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  const settings = await prisma.orgSettings.findFirst({ where: { orgId: req.user!.orgId } });
  const rate = toDecimal(driver.payRatePerMile ?? settings?.driverRatePerMile ?? 0) ?? new Prisma.Decimal(0);
  const loads = await prisma.load.findMany({
    where: {
      orgId: req.user!.orgId,
      assignedDriverId: driver.id,
      deliveredAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, loadNumber: true, miles: true },
  });
  let gross = new Prisma.Decimal(0);
  const items = loads.map((load) => {
    const miles = toDecimalFixed(load.miles ?? 0, 2) ?? new Prisma.Decimal(0);
    const amount = mul(rate, miles);
    gross = add(gross, amount);
    return {
      loadId: load.id,
      code: "CPM",
      description: `Miles for ${load.loadNumber ?? load.id}`,
      amount,
    };
  });

  const settlement = await prisma.settlement.create({
    data: {
      orgId: req.user!.orgId,
      driverId: driver.id,
      periodStart,
      periodEnd,
      gross,
      deductions: new Prisma.Decimal(0),
      net: gross,
      items: { create: items },
    },
    include: { items: true },
  });
  await createEvent({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    type: EventType.SETTLEMENT_GENERATED,
    message: `Settlement generated for ${driver.name}`,
    meta: { settlementId: settlement.id },
  });
  res.json({ settlement });
});
```

### Money helpers
`packages/db/src/money.ts`
```ts
import { Prisma } from "@prisma/client";

export type MoneyValue = Prisma.Decimal | number | string | null | undefined;

export function toDecimal(value: MoneyValue) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  return new Prisma.Decimal(value);
}

export function toDecimalFixed(value: MoneyValue, scale = 2) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return null;
  }
  return new Prisma.Decimal(num.toFixed(scale));
}

export function add(a: MoneyValue, b: MoneyValue) {
  const left = toDecimal(a) ?? new Prisma.Decimal(0);
  const right = toDecimal(b) ?? new Prisma.Decimal(0);
  return left.add(right);
}

export function mul(a: MoneyValue, b: MoneyValue) {
  const left = toDecimal(a) ?? new Prisma.Decimal(0);
  const right = toDecimal(b) ?? new Prisma.Decimal(0);
  return left.mul(right);
}

export function formatUSD(value: MoneyValue) {
  const amount = toDecimal(value) ?? new Prisma.Decimal(0);
  return amount.toFixed(2);
}
```

### Settlements UI rendering
`apps/web/app/settlements/page.tsx`
```tsx
{filters.groupBy === "week"
  ? groups.map((group) => (
    <div key={group.weekKey} className="rounded-2xl border border-black/10 bg-white/70 p-4">
      <div className="text-xs uppercase tracking-widest text-black/50">{group.weekLabel}</div>
      <div className="text-sm text-black/60">Net ${group.totals?.net ?? "0.00"} · {group.totals?.count ?? 0} settlement(s)</div>
      <div className="mt-3 grid gap-2">
        {group.settlements.map((settlement: any) => (
          <div key={settlement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
              <div className="text-lg font-semibold">{settlement.driver?.name ?? "Driver"}</div>
              <div className="text-sm text-black/60">
                {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
              </div>
            </div>
            <div className="text-sm text-black/60">
              Net ${settlement.net ?? settlement.gross ?? "0.00"}
            </div>
          </div>
        ))}
      </div>
    </div>
  ))
  : settlements.map((settlement) => (
    <div key={settlement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
      <div>
        <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
        <div className="text-lg font-semibold">{settlement.driver?.name ?? "Driver"}</div>
        <div className="text-sm text-black/60">
          {new Date(settlement.periodStart).toLocaleDateString()} → {new Date(settlement.periodEnd).toLocaleDateString()}
        </div>
      </div>
      <div className="text-sm text-black/60">
        Net ${settlement.net ?? settlement.gross ?? "0.00"}
      </div>
    </div>
  ))}
```

`apps/web/app/driver/page.tsx`
```tsx
try {
  const settlementData = await apiFetch<{ settlements?: any[] }>(
    "/settlements?status=PENDING&groupBy=none"
  );
  setPendingSettlements((settlementData.settlements ?? []).slice(0, 4));
} catch {
  setPendingSettlements([]);
}
...
{pendingSettlements.map((settlement) => (
  <div key={settlement.id} className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2 text-sm">
    <div className="text-xs uppercase tracking-widest text-black/50">{settlement.status}</div>
    <div className="font-semibold">{settlement.weekLabel ?? "Pay period"}</div>
    <div className="text-sm text-black/70">Net ${settlement.net ?? settlement.gross ?? "0.00"}</div>
  </div>
))}
```

## Findings (answers to 5 questions)
1) Does the API return net/gross as strings or Decimal objects?
   - Strings. Example: `"gross": "0"`, `"net": "1852.5"` in `GET /settlements`.
2) Are Settlement.net/gross fields stored in DB or derived from items?
   - Stored in DB (`Settlement.gross`, `Settlement.net` are persisted). API totals are derived from those fields.
3) Do SettlementItems have amount values > 0? If not, why?
   - For settlement `cmknl8j6c000r13ensdctex1y` (net 0), there are **no SettlementItem rows**, so amounts are absent. Likely because the period range produced no matching delivered loads. The record also shows `periodStart` > `periodEnd`.
   - For the newly generated settlement `cmkoh3lm30005hjccq0rpgxb8`, items exist with `amount` values `1560` and `292.5`.
4) Is miles stored as Float and being multiplied safely via Decimal helpers?
   - Yes. `Load.miles` is `Float?` in Prisma, and settlement generation uses `toDecimalFixed` + `mul` from `money.ts`.
5) Does the UI parse money values correctly, or does it NaN->0 fallback?
   - UI does not parse to numbers; it displays `settlement.net ?? settlement.gross ?? "0.00"` directly. No NaN fallback.

Remaining V1 blockers (from `HARDENING_REPORT.md`):
- `@types/node` install/typecheck for API/worker still blocked by registry issues.
- No lint/test scripts configured for CI.

## Candidate Fix (brief)
- Validate `periodStart <= periodEnd` in `POST /settlements/generate` and return `400` if invalid (prevents generating empty/zero settlements from reversed dates).
- Optionally block generation when `loads.length === 0` (return `409` with a message like “No delivered loads in range”).
- UI: disable “Generate” until date range is valid, and show a validation message if end < start.
