const GEOCODE_BASE_URL = "https://nominatim.openstreetmap.org/search";

function createGeocodeError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function getLocationCoordinates(locationText) {
  const params = new URLSearchParams({
    q: locationText,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1"
  });

  const response = await fetch(`${GEOCODE_BASE_URL}?${params.toString()}`, {
    headers: {
      "User-Agent": process.env.GEOCODE_USER_AGENT || "pv-bifacial-sim/1.0",
      "Accept-Language": "en"
    }
  });

  if (!response.ok) {
    throw createGeocodeError("Unable to geocode location", 502);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    throw createGeocodeError("Location not found. Try a more specific city name.", 404);
  }

  const top = payload[0];
  const address = top.address || {};
  const name =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    top.display_name?.split(",")?.[0] ||
    locationText;

  return {
    name,
    country: address.country || null,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
    timezone: "UTC"
  };
}
