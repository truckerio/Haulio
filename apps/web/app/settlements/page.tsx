import { redirect } from "next/navigation";

export default function SettlementsRedirect() {
  redirect("/finance?tab=payables");
}
