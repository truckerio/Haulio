import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    if (key.startsWith("--")) {
      const value = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "";
      args.set(key, value);
    }
  }
  return args;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [] as Record<string, string>[];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

function toDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const args = parseArgs();
  const csvDir = process.env.CSV_DIR || path.resolve(__dirname, "../../data/import");
  const loadsPath = args.get("--loads") || path.join(csvDir, "loads.csv");
  const stopsPath = args.get("--stops") || path.join(csvDir, "stops.csv");
  const wipe = args.has("--wipe");

  if (!fs.existsSync(loadsPath) || !fs.existsSync(stopsPath)) {
    throw new Error(`CSV not found. Expected ${loadsPath} and ${stopsPath}`);
  }

  const org = await prisma.organization.findFirst();
  if (!org) {
    throw new Error("No organization found");
  }

  if (wipe) {
    await prisma.task.deleteMany({ where: { orgId: org.id } });
    await prisma.event.deleteMany({ where: { orgId: org.id } });
    await prisma.document.deleteMany({ where: { orgId: org.id } });
    await prisma.invoice.deleteMany({ where: { orgId: org.id } });
    await prisma.stop.deleteMany({ where: { orgId: org.id } });
    await prisma.load.deleteMany({ where: { orgId: org.id } });
  }

  const loadRows = parseCsv(fs.readFileSync(loadsPath, "utf8"));
  const stopRows = parseCsv(fs.readFileSync(stopsPath, "utf8"));

  const existingLoads = await prisma.load.findMany({
    where: { orgId: org.id },
    select: { id: true, loadNumber: true },
  });
  const loadMap = new Map(existingLoads.map((load) => [load.loadNumber, load]));

  const drivers = await prisma.user.findMany({
    where: { orgId: org.id, role: "DRIVER" },
    include: { driver: true },
  });
  const driverMap = new Map(
    drivers
      .filter((user) => user.driver)
      .map((user) => [user.email.toLowerCase(), user.driver!.id])
  );

  const trucks = await prisma.truck.findMany({ where: { orgId: org.id } });
  const trailers = await prisma.trailer.findMany({ where: { orgId: org.id } });
  const truckMap = new Map(trucks.map((truck) => [truck.unit.toLowerCase(), truck.id]));
  const trailerMap = new Map(trailers.map((trailer) => [trailer.unit.toLowerCase(), trailer.id]));

  for (const row of loadRows) {
    const loadNumber = row.loadNumber?.trim();
    if (!loadNumber || loadMap.has(loadNumber)) continue;

    const driverEmail = row.assignedDriverEmail?.trim().toLowerCase();
    const truckUnit = row.truckUnit?.trim().toLowerCase();
    const trailerUnit = row.trailerUnit?.trim().toLowerCase();

    let truckId = truckUnit ? truckMap.get(truckUnit) : undefined;
    if (!truckId && truckUnit) {
      const truck = await prisma.truck.create({ data: { orgId: org.id, unit: row.truckUnit } });
      truckId = truck.id;
      truckMap.set(truckUnit, truck.id);
    }

    let trailerId = trailerUnit ? trailerMap.get(trailerUnit) : undefined;
    if (!trailerId && trailerUnit) {
      const trailer = await prisma.trailer.create({ data: { orgId: org.id, unit: row.trailerUnit } });
      trailerId = trailer.id;
      trailerMap.set(trailerUnit, trailer.id);
    }

    const assignedDriverId = driverEmail ? driverMap.get(driverEmail) : undefined;
    const status = row.status?.trim() || (assignedDriverId ? "ASSIGNED" : "PLANNED");

    const load = await prisma.load.create({
        data: {
          orgId: org.id,
          loadNumber,
          customerName: row.customerName || "Unknown",
          miles: toNumber(row.miles ?? "") ?? undefined,
          rate: toNumber(row.rate ?? "") ?? undefined,
          assignedDriverId: assignedDriverId ?? null,
          truckId: truckId ?? null,
        trailerId: trailerId ?? null,
        status: status as any,
      },
    });

    loadMap.set(loadNumber, load);
  }

  for (const row of stopRows) {
    const loadNumber = row.loadNumber?.trim();
    if (!loadNumber || !loadMap.has(loadNumber)) continue;
    const load = loadMap.get(loadNumber)!;
    const sequence = Number(row.sequence || 0);
    if (!sequence) continue;

    const existing = await prisma.stop.findFirst({
      where: { loadId: load.id, sequence },
    });
    if (existing) continue;

    await prisma.stop.create({
      data: {
        orgId: org.id,
        loadId: load.id,
        type: (row.type || "PICKUP") as any,
        name: row.name || "Unknown",
        address: row.address || "",
        city: row.city || "",
        state: row.state || "",
        zip: row.zip || "",
        appointmentStart: toDate(row.appointmentStart || "") ?? undefined,
        appointmentEnd: toDate(row.appointmentEnd || "") ?? undefined,
        arrivedAt: toDate(row.arrivedAt || "") ?? undefined,
        departedAt: toDate(row.departedAt || "") ?? undefined,
        sequence,
      },
    });
  }

  console.log("Import complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
