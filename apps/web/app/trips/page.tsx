import { redirect } from "next/navigation";

type TripsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function TripsPage({ searchParams }: TripsPageProps) {
  const params = new URLSearchParams();
  params.set("tab", "trips");

  const tripIdValue = searchParams?.tripId;
  const tripId = Array.isArray(tripIdValue) ? tripIdValue[0] : tripIdValue;
  if (tripId) {
    params.set("tripId", tripId);
  }

  const searchValue = searchParams?.search;
  const search = Array.isArray(searchValue) ? searchValue[0] : searchValue;
  if (search) {
    params.set("search", search);
  }

  redirect(`/dispatch?${params.toString()}`);
}
