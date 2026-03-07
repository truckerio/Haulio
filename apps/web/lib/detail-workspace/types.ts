export type DetailLens = "load" | "shipment" | "trip";

export type DetailStop = {
  id: string;
  loadId: string;
  loadNumber: string;
  sequence: number;
  type: string;
  status?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  appointmentStart?: string | null;
  appointmentEnd?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  delayReason?: string | null;
  delayNotes?: string | null;
};

export type DetailDoc = {
  id: string;
  loadId: string;
  loadNumber: string;
  type: string;
  status?: string | null;
  uploadedAt?: string | null;
  stopId?: string | null;
  filename?: string | null;
  rejectReason?: string | null;
};

export type DetailAccessorial = {
  id: string;
  loadId: string;
  loadNumber: string;
  type?: string | null;
  status?: string | null;
  amount?: string | number | null;
};

export type DetailLoad = {
  id: string;
  loadNumber: string;
  status: string;
  movementMode?: string | null;
  customerName?: string | null;
  customerRef?: string | null;
  palletCount?: number | null;
  weightLbs?: number | null;
  miles?: number | null;
  paidMiles?: number | null;
  rate?: string | number | null;
  billingStatus?: string | null;
  driverName?: string | null;
  truckUnit?: string | null;
  trailerUnit?: string | null;
  operatingEntityName?: string | null;
  notes: Array<{ id: string; body: string; priority?: string | null; createdAt?: string | null }>;
  stops: DetailStop[];
  docs: DetailDoc[];
  accessorials: DetailAccessorial[];
  invoices: Array<{ id: string; invoiceNumber?: string | null; status?: string | null; generatedAt?: string | null }>;
};

export type DetailTrip = {
  id: string;
  tripNumber: string;
  status: string;
  movementMode?: string | null;
  origin?: string | null;
  destination?: string | null;
  plannedDepartureAt?: string | null;
  plannedArrivalAt?: string | null;
  driverName?: string | null;
  truckUnit?: string | null;
  trailerUnit?: string | null;
};

export type DetailEtaRow = {
  loadId: string;
  loadNumber: string;
  stopId: string;
  stopType: string;
  stopName?: string | null;
  city?: string | null;
  state?: string | null;
  eta?: string | null;
  appointmentStart?: string | null;
  appointmentEnd?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
};

export type LineagePartialGroup = {
  key: string;
  loads: Array<{ loadId: string; loadNumber: string }>;
};

export type DetailTimelineEntry = {
  id: string;
  kind?: string;
  type?: string;
  message?: string;
  time?: string;
};

export type DetailBlockerSeverity = "danger" | "warning" | "info";

export type DetailBlocker = {
  code: string;
  label: string;
  severity: DetailBlockerSeverity;
  hint?: string | null;
};

export type DetailNowSnapshot = {
  label: string;
  subtitle?: string | null;
};

export type DetailNextAction = {
  key: string;
  label: string;
  reason?: string | null;
  href?: string | null;
};

export type DetailCommandKey =
  | "assign"
  | "updateStop"
  | "message"
  | "uploadPod"
  | "verifyDocs"
  | "rejectDocs"
  | "dispatchPack"
  | "openInspector"
  | "openReceivables"
  | "openBillingPreflight"
  | "openPayablesContext"
  | "optimizeTrip"
  | "copyShipmentLink"
  | "openTrip";

export type DetailCommandState = {
  enabled: boolean;
  reason?: string | null;
};

export type DetailCommandMatrix = Record<DetailCommandKey, DetailCommandState>;

export type DetailWorkspaceModel = {
  lens: DetailLens;
  entityId: string;
  entityLabel: string;
  entityNumber: string;
  customerRef?: string | null;
  brokerName?: string | null;
  status?: string | null;
  movementMode?: string | null;
  primaryLoadId: string;
  primaryLoadNumber: string;
  trip: DetailTrip | null;
  loads: DetailLoad[];
  pickups: DetailStop[];
  deliveries: DetailStop[];
  etaRows: DetailEtaRow[];
  partialGroups: LineagePartialGroup[];
  timeline: DetailTimelineEntry[];
  notes: Array<{ id: string; text: string; priority?: string | null; createdAt?: string | null; sourceLoadNumber?: string }>;
  now: DetailNowSnapshot;
  blockers: DetailBlocker[];
  nextAction: DetailNextAction;
  handoffStage: "DELIVERED" | "DOCS_REVIEW" | "READY" | "INVOICED" | "COLLECTED" | "SETTLED";
  commandState: DetailCommandMatrix;
};

export type DetailBlockSize = "small" | "medium" | "large" | "wide" | "tall";

export type DetailBlockLane = "main" | "right";

export type DetailBlockLayout = {
  enabled: boolean;
  lane: DetailBlockLane;
  size: DetailBlockSize;
  spanCols: number;
  rowUnits: number;
  order: number;
};

export type DetailLayoutState = {
  editMode: boolean;
  schemaVersion: number;
  blocks: Record<string, DetailBlockLayout>;
};
