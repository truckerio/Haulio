"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  estimateDrivingMiles,
  loadGoogleMapsAssist,
  lookupAddressDetails,
  lookupAddressSuggestions,
} from "@/lib/google-maps-assist";

type MovementMode = "FTL" | "LTL" | "POOL_DISTRIBUTION";
type LoadType = "COMPANY" | "BROKERED" | "VAN" | "REEFER" | "FLATBED" | "OTHER";

type CreateLoadDrawerProps = {
  open: boolean;
  defaultMovementMode?: "all" | "FTL" | "LTL";
  operatingEntities?: Array<{ id: string; name: string; isDefault?: boolean }>;
  onClose: () => void;
  onCreated: (load: { id: string; loadNumber: string }) => void | Promise<void>;
};

type CreateLoadFormState = {
  loadNumber: string;
  tripNumber: string;
  status: "PLANNED";
  loadType: LoadType;
  movementMode: MovementMode;
  operatingEntityId: string;
  customerName: string;
  customerRef: string;
  truckUnit: string;
  trailerUnit: string;
  weightLbs: string;
  rate: string;
  miles: string;
  salesRepName: string;
  dropName: string;
  desiredInvoiceDate: string;
  loadNotes: string;
  pickupDate: string;
  pickupDateEnd: string;
  pickupTimeStart: string;
  pickupTimeEnd: string;
  pickupName: string;
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  pickupZip: string;
  pickupNotes: string;
  deliveryDateStart: string;
  deliveryDateEnd: string;
  deliveryTimeStart: string;
  deliveryTimeEnd: string;
  deliveryName: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryNotes: string;
};

type AddressSuggestion = {
  placeId: string;
  description: string;
};

function defaultOperatingEntityId(entities: CreateLoadDrawerProps["operatingEntities"]) {
  if (!entities?.length) return "";
  return entities.find((entity) => entity.isDefault)?.id ?? entities[0]?.id ?? "";
}

function buildInitialForm(
  defaultMovementMode: "all" | "FTL" | "LTL" | undefined,
  entities: CreateLoadDrawerProps["operatingEntities"]
): CreateLoadFormState {
  return {
    loadNumber: "",
    tripNumber: "",
    status: "PLANNED",
    loadType: "BROKERED",
    movementMode: defaultMovementMode === "LTL" ? "LTL" : "FTL",
    operatingEntityId: defaultOperatingEntityId(entities),
    customerName: "",
    customerRef: "",
    truckUnit: "",
    trailerUnit: "",
    weightLbs: "",
    rate: "",
    miles: "",
    salesRepName: "",
    dropName: "",
    desiredInvoiceDate: "",
    loadNotes: "",
    pickupDate: "",
    pickupDateEnd: "",
    pickupTimeStart: "",
    pickupTimeEnd: "",
    pickupName: "",
    pickupAddress: "",
    pickupCity: "",
    pickupState: "",
    pickupZip: "",
    pickupNotes: "",
    deliveryDateStart: "",
    deliveryDateEnd: "",
    deliveryTimeStart: "",
    deliveryTimeEnd: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryZip: "",
    deliveryNotes: "",
  };
}

function combineDateTime(date: string, time?: string) {
  if (!date) return undefined;
  const cleanTime = time?.trim();
  return cleanTime ? `${date}T${cleanTime}` : `${date}T00:00`;
}

function buildStopAddressLine(address: string, city: string, state: string, zip: string) {
  const segments = [
    address.trim(),
    [city.trim(), state.trim()].filter(Boolean).join(", ").trim(),
    zip.trim(),
  ].filter(Boolean);
  return segments.join(", ");
}

function buildGoogleRouteHref(origin: string, destination: string) {
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}`;
}

export function CreateLoadDrawer({
  open,
  defaultMovementMode = "all",
  operatingEntities,
  onClose,
  onCreated,
}: CreateLoadDrawerProps) {
  const [form, setForm] = useState<CreateLoadFormState>(() => buildInitialForm(defaultMovementMode, operatingEntities));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapsApi, setMapsApi] = useState<any | null>(null);
  const [googleAssistError, setGoogleAssistError] = useState<string | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<AddressSuggestion[]>([]);
  const [deliverySuggestions, setDeliverySuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLookupBusy, setAddressLookupBusy] = useState<"pickup" | "delivery" | null>(null);
  const [milesMode, setMilesMode] = useState<"auto" | "manual">("auto");
  const [milesAutoBusy, setMilesAutoBusy] = useState(false);
  const [milesAutoError, setMilesAutoError] = useState<string | null>(null);
  const [milesSource, setMilesSource] = useState<"auto" | "manual" | "none">("none");
  const pickupLookupSeq = useRef(0);
  const deliveryLookupSeq = useRef(0);
  const milesLookupSeq = useRef(0);
  const previousRouteSignatureRef = useRef("");
  const googleMapsApiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
  const googleAssistEnabled = googleMapsApiKey.length > 0;

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(defaultMovementMode, operatingEntities));
    setSubmitting(false);
    setError(null);
    setGoogleAssistError(null);
    setPickupSuggestions([]);
    setDeliverySuggestions([]);
    setAddressLookupBusy(null);
    setMilesMode("auto");
    setMilesAutoBusy(false);
    setMilesAutoError(null);
    setMilesSource("none");
    previousRouteSignatureRef.current = "";
  }, [defaultMovementMode, open, operatingEntities]);

  useEffect(() => {
    if (!open || !googleAssistEnabled) return;
    let cancelled = false;
    loadGoogleMapsAssist(googleMapsApiKey)
      .then((maps) => {
        if (cancelled) return;
        setMapsApi(maps);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setGoogleAssistError((loadError as Error)?.message ?? "Google Maps assist unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [googleAssistEnabled, googleMapsApiKey, open]);

  const pickupAddressLine = useMemo(
    () => buildStopAddressLine(form.pickupAddress, form.pickupCity, form.pickupState, form.pickupZip),
    [form.pickupAddress, form.pickupCity, form.pickupState, form.pickupZip]
  );

  const deliveryAddressLine = useMemo(
    () => buildStopAddressLine(form.deliveryAddress, form.deliveryCity, form.deliveryState, form.deliveryZip),
    [form.deliveryAddress, form.deliveryCity, form.deliveryState, form.deliveryZip]
  );

  const routePreviewHref = useMemo(() => {
    if (!pickupAddressLine || !deliveryAddressLine) return null;
    return buildGoogleRouteHref(pickupAddressLine, deliveryAddressLine);
  }, [deliveryAddressLine, pickupAddressLine]);

  const recalculateMilesFromRoute = useCallback(async () => {
    if (!mapsApi || !pickupAddressLine || !deliveryAddressLine) return;
    const seq = ++milesLookupSeq.current;
    setMilesAutoBusy(true);
    setMilesAutoError(null);
    try {
      const miles = await estimateDrivingMiles(mapsApi, pickupAddressLine, deliveryAddressLine);
      if (seq !== milesLookupSeq.current) return;
      if (!miles) {
        setMilesAutoError("Could not estimate driving miles from the current addresses.");
        return;
      }
      setForm((prev) => ({ ...prev, miles: String(miles) }));
      setMilesSource("auto");
    } finally {
      if (seq === milesLookupSeq.current) {
        setMilesAutoBusy(false);
      }
    }
  }, [deliveryAddressLine, mapsApi, pickupAddressLine]);

  useEffect(() => {
    if (!open || !pickupAddressLine || !deliveryAddressLine) return;
    const nextSignature = `${pickupAddressLine}|${deliveryAddressLine}`;
    if (previousRouteSignatureRef.current && previousRouteSignatureRef.current !== nextSignature) {
      setMilesMode("auto");
      setMilesAutoError(null);
    }
    previousRouteSignatureRef.current = nextSignature;
  }, [deliveryAddressLine, open, pickupAddressLine]);

  useEffect(() => {
    if (!open || !mapsApi || milesMode !== "auto") return;
    if (!pickupAddressLine || !deliveryAddressLine) return;
    const timer = window.setTimeout(() => {
      void recalculateMilesFromRoute();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [deliveryAddressLine, mapsApi, milesMode, open, pickupAddressLine, recalculateMilesFromRoute]);

  useEffect(() => {
    if (!open || !mapsApi) return;
    const term = form.pickupAddress.trim();
    if (term.length < 4) {
      setPickupSuggestions([]);
      return;
    }
    const seq = ++pickupLookupSeq.current;
    const timer = window.setTimeout(async () => {
      const suggestions = await lookupAddressSuggestions(mapsApi, term);
      if (pickupLookupSeq.current !== seq) return;
      setPickupSuggestions(suggestions);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [form.pickupAddress, mapsApi, open]);

  useEffect(() => {
    if (!open || !mapsApi) return;
    const term = form.deliveryAddress.trim();
    if (term.length < 4) {
      setDeliverySuggestions([]);
      return;
    }
    const seq = ++deliveryLookupSeq.current;
    const timer = window.setTimeout(async () => {
      const suggestions = await lookupAddressSuggestions(mapsApi, term);
      if (deliveryLookupSeq.current !== seq) return;
      setDeliverySuggestions(suggestions);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [form.deliveryAddress, mapsApi, open]);

  const applySuggestion = useCallback(
    async (target: "pickup" | "delivery", suggestion: AddressSuggestion) => {
      if (!mapsApi || !suggestion.placeId) return;
      setAddressLookupBusy(target);
      try {
        const details = await lookupAddressDetails(mapsApi, suggestion.placeId);
        if (!details) return;
        if (target === "pickup") {
          setForm((prev) => ({
            ...prev,
            pickupAddress: details.streetAddress || details.formattedAddress || prev.pickupAddress,
            pickupCity: details.city || prev.pickupCity,
            pickupState: details.state || prev.pickupState,
            pickupZip: details.zip || prev.pickupZip,
          }));
          setPickupSuggestions([]);
        } else {
          setForm((prev) => ({
            ...prev,
            deliveryAddress: details.streetAddress || details.formattedAddress || prev.deliveryAddress,
            deliveryCity: details.city || prev.deliveryCity,
            deliveryState: details.state || prev.deliveryState,
            deliveryZip: details.zip || prev.deliveryZip,
          }));
          setDeliverySuggestions([]);
        }
        setMilesMode("auto");
      } finally {
        setAddressLookupBusy(null);
      }
    },
    [mapsApi]
  );

  const canSubmit = useMemo(() => {
    return Boolean(
      form.customerName.trim() &&
        form.pickupDate.trim() &&
        form.pickupName.trim() &&
        form.pickupCity.trim() &&
        form.pickupState.trim() &&
        form.pickupZip.trim() &&
        form.deliveryName.trim() &&
        form.deliveryCity.trim() &&
        form.deliveryState.trim() &&
        form.deliveryZip.trim() &&
        form.rate.trim() &&
        form.miles.trim()
    );
  }, [form]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/20 sm:items-stretch">
      <div className="flex h-[94dvh] w-full flex-col bg-white shadow-[var(--shadow-subtle)] sm:h-full sm:max-w-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-4 py-4 sm:px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Dispatch</div>
            <div className="text-lg font-semibold text-ink">Create load</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {googleAssistEnabled ? "Google assist enabled: address autofill + auto miles." : "Google assist disabled: manual addresses and miles."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/loads/confirmations")}>
              RC Inbox
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Close
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
              Full create-load form from previous Loads workspace, now embedded in Dispatch.
            </div>

            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Core</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Load" htmlFor="dispatchCreateLoadNumber">
                  <Input id="dispatchCreateLoadNumber" value={form.loadNumber} onChange={(event) => setForm((prev) => ({ ...prev, loadNumber: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Trip number" htmlFor="dispatchCreateTripNumber">
                  <Input id="dispatchCreateTripNumber" value={form.tripNumber} onChange={(event) => setForm((prev) => ({ ...prev, tripNumber: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Status" htmlFor="dispatchCreateStatus">
                  <Select id="dispatchCreateStatus" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as "PLANNED" }))} disabled>
                    <option value="PLANNED">PLANNED</option>
                  </Select>
                </FormField>
                <FormField label="Load type" htmlFor="dispatchCreateLoadType">
                  <Select id="dispatchCreateLoadType" value={form.loadType} onChange={(event) => setForm((prev) => ({ ...prev, loadType: event.target.value as LoadType }))} disabled={submitting}>
                    <option value="BROKERED">BROKERED</option>
                    <option value="COMPANY">COMPANY</option>
                    <option value="VAN">VAN</option>
                    <option value="REEFER">REEFER</option>
                    <option value="FLATBED">FLATBED</option>
                    <option value="OTHER">OTHER</option>
                  </Select>
                </FormField>
                <FormField label="Movement mode" htmlFor="dispatchCreateMovementMode">
                  <Select id="dispatchCreateMovementMode" value={form.movementMode} onChange={(event) => setForm((prev) => ({ ...prev, movementMode: event.target.value as MovementMode }))} disabled={submitting}>
                    <option value="FTL">FTL</option>
                    <option value="LTL">LTL</option>
                    <option value="POOL_DISTRIBUTION">POOL_DISTRIBUTION</option>
                  </Select>
                </FormField>
                <FormField label="Operating entity" htmlFor="dispatchCreateOperatingEntity">
                  <Select id="dispatchCreateOperatingEntity" value={form.operatingEntityId} onChange={(event) => setForm((prev) => ({ ...prev, operatingEntityId: event.target.value }))} disabled={submitting || !operatingEntities?.length}>
                    <option value="">Default</option>
                    {(operatingEntities ?? []).map((entity) => (
                      <option key={entity.id} value={entity.id}>{entity.name}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={form.loadType === "BROKERED" ? "Broker" : "Customer"} htmlFor="dispatchCreateCustomerName" required>
                  <Input id="dispatchCreateCustomerName" value={form.customerName} onChange={(event) => setForm((prev) => ({ ...prev, customerName: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Cust Ref" htmlFor="dispatchCreateCustomerRef">
                  <Input id="dispatchCreateCustomerRef" value={form.customerRef} onChange={(event) => setForm((prev) => ({ ...prev, customerRef: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Unit" htmlFor="dispatchCreateTruckUnit">
                  <Input id="dispatchCreateTruckUnit" value={form.truckUnit} onChange={(event) => setForm((prev) => ({ ...prev, truckUnit: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Trailer" htmlFor="dispatchCreateTrailerUnit">
                  <Input id="dispatchCreateTrailerUnit" value={form.trailerUnit} onChange={(event) => setForm((prev) => ({ ...prev, trailerUnit: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="As Wgt (lbs)" htmlFor="dispatchCreateWeightLbs">
                  <Input id="dispatchCreateWeightLbs" type="number" min="0" value={form.weightLbs} onChange={(event) => setForm((prev) => ({ ...prev, weightLbs: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Total Rev" htmlFor="dispatchCreateRate" required>
                  <Input id="dispatchCreateRate" type="number" min="0" step="0.01" value={form.rate} onChange={(event) => setForm((prev) => ({ ...prev, rate: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Miles" htmlFor="dispatchCreateMiles" required>
                  <div className="space-y-2">
                    <Input
                      id="dispatchCreateMiles"
                      type="number"
                      min="0"
                      step="1"
                      value={form.miles}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, miles: event.target.value }));
                        setMilesMode("manual");
                        setMilesSource("manual");
                        setMilesAutoError(null);
                      }}
                      disabled={submitting}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={submitting || !mapsApi || !pickupAddressLine || !deliveryAddressLine || milesAutoBusy}
                        onClick={() => {
                          setMilesMode("auto");
                          void recalculateMilesFromRoute();
                        }}
                      >
                        {milesAutoBusy ? "Calculating..." : "Auto-calc miles"}
                      </Button>
                      {routePreviewHref ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(routePreviewHref, "_blank", "noopener,noreferrer")}
                          disabled={submitting}
                        >
                          Preview route
                        </Button>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      {milesSource === "auto"
                        ? "Miles currently sourced from Google driving distance."
                        : milesSource === "manual"
                        ? "Miles manually overridden."
                        : "Enter miles manually or use auto-calc after both stops are filled."}
                    </div>
                    {milesAutoError ? <div className="text-[11px] text-[color:var(--color-danger)]">{milesAutoError}</div> : null}
                  </div>
                </FormField>
                <FormField label="Sales" htmlFor="dispatchCreateSalesRep">
                  <Input id="dispatchCreateSalesRep" value={form.salesRepName} onChange={(event) => setForm((prev) => ({ ...prev, salesRepName: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Drop name" htmlFor="dispatchCreateDropName">
                  <Input id="dispatchCreateDropName" value={form.dropName} onChange={(event) => setForm((prev) => ({ ...prev, dropName: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Inv Date" htmlFor="dispatchCreateDesiredInvoiceDate">
                  <Input id="dispatchCreateDesiredInvoiceDate" type="date" value={form.desiredInvoiceDate} onChange={(event) => setForm((prev) => ({ ...prev, desiredInvoiceDate: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Load notes" htmlFor="dispatchCreateLoadNotes" className="sm:col-span-2 lg:col-span-3">
                  <Textarea id="dispatchCreateLoadNotes" rows={2} value={form.loadNotes} onChange={(event) => setForm((prev) => ({ ...prev, loadNotes: event.target.value }))} disabled={submitting} />
                </FormField>
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Pickup</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="PU Date F" htmlFor="dispatchCreatePickupDate" required>
                  <Input id="dispatchCreatePickupDate" type="date" value={form.pickupDate} onChange={(event) => setForm((prev) => ({ ...prev, pickupDate: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="PU Date T" htmlFor="dispatchCreatePickupDateEnd">
                  <Input id="dispatchCreatePickupDateEnd" type="date" value={form.pickupDateEnd} onChange={(event) => setForm((prev) => ({ ...prev, pickupDateEnd: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="PU Time F" htmlFor="dispatchCreatePickupTimeStart">
                  <Input id="dispatchCreatePickupTimeStart" type="time" value={form.pickupTimeStart} onChange={(event) => setForm((prev) => ({ ...prev, pickupTimeStart: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="PU Time T" htmlFor="dispatchCreatePickupTimeEnd">
                  <Input id="dispatchCreatePickupTimeEnd" type="time" value={form.pickupTimeEnd} onChange={(event) => setForm((prev) => ({ ...prev, pickupTimeEnd: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Shipper" htmlFor="dispatchCreatePickupName" required>
                  <Input id="dispatchCreatePickupName" value={form.pickupName} onChange={(event) => setForm((prev) => ({ ...prev, pickupName: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Shipper address" htmlFor="dispatchCreatePickupAddress">
                  <div className="relative">
                    <Input
                      id="dispatchCreatePickupAddress"
                      autoComplete="off"
                      value={form.pickupAddress}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, pickupAddress: event.target.value }));
                        setMilesMode("auto");
                      }}
                      disabled={submitting}
                    />
                    {pickupSuggestions.length ? (
                      <div className="absolute z-[120] mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-[color:var(--color-divider)] bg-white shadow-[var(--shadow-subtle)]">
                        {pickupSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.placeId}
                            type="button"
                            className="block w-full border-b border-[color:var(--color-divider)] px-3 py-2 text-left text-[12px] text-ink last:border-b-0 hover:bg-[color:var(--color-bg-muted)]"
                            onClick={() => {
                              void applySuggestion("pickup", suggestion);
                            }}
                            disabled={submitting || addressLookupBusy === "pickup"}
                          >
                            {suggestion.description}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">
                    {addressLookupBusy === "pickup"
                      ? "Applying selected address..."
                      : mapsApi
                      ? "Type street address to use Google autocomplete."
                      : "Google autocomplete unavailable; enter address manually."}
                  </div>
                </FormField>
                <FormField label="Ship City" htmlFor="dispatchCreatePickupCity" required>
                  <Input id="dispatchCreatePickupCity" value={form.pickupCity} onChange={(event) => setForm((prev) => ({ ...prev, pickupCity: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Ship St" htmlFor="dispatchCreatePickupState" required>
                  <Input id="dispatchCreatePickupState" maxLength={2} value={form.pickupState} onChange={(event) => setForm((prev) => ({ ...prev, pickupState: event.target.value.toUpperCase() }))} disabled={submitting} />
                </FormField>
                <FormField label="Shipper zip" htmlFor="dispatchCreatePickupZip" required>
                  <Input id="dispatchCreatePickupZip" value={form.pickupZip} onChange={(event) => setForm((prev) => ({ ...prev, pickupZip: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Load Notes (Shipper)" htmlFor="dispatchCreatePickupNotes" className="sm:col-span-2 lg:col-span-3">
                  <Textarea id="dispatchCreatePickupNotes" rows={2} value={form.pickupNotes} onChange={(event) => setForm((prev) => ({ ...prev, pickupNotes: event.target.value }))} disabled={submitting} />
                </FormField>
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-muted)]">Delivery</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Del Date F" htmlFor="dispatchCreateDeliveryDateStart">
                  <Input id="dispatchCreateDeliveryDateStart" type="date" value={form.deliveryDateStart} onChange={(event) => setForm((prev) => ({ ...prev, deliveryDateStart: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Del Date T" htmlFor="dispatchCreateDeliveryDateEnd">
                  <Input id="dispatchCreateDeliveryDateEnd" type="date" value={form.deliveryDateEnd} onChange={(event) => setForm((prev) => ({ ...prev, deliveryDateEnd: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Del Time F" htmlFor="dispatchCreateDeliveryTimeStart">
                  <Input id="dispatchCreateDeliveryTimeStart" type="time" value={form.deliveryTimeStart} onChange={(event) => setForm((prev) => ({ ...prev, deliveryTimeStart: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Del Time T" htmlFor="dispatchCreateDeliveryTimeEnd">
                  <Input id="dispatchCreateDeliveryTimeEnd" type="time" value={form.deliveryTimeEnd} onChange={(event) => setForm((prev) => ({ ...prev, deliveryTimeEnd: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Consignee" htmlFor="dispatchCreateDeliveryName" required>
                  <Input id="dispatchCreateDeliveryName" value={form.deliveryName} onChange={(event) => setForm((prev) => ({ ...prev, deliveryName: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Consignee address" htmlFor="dispatchCreateDeliveryAddress">
                  <div className="relative">
                    <Input
                      id="dispatchCreateDeliveryAddress"
                      autoComplete="off"
                      value={form.deliveryAddress}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, deliveryAddress: event.target.value }));
                        setMilesMode("auto");
                      }}
                      disabled={submitting}
                    />
                    {deliverySuggestions.length ? (
                      <div className="absolute z-[120] mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-[color:var(--color-divider)] bg-white shadow-[var(--shadow-subtle)]">
                        {deliverySuggestions.map((suggestion) => (
                          <button
                            key={suggestion.placeId}
                            type="button"
                            className="block w-full border-b border-[color:var(--color-divider)] px-3 py-2 text-left text-[12px] text-ink last:border-b-0 hover:bg-[color:var(--color-bg-muted)]"
                            onClick={() => {
                              void applySuggestion("delivery", suggestion);
                            }}
                            disabled={submitting || addressLookupBusy === "delivery"}
                          >
                            {suggestion.description}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">
                    {addressLookupBusy === "delivery"
                      ? "Applying selected address..."
                      : mapsApi
                      ? "Type street address to use Google autocomplete."
                      : "Google autocomplete unavailable; enter address manually."}
                  </div>
                </FormField>
                <FormField label="Cons City" htmlFor="dispatchCreateDeliveryCity" required>
                  <Input id="dispatchCreateDeliveryCity" value={form.deliveryCity} onChange={(event) => setForm((prev) => ({ ...prev, deliveryCity: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Cons St" htmlFor="dispatchCreateDeliveryState" required>
                  <Input id="dispatchCreateDeliveryState" maxLength={2} value={form.deliveryState} onChange={(event) => setForm((prev) => ({ ...prev, deliveryState: event.target.value.toUpperCase() }))} disabled={submitting} />
                </FormField>
                <FormField label="Consignee zip" htmlFor="dispatchCreateDeliveryZip" required>
                  <Input id="dispatchCreateDeliveryZip" value={form.deliveryZip} onChange={(event) => setForm((prev) => ({ ...prev, deliveryZip: event.target.value }))} disabled={submitting} />
                </FormField>
                <FormField label="Load Notes (Consignee)" htmlFor="dispatchCreateDeliveryNotes" className="sm:col-span-2 lg:col-span-3">
                  <Textarea id="dispatchCreateDeliveryNotes" rows={2} value={form.deliveryNotes} onChange={(event) => setForm((prev) => ({ ...prev, deliveryNotes: event.target.value }))} disabled={submitting} />
                </FormField>
              </div>
            </div>

            {googleAssistError ? <div className="text-sm text-[color:var(--color-danger)]">{googleAssistError}</div> : null}
            {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
            <div className="flex items-center gap-2">
              <Button
                disabled={submitting || !canSubmit}
                onClick={async () => {
                  const parsedRate = Number(form.rate);
                  const parsedMiles = Number(form.miles);
                  if (!Number.isFinite(parsedRate) || parsedRate <= 0 || !Number.isFinite(parsedMiles) || parsedMiles <= 0) {
                    setError("Rate and miles must be greater than 0.");
                    return;
                  }

                  const pickupStart = combineDateTime(form.pickupDate, form.pickupTimeStart || undefined);
                  if (!pickupStart) {
                    setError("Pickup date/time start is required.");
                    return;
                  }
                  const pickupEnd = combineDateTime(
                    form.pickupDateEnd || form.pickupDate,
                    form.pickupTimeEnd || form.pickupTimeStart || undefined
                  );
                  const deliveryStart = combineDateTime(form.deliveryDateStart, form.deliveryTimeStart || undefined);
                  const deliveryEnd = form.deliveryTimeEnd
                    ? combineDateTime(form.deliveryDateEnd || form.deliveryDateStart, form.deliveryTimeEnd)
                    : undefined;

                  setSubmitting(true);
                  setError(null);
                  try {
                    const response = await apiFetch<{ load: { id: string; loadNumber: string } }>("/loads", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        loadNumber: form.loadNumber.trim() || undefined,
                        tripNumber: form.tripNumber.trim() || undefined,
                        status: form.status,
                        loadType: form.loadType || undefined,
                        movementMode: form.movementMode || undefined,
                        businessType: form.loadType === "BROKERED" ? "BROKER" : "COMPANY",
                        operatingEntityId: form.operatingEntityId || undefined,
                        customerName: form.customerName.trim(),
                        customerRef: form.customerRef.trim() || undefined,
                        truckUnit: form.truckUnit.trim() || undefined,
                        trailerUnit: form.trailerUnit.trim() || undefined,
                        weightLbs: form.weightLbs ? Number(form.weightLbs) : undefined,
                        rate: parsedRate,
                        miles: parsedMiles,
                        salesRepName: form.salesRepName.trim() || undefined,
                        dropName: form.dropName.trim() || undefined,
                        desiredInvoiceDate: form.desiredInvoiceDate || undefined,
                        notes: form.loadNotes.trim() || undefined,
                        stops: [
                          {
                            type: "PICKUP",
                            sequence: 1,
                            name: form.pickupName.trim(),
                            address: form.pickupAddress.trim() || "",
                            city: form.pickupCity.trim(),
                            state: form.pickupState.trim(),
                            zip: form.pickupZip.trim(),
                            notes: form.pickupNotes.trim() || undefined,
                            appointmentStart: pickupStart,
                            appointmentEnd: pickupEnd,
                          },
                          {
                            type: "DELIVERY",
                            sequence: 2,
                            name: form.deliveryName.trim(),
                            address: form.deliveryAddress.trim() || "",
                            city: form.deliveryCity.trim(),
                            state: form.deliveryState.trim(),
                            zip: form.deliveryZip.trim(),
                            notes: form.deliveryNotes.trim() || undefined,
                            appointmentStart: deliveryStart,
                            appointmentEnd: deliveryEnd,
                          },
                        ],
                      }),
                    });
                    await onCreated(response.load);
                    onClose();
                  } catch (createError) {
                    setError((createError as Error).message || "Unable to create load.");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Creating..." : "Create load"}
              </Button>
              <Button variant="secondary" disabled={submitting} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
