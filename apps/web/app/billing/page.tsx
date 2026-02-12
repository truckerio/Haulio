import { redirect } from "next/navigation";

export default function BillingRedirect() {
  redirect("/finance?tab=receivables");
}
