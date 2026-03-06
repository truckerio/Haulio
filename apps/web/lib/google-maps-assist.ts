"use client";

type GoogleMapsAny = any;

type AddressSuggestion = {
  placeId: string;
  description: string;
};

type AddressDetails = {
  formattedAddress: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
};

let googleMapsPromise: Promise<GoogleMapsAny> | null = null;

function getWindowGoogleMaps() {
  return (window as any).google?.maps as GoogleMapsAny | undefined;
}

function ensureBrowser() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Google Maps assist is only available in browser.");
  }
}

function getGoogleMapsScriptId() {
  return "haulio-google-maps-assist";
}

export async function loadGoogleMapsAssist(apiKey: string): Promise<GoogleMapsAny> {
  ensureBrowser();
  if (!apiKey.trim()) {
    throw new Error("Google Maps API key is missing.");
  }
  const currentMaps = getWindowGoogleMaps();
  if (currentMaps?.places) {
    return currentMaps;
  }
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<GoogleMapsAny>((resolve, reject) => {
    const existing = document.getElementById(getGoogleMapsScriptId()) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        const loadedMaps = getWindowGoogleMaps();
        if (loadedMaps?.places) resolve(loadedMaps);
        else reject(new Error("Google Maps loaded without Places library."));
      });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")));
      return;
    }

    const callbackName = "__haulioGoogleMapsInit";
    (window as any)[callbackName] = () => {
      const loadedMaps = getWindowGoogleMaps();
      if (loadedMaps?.places) resolve(loadedMaps);
      else reject(new Error("Google Maps loaded without Places library."));
      delete (window as any)[callbackName];
    };

    const script = document.createElement("script");
    script.id = getGoogleMapsScriptId();
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps script failed to load."));
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&callback=${callbackName}`;
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function toStreetAddress(components: Array<{ long_name: string; short_name: string; types: string[] }>) {
  const streetNumber = components.find((item) => item.types.includes("street_number"))?.long_name ?? "";
  const route = components.find((item) => item.types.includes("route"))?.long_name ?? "";
  return [streetNumber, route].filter(Boolean).join(" ").trim();
}

function toComponent(
  components: Array<{ long_name: string; short_name: string; types: string[] }>,
  type: string,
  field: "long_name" | "short_name" = "long_name"
) {
  const match = components.find((item) => item.types.includes(type));
  return match ? String(match[field] ?? "").trim() : "";
}

export async function lookupAddressSuggestions(
  maps: GoogleMapsAny,
  input: string
): Promise<AddressSuggestion[]> {
  const value = input.trim();
  if (!value) return [];
  return await new Promise((resolve) => {
    const service = new maps.places.AutocompleteService();
    service.getPlacePredictions(
      {
        input: value,
        types: ["address"],
        componentRestrictions: { country: ["us"] },
      },
      (predictions: any[] | null, status: string) => {
        if (status !== maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          resolve([]);
          return;
        }
        resolve(
          predictions.slice(0, 6).map((prediction) => ({
            placeId: String(prediction.place_id ?? ""),
            description: String(prediction.description ?? ""),
          }))
        );
      }
    );
  });
}

export async function lookupAddressDetails(
  maps: GoogleMapsAny,
  placeId: string
): Promise<AddressDetails | null> {
  const id = placeId.trim();
  if (!id) return null;
  return await new Promise((resolve) => {
    const container = document.createElement("div");
    const map = new maps.Map(container);
    const service = new maps.places.PlacesService(map);
    service.getDetails(
      {
        placeId: id,
        fields: ["formatted_address", "address_components"],
      },
      (place: any, status: string) => {
        if (status !== maps.places.PlacesServiceStatus.OK || !place) {
          resolve(null);
          return;
        }
        const components = Array.isArray(place.address_components) ? place.address_components : [];
        const streetAddress = toStreetAddress(components);
        const city =
          toComponent(components, "locality") ||
          toComponent(components, "postal_town") ||
          toComponent(components, "administrative_area_level_2");
        const state = toComponent(components, "administrative_area_level_1", "short_name").toUpperCase();
        const zip = toComponent(components, "postal_code");
        resolve({
          formattedAddress: String(place.formatted_address ?? "").trim(),
          streetAddress,
          city,
          state,
          zip,
        });
      }
    );
  });
}

export async function estimateDrivingMiles(
  maps: GoogleMapsAny,
  origin: string,
  destination: string
): Promise<number | null> {
  const from = origin.trim();
  const to = destination.trim();
  if (!from || !to) return null;

  return await new Promise((resolve) => {
    const service = new maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [from],
        destinations: [to],
        travelMode: maps.TravelMode.DRIVING,
        unitSystem: maps.UnitSystem.IMPERIAL,
      },
      (response: any, status: string) => {
        if (status !== "OK" || !response?.rows?.[0]?.elements?.[0]) {
          resolve(null);
          return;
        }
        const element = response.rows[0].elements[0];
        if (element.status !== "OK" || !element.distance?.value) {
          resolve(null);
          return;
        }
        const miles = Number(element.distance.value) * 0.000621371;
        if (!Number.isFinite(miles) || miles <= 0) {
          resolve(null);
          return;
        }
        resolve(Math.max(1, Math.round(miles)));
      }
    );
  });
}
