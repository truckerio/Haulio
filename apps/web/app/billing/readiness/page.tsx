import { redirect } from "next/navigation";

export default function BillingReadinessRedirect() {
  redirect("/finance?tab=receivables&focus=readiness");
}
