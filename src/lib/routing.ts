export type Coordinates = { lat: number; lng: number };

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
};

const routeCache = new Map<string, RouteResult>();

function routeCacheKey(start: Coordinates, end: Coordinates) {
  return `${start.lat},${start.lng}|${end.lat},${end.lng}`;
}

function calculateDistanceKm(a: Coordinates | null, b: Coordinates | null) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function createFallbackRoute(start: Coordinates, end: Coordinates): RouteResult {
  const distanceKm = calculateDistanceKm(start, end);
  const durationMin = (distanceKm / 20) * 60;
  return {
    distanceKm,
    durationMin,
    geometry: {
      type: 'LineString',
      coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
    },
  };
}

export async function getRouteDistanceAndTime(start: Coordinates | null, end: Coordinates | null): Promise<RouteResult | null> {
  if (!start || !end) {
    return null;
  }

  const cacheKey = routeCacheKey(start, end);
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  const apiKey = import.meta.env.VITE_ORS_API_KEY as string | undefined;
  if (!apiKey) {
    const fallback = createFallbackRoute(start, end);
    routeCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const response = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car?geometry_format=geojson',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat],
          ],
          instructions: false,
          preference: 'recommended',
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ORS request failed (${response.status})`);
    }

    const data = await response.json();
    const feature = data.features?.[0];
    const summary = feature?.properties?.summary;

    if (!feature || !summary || feature.geometry?.type !== 'LineString') {
      throw new Error('Invalid ORS route response');
    }

    const result: RouteResult = {
      distanceKm: Number(summary.distance) / 1000,
      durationMin: Number(summary.duration) / 60,
      geometry: {
        type: 'LineString',
        coordinates: feature.geometry.coordinates as [number, number][],
      },
    };

    routeCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[LAYA] ORS route request failed, falling back to straight-line distance', error);
    const fallback = createFallbackRoute(start, end);
    routeCache.set(cacheKey, fallback);
    return fallback;
  }
}
