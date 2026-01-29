import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getApiBase, getQaDatabaseUrl } from "./qa-env";
import { repoRoot } from "./qa-paths";
import { runStep } from "./qa-utils";

type Session = {
  cookie: string;
  csrfToken: string;
  user: { id: string; role: string; email: string };
};

const statePath = path.resolve(repoRoot, "scripts/qa/qa-state.json");

function readState() {
  if (!fs.existsSync(statePath)) {
    throw new Error("qa-state.json not found. Run qa:setup first.");
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

async function waitForHealth(baseUrl: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("API health check failed");
}

async function startApi(baseUrl: string, qaUrl: string) {
  const logPath = path.resolve(repoRoot, "scripts/qa/qa-api.log");
  const logStream = fs.createWriteStream(logPath, { flags: "w" });
  const port = process.env.QA_API_PORT || "4010";
  const child = spawn("pnpm", ["--filter", "@truckerio/api", "dev"], {
    env: { ...process.env, DATABASE_URL: qaUrl, API_PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  await waitForHealth(baseUrl, 60000);
  return { child, logPath };
}

function parseCookies(headers: Headers) {
  const setCookie = (headers as any).getSetCookie?.() as string[] | undefined;
  const raw = setCookie ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  const cookies: Record<string, string> = {};
  for (const entry of raw) {
    const parts = entry.split(/, (?=[^;]+?=)/g);
    for (const part of parts) {
      const token = part.split(";")[0];
      const [key, value] = token.split("=");
      if (key && value) cookies[key.trim()] = value.trim();
    }
  }
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  return cookieHeader;
}

async function login(baseUrl: string, email: string, password: string): Promise<Session> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "Login failed");
  }
  const cookie = parseCookies(res.headers);
  if (!cookie) {
    throw new Error("Missing session cookie");
  }
  return { cookie, csrfToken: body.csrfToken, user: body.user };
}

async function apiJson<T>(baseUrl: string, session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Cookie", session.cookie);
  if (init.method && init.method !== "GET") {
    headers.set("x-csrf-token", session.csrfToken);
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

async function apiForm<T>(baseUrl: string, session: Session, path: string, form: FormData): Promise<T> {
  const headers = new Headers();
  headers.set("Cookie", session.cookie);
  headers.set("x-csrf-token", session.csrfToken);
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: form });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

function buildStops() {
  return [
    {
      type: "PICKUP",
      name: "QA Shipper",
      address: "100 QA Way",
      city: "Austin",
      state: "TX",
      zip: "78701",
      sequence: 1,
    },
    {
      type: "DELIVERY",
      name: "QA Consignee",
      address: "200 QA Ave",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      sequence: 2,
    },
  ];
}

function pngBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7m5n0AAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
}

async function main() {
  const qaUrl = getQaDatabaseUrl();
  process.env.DATABASE_URL = qaUrl;
  const state = readState();
  const baseUrl = getApiBase();
  const runId = Date.now().toString(36);
  let apiProcess: { child: ReturnType<typeof spawn>; logPath: string } | null = null;
  try {
    try {
      await waitForHealth(baseUrl, 5000);
    } catch (error) {
      if (process.env.QA_AUTO_START_API === "false") {
        throw error;
      }
      apiProcess = await startApi(baseUrl, qaUrl);
    }

    const adminA = await login(baseUrl, state.orgA.users.admin, state.password);
    const dispatcherA = await login(baseUrl, state.orgA.users.dispatcher, state.password);
    const billingA = await login(baseUrl, state.orgA.users.billing, state.password);
    const driverA = await login(baseUrl, state.orgA.users.driver, state.password);
    const adminB = await login(baseUrl, state.orgB.users.admin, state.password);

    let loadAId = "";
    let loadBId = "";
    let stopIds: string[] = [];
    let podDocId = "";
    let invoiceId = "";

    await runStep("qa.smoke.multitenant", async () => {
      const loadA = await apiJson<{ load: any }>(baseUrl, adminA, "/loads", {
        method: "POST",
        body: JSON.stringify({
          loadNumber: `QA-LD-A-${runId}`,
          loadType: "COMPANY",
          operatingEntityId: state.orgA.operatingEntityId,
          customerId: state.orgA.customerId,
          shipperReferenceNumber: "SREF-QA",
          consigneeReferenceNumber: "CREF-QA",
          palletCount: 10,
          weightLbs: 2000,
          rate: 1500,
          miles: 320,
          stops: buildStops(),
        }),
      });
      loadAId = loadA.load.id;

      const loadB = await apiJson<{ load: any }>(baseUrl, adminB, "/loads", {
        method: "POST",
        body: JSON.stringify({
          loadNumber: `QA-LD-B-${runId}`,
          loadType: "COMPANY",
          operatingEntityId: state.orgB.operatingEntityId,
          customerId: state.orgB.customerId,
          rate: 900,
          miles: 120,
          stops: buildStops(),
        }),
      });
      loadBId = loadB.load.id;

      const listA = await apiJson<{ loads: any[] }>(baseUrl, adminA, "/loads");
      const hasB = listA.loads.some((load) => load.id === loadBId);
      if (hasB) {
        throw new Error("Cross-tenant load leakage detected");
      }
      return { details: "Org A cannot see Org B load" };
    });

  await runStep("qa.smoke.rbac", async () => {
    let ok = false;
    try {
      await apiJson(baseUrl, driverA, "/api/operating-entities");
    } catch (error) {
      ok = (error as Error).message.includes("Forbidden");
    }
    if (!ok) {
      throw new Error("Driver should not access admin endpoints");
    }
    return { details: "RBAC enforcement ok" };
  });

  await runStep("qa.smoke.load.lifecycle", async () => {
    await apiJson(baseUrl, dispatcherA, `/loads/${loadAId}/assign`, {
      method: "POST",
      body: JSON.stringify({
        driverId: state.orgA.driverId,
        truckId: state.orgA.truckId,
        trailerId: state.orgA.trailerId,
      }),
    });
    const load = await apiJson<{ load: any }>(baseUrl, dispatcherA, `/loads/${loadAId}`);
    stopIds = load.load.stops.map((stop: any) => stop.id);

    for (const stopId of stopIds) {
      await apiJson(baseUrl, driverA, `/driver/stops/${stopId}/arrive`, { method: "POST" });
      const stop = load.load.stops.find((s: any) => s.id === stopId);
      if (stop.type !== "DELIVERY") {
        await apiJson(baseUrl, driverA, `/driver/stops/${stopId}/depart`, { method: "POST" });
      }
    }

    const updated = await apiJson<{ load: any }>(baseUrl, dispatcherA, `/loads/${loadAId}`);
    if (updated.load.status !== "DELIVERED" && updated.load.status !== "READY_TO_INVOICE" && updated.load.status !== "INVOICED") {
      throw new Error(`Unexpected load status ${updated.load.status}`);
    }
    return { details: `Load delivered (${updated.load.status})` };
  });

  await runStep("qa.smoke.documents", async () => {
    const podForm = new FormData();
    podForm.append("file", new Blob([Buffer.from("QA POD")], { type: "application/pdf" }), "pod.pdf");
    podForm.append("type", "POD");
    const upload = await apiForm<{ doc: any }>(baseUrl, driverA, `/loads/${loadAId}/docs`, podForm);
    podDocId = upload.doc.id;

    await apiJson(baseUrl, billingA, `/docs/${podDocId}/reject`, {
      method: "POST",
      body: JSON.stringify({ rejectReason: "Missing signature" }),
    });

    const podForm2 = new FormData();
    podForm2.append("file", new Blob([Buffer.from("QA POD 2")], { type: "application/pdf" }), "pod2.pdf");
    podForm2.append("type", "POD");
    const upload2 = await apiForm<{ doc: any }>(baseUrl, driverA, `/loads/${loadAId}/docs`, podForm2);
    podDocId = upload2.doc.id;

    const verify = await apiJson<{ doc: any; invoice: any }>(baseUrl, billingA, `/docs/${podDocId}/verify`, {
      method: "POST",
      body: JSON.stringify({ requireSignature: true, requirePrintedName: true, requireDeliveryDate: true, pages: 1 }),
    });
    invoiceId = verify.invoice?.id ?? "";
    return { details: `POD verified, invoice ${invoiceId || "created via generate"} ` };
  });

  await runStep("qa.smoke.billing.queue", async () => {
    const queue = await apiJson<{ delivered: any[]; ready: any[]; invoiced: any[] }>(baseUrl, billingA, "/billing/queue");
    const found = queue.invoiced.some((load) => load.id === loadAId) || queue.ready.some((load) => load.id === loadAId);
    if (!found) {
      throw new Error("Load not present in billing queue");
    }
    return { details: "Load visible in billing queue" };
  });

  await runStep("qa.smoke.invoicing", async () => {
    if (!invoiceId) {
      const load = await apiJson<{ load: any }>(baseUrl, billingA, `/loads/${loadAId}`);
      invoiceId = load.load.invoices?.[0]?.id ?? "";
    }
    if (!invoiceId) {
      throw new Error("Invoice not found after POD verify");
    }
    const packet = await apiJson<{ packetPath: string }>(baseUrl, billingA, `/billing/invoices/${invoiceId}/packet`, {
      method: "POST",
    });
    if (!packet.packetPath) {
      throw new Error("Packet path missing");
    }
    return { details: "Invoice packet generated" };
  });

  await runStep("qa.smoke.settlements", async () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 2);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    const settlement = await apiJson<{ settlement: any }>(baseUrl, billingA, "/settlements/generate", {
      method: "POST",
      body: JSON.stringify({
        driverId: state.orgA.driverId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      }),
    });
    const settlementId = settlement.settlement.id;
    await apiJson(baseUrl, billingA, `/settlements/${settlementId}/finalize`, { method: "POST" });
    const paid = await apiJson<{ settlement: any }>(baseUrl, billingA, `/settlements/${settlementId}/paid`, { method: "POST" });
    if (paid.settlement.status !== "PAID") {
      throw new Error("Settlement not marked paid");
    }
    return { details: "Settlement finalized and paid" };
  });

  await runStep("qa.smoke.imports", async () => {
    let errorOk = false;
    try {
      await apiJson(baseUrl, adminA, "/imports/preview", {
        method: "POST",
        body: JSON.stringify({ type: "drivers", csvText: "email,name\nbadrow\n" }),
      });
    } catch (error) {
      errorOk = (error as Error).message.includes("Missing required columns");
    }
    if (!errorOk) {
      throw new Error("CSV preview should fail on missing columns");
    }
    const csvText = "name,phone,license,payRatePerMile,licenseExpiresAt,medCardExpiresAt\nQA Driver B,5551239999,D999,0.5,2027-01-01,2027-01-01\n";
    const preview = await apiJson<any>(baseUrl, adminA, "/imports/preview", {
      method: "POST",
      body: JSON.stringify({ type: "drivers", csvText }),
    });
    if (!preview.summary || preview.summary.valid !== 1) {
      throw new Error("CSV preview did not validate");
    }
    const commit = await apiJson<any>(baseUrl, adminA, "/imports/commit", {
      method: "POST",
      body: JSON.stringify({ type: "drivers", csvText }),
    });
    if (!Array.isArray(commit.created) || commit.created.length < 1) {
      throw new Error("CSV commit did not create driver");
    }
    return { details: "CSV import preview + commit ok" };
  });

  await runStep("qa.smoke.load.confirmations", async () => {
    const form = new FormData();
    form.append("files", new Blob([pngBuffer()], { type: "image/png" }), "qa-confirmation.png");
    const upload = await apiForm<{ docs: any[] }>(baseUrl, adminA, "/load-confirmations/upload", form);
    const docId = upload.docs[0].id;

    const draft = {
      loadNumber: `QA-LC-${runId}`,
      shipperReferenceNumber: "QA-SHIP",
      consigneeReferenceNumber: "QA-CONS",
      palletCount: 5,
      weightLbs: 500,
      stops: [
        { type: "PICKUP", name: "QA Shipper", address1: "1 QA St", city: "Austin", state: "TX", zip: "78701" },
        { type: "DELIVERY", name: "QA Consignee", address1: "2 QA Ave", city: "Dallas", state: "TX", zip: "75201" },
      ],
    };

    const draftUpdate = await apiJson<{ doc: any }>(baseUrl, adminA, `/load-confirmations/${docId}/draft`, {
      method: "PATCH",
      body: JSON.stringify({ draft }),
    });
    if (!draftUpdate.doc?.normalizedDraft) {
      throw new Error("Load confirmation draft not saved");
    }

    const created = await apiJson<{ loadId: string }>(baseUrl, adminA, `/load-confirmations/${docId}/create-load`, {
      method: "POST",
    });
    if (!created.loadId) {
      throw new Error("Load not created from confirmation");
    }

    const load = await apiJson<{ load: any }>(baseUrl, adminA, `/loads/${created.loadId}`);
    if (!load.load) {
      throw new Error("Created load not found");
    }
    return { details: `Load confirmation created load ${created.loadId}` };
  });

    console.log("QA smoke tests complete.");
  } finally {
    if (apiProcess?.child) {
      apiProcess.child.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error("QA smoke failed:", error.message);
  process.exitCode = 1;
});
