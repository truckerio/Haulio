"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/ui/error-banner";
import { getSaveButtonLabel } from "@/components/ui/save-feedback";
import { AdminSettingsShell } from "@/components/admin-settings/AdminSettingsShell";
import { apiFetch } from "@/lib/api";
import { useSaveFeedback } from "@/lib/use-save-feedback";

type FinancePolicy = {
  requireRateCon: "ALWAYS" | "BROKERED_ONLY" | "NEVER";
  requireBOL: "ALWAYS" | "DELIVERED_ONLY" | "NEVER";
  requireSignedPOD: "ALWAYS" | "DELIVERED_ONLY" | "NEVER";
  requireAccessorialProof: "ALWAYS" | "WHEN_ACCESSORIAL_PRESENT" | "NEVER";
  requireInvoiceBeforeReady: boolean;
  requireInvoiceBeforeSend: boolean;
  allowReadinessOverride: boolean;
  overrideRoles: Array<"ADMIN" | "BILLING" | "HEAD_DISPATCHER" | "DISPATCHER">;
  factoringEnabled: boolean;
  factoringEmail: string | null;
  factoringCcEmails: string[];
  factoringAttachmentMode: "ZIP" | "PDFS" | "LINK_ONLY";
  defaultPaymentTermsDays: number | null;
};

const OVERRIDE_ROLE_OPTIONS: Array<"ADMIN" | "BILLING" | "HEAD_DISPATCHER" | "DISPATCHER"> = [
  "ADMIN",
  "BILLING",
  "HEAD_DISPATCHER",
  "DISPATCHER",
];

export default function FinancePolicySettingsPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<FinancePolicy | null>(null);
  const [draft, setDraft] = useState<FinancePolicy | null>(null);
  const [ccText, setCcText] = useState("");
  const { saveState, startSaving, markSaved, resetSaveState } = useSaveFeedback(1800);
  const [error, setError] = useState<string | null>(null);

  const loadPolicy = async () => {
    try {
      const response = await apiFetch<{ policy: FinancePolicy }>("/admin/finance-policy");
      const next = response.policy;
      setPolicy(next);
      setDraft(next);
      setCcText((next.factoringCcEmails ?? []).join(", "));
      setError(null);
    } catch (err) {
      setPolicy(null);
      setDraft(null);
      setError((err as Error).message || "Failed to load finance policy.");
    }
  };

  useEffect(() => {
    loadPolicy();
  }, []);

  const updatePolicy = async () => {
    if (!draft) return;
    startSaving();
    try {
      const ccEmails = ccText
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        requireRateCon: draft.requireRateCon,
        requireBOL: draft.requireBOL,
        requireSignedPOD: draft.requireSignedPOD,
        requireAccessorialProof: draft.requireAccessorialProof,
        requireInvoiceBeforeReady: draft.requireInvoiceBeforeReady,
        requireInvoiceBeforeSend: draft.requireInvoiceBeforeSend,
        allowReadinessOverride: draft.allowReadinessOverride,
        overrideRoles: draft.allowReadinessOverride ? draft.overrideRoles : [],
        factoringEnabled: draft.factoringEnabled,
        factoringEmail: draft.factoringEmail?.trim() ? draft.factoringEmail.trim() : null,
        factoringCcEmails: ccEmails,
        factoringAttachmentMode: draft.factoringAttachmentMode,
        defaultPaymentTermsDays:
          draft.defaultPaymentTermsDays === null || draft.defaultPaymentTermsDays === undefined
            ? null
            : Number(draft.defaultPaymentTermsDays),
      };
      const response = await apiFetch<{ policy: FinancePolicy }>("/admin/finance-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPolicy(response.policy);
      setDraft(response.policy);
      setCcText((response.policy.factoringCcEmails ?? []).join(", "));
      markSaved();
      setError(null);
    } catch (err) {
      resetSaveState();
      setError((err as Error).message || "Failed to save finance policy.");
    }
  };

  return (
    <AppShell title="Settings" hideHeader={true}>
      <RouteGuard allowedRoles={["ADMIN"]}>
        <AdminSettingsShell
          title="Finance Policy"
          titleAlign="center"
          subtitle="Readiness rules, factoring settings, and aging defaults."
          backAction={
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full border border-[color:var(--color-divider)] bg-white/90 p-0"
              onClick={() => router.push("/admin")}
              aria-label="Back"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4L6 10L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          }
        >
          {error ? <ErrorBanner message={error} /> : null}

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Readiness requirements</div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Rate confirmation" htmlFor="requireRateCon">
                <Select
                  id="requireRateCon"
                  value={draft?.requireRateCon ?? "BROKERED_ONLY"}
                  onChange={(e) => setDraft(draft ? { ...draft, requireRateCon: e.target.value as FinancePolicy["requireRateCon"] } : draft)}
                >
                  <option value="ALWAYS">Always</option>
                  <option value="BROKERED_ONLY">Brokered only</option>
                  <option value="NEVER">Never</option>
                </Select>
              </FormField>
              <FormField label="Signed POD" htmlFor="requireSignedPOD">
                <Select
                  id="requireSignedPOD"
                  value={draft?.requireSignedPOD ?? "DELIVERED_ONLY"}
                  onChange={(e) =>
                    setDraft(draft ? { ...draft, requireSignedPOD: e.target.value as FinancePolicy["requireSignedPOD"] } : draft)
                  }
                >
                  <option value="ALWAYS">Always</option>
                  <option value="DELIVERED_ONLY">Delivered only</option>
                  <option value="NEVER">Never</option>
                </Select>
              </FormField>
              <FormField label="BOL" htmlFor="requireBOL">
                <Select
                  id="requireBOL"
                  value={draft?.requireBOL ?? "DELIVERED_ONLY"}
                  onChange={(e) => setDraft(draft ? { ...draft, requireBOL: e.target.value as FinancePolicy["requireBOL"] } : draft)}
                >
                  <option value="ALWAYS">Always</option>
                  <option value="DELIVERED_ONLY">Delivered only</option>
                  <option value="NEVER">Never</option>
                </Select>
              </FormField>
              <FormField label="Accessorial proof" htmlFor="requireAccessorialProof">
                <Select
                  id="requireAccessorialProof"
                  value={draft?.requireAccessorialProof ?? "WHEN_ACCESSORIAL_PRESENT"}
                  onChange={(e) =>
                    setDraft(
                      draft ? { ...draft, requireAccessorialProof: e.target.value as FinancePolicy["requireAccessorialProof"] } : draft
                    )
                  }
                >
                  <option value="ALWAYS">Always</option>
                  <option value="WHEN_ACCESSORIAL_PRESENT">When accessorial exists</option>
                  <option value="NEVER">Never</option>
                </Select>
              </FormField>
            </div>
            <div className="grid gap-3">
              <CheckboxField
                id="requireInvoiceBeforeReady"
                label="Require invoice before marked ready"
                checked={Boolean(draft?.requireInvoiceBeforeReady)}
                onChange={(e) =>
                  setDraft(draft ? { ...draft, requireInvoiceBeforeReady: e.target.checked } : draft)
                }
              />
              <CheckboxField
                id="requireInvoiceBeforeSend"
                label="Require invoice before send to factoring"
                checked={Boolean(draft?.requireInvoiceBeforeSend)}
                onChange={(e) =>
                  setDraft(draft ? { ...draft, requireInvoiceBeforeSend: e.target.checked } : draft)
                }
              />
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Readiness overrides</div>
            <CheckboxField
              id="allowReadinessOverride"
              label="Allow readiness override for selected roles"
              checked={Boolean(draft?.allowReadinessOverride)}
              onChange={(e) => setDraft(draft ? { ...draft, allowReadinessOverride: e.target.checked } : draft)}
            />
            {draft?.allowReadinessOverride ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {OVERRIDE_ROLE_OPTIONS.map((role) => (
                  <CheckboxField
                    key={role}
                    id={`overrideRole_${role}`}
                    label={role}
                    checked={draft.overrideRoles.includes(role)}
                    onChange={(e) => {
                      if (!draft) return;
                      const next = e.target.checked
                        ? Array.from(new Set([...draft.overrideRoles, role]))
                        : draft.overrideRoles.filter((item) => item !== role);
                      setDraft({ ...draft, overrideRoles: next });
                    }}
                  />
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Factoring defaults</div>
            <CheckboxField
              id="factoringEnabled"
              label="Enable send-to-factoring actions"
              checked={Boolean(draft?.factoringEnabled)}
              onChange={(e) => setDraft(draft ? { ...draft, factoringEnabled: e.target.checked } : draft)}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label="Factoring email" htmlFor="factoringEmail">
                <Input
                  id="factoringEmail"
                  placeholder="ap@factor.example"
                  value={draft?.factoringEmail ?? ""}
                  onChange={(e) => setDraft(draft ? { ...draft, factoringEmail: e.target.value } : draft)}
                />
              </FormField>
              <FormField label="Attachment mode" htmlFor="factoringAttachmentMode">
                <Select
                  id="factoringAttachmentMode"
                  value={draft?.factoringAttachmentMode ?? "LINK_ONLY"}
                  onChange={(e) =>
                    setDraft(draft ? { ...draft, factoringAttachmentMode: e.target.value as FinancePolicy["factoringAttachmentMode"] } : draft)
                  }
                >
                  <option value="LINK_ONLY">Link only</option>
                  <option value="ZIP">ZIP packet</option>
                  <option value="PDFS">PDF bundle</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Factoring CC emails" htmlFor="factoringCcEmails">
              <Textarea
                id="factoringCcEmails"
                value={ccText}
                onChange={(e) => setCcText(e.target.value)}
                rows={3}
                placeholder="ops@haulio.local, billing@haulio.local"
              />
            </FormField>
          </Card>

          <Card className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Collections defaults</div>
            <FormField label="Default payment terms (days)" htmlFor="defaultPaymentTermsDays">
              <Input
                id="defaultPaymentTermsDays"
                type="number"
                min={0}
                max={180}
                value={draft?.defaultPaymentTermsDays ?? ""}
                onChange={(e) =>
                  setDraft(
                    draft
                      ? {
                          ...draft,
                          defaultPaymentTermsDays:
                            e.target.value === "" ? null : Math.max(0, Math.min(180, Number(e.target.value))),
                        }
                      : draft
                  )
                }
              />
            </FormField>
          </Card>

          <div className="flex items-center gap-2">
            <Button onClick={updatePolicy} disabled={!draft || saveState === "saving"}>
              {getSaveButtonLabel(saveState, "Save policy")}
            </Button>
            <Button
              variant="secondary"
              disabled={!policy}
              onClick={() => {
                setDraft(policy);
                setCcText((policy?.factoringCcEmails ?? []).join(", "));
                resetSaveState();
                setError(null);
              }}
            >
              Reset
            </Button>
          </div>
        </AdminSettingsShell>
      </RouteGuard>
    </AppShell>
  );
}
