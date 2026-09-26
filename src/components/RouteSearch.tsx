"use client";

import React, { useState } from "react";

interface DirectRoute {
  id: string;
  route_no: string;
  route_type: string;
  legs: { from: string; to: string; route_no: string }[];
}

interface MultiLegRoute {
  id: string;
  transfer_stop: string;
  legs: {
    from: string;
    to: string;
    route_no: string;
    route_type: string;
    eta_mins: number | null;
    is_at_start: boolean;
  }[];
}

interface SearchResponse {
  search_params: { start: string; waypoint: string | null; destination: string };
  one_bus_routes: DirectRoute[];
  multiple_leg_routes: MultiLegRoute[];
}

export interface SelectedLeg {
  routeId: string;
  routeNo: string;
  from: string;
  to: string;
  legIndex: number;
}

interface RouteSearchProps {
  onSelectRoute: (legs: SelectedLeg[]) => void;
}

// The backend builds multi-leg IDs as:
//   multi-{leg1_route_id}-{leg2_route_id}-{transfer_stop_id}
// All three segments are UUIDs (32 hex chars + 4 hyphens = 36 chars each).
// We extract them by slicing fixed UUID lengths instead of naive string splitting.
function extractMultiLegRouteIds(compositeId: string): { leg1RouteId: string; leg2RouteId: string } {
  // Strip "multi-" prefix → "{uuid1}-{uuid2}-{uuid3}"
  const raw = compositeId.replace(/^multi-/, "");
  // Each UUID is exactly 36 characters
  const UUID_LEN = 36;
  const leg1RouteId = raw.slice(0, UUID_LEN);
  const leg2RouteId = raw.slice(UUID_LEN + 1, UUID_LEN + 1 + UUID_LEN);
  return { leg1RouteId, leg2RouteId };
}

export default function RouteSearch({ onSelectRoute }: RouteSearchProps) {
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [waypoint, setWaypoint] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !destination) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        start,
        destination,
        ...(waypoint && { waypoint }),
      });
      const response = await fetch(`http://localhost:8000/api/v1/routes/search?${queryParams}`);
      if (!response.ok) throw new Error("No routes found matching query criteria.");
      const data: SearchResponse = await response.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Failed to query transit engine.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black text-white p-6 font-mono border border-neutral-800 rounded-xl max-w-xl w-full">
      <h2 className="text-xl font-bold tracking-tight mb-6 border-b border-neutral-800 pb-4">
        BMTC Route Discovery
      </h2>

      <form onSubmit={handleSearch} className="space-y-4 mb-6">
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Boarding Stop (*)</label>
          <input
            type="text"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="e.g. Majestic"
            className="w-full bg-neutral-900 border border-neutral-800 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-neutral-500"
            required
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Via Waypoint (Optional)</label>
          <input
            type="text"
            value={waypoint}
            onChange={(e) => setWaypoint(e.target.value)}
            placeholder="e.g. Malleshwaram"
            className="w-full bg-neutral-900 border border-neutral-800 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Destination Stop (*)</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Yeshwanthpur"
            className="w-full bg-neutral-900 border border-neutral-800 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-neutral-500"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black font-bold text-sm py-2 rounded hover:bg-neutral-200 transition disabled:opacity-50"
        >
          {loading ? "Searching Engine..." : "Search Routes"}
        </button>
      </form>

      {error && (
        <div className="text-red-400 text-xs bg-red-950/30 p-3 rounded border border-red-900/50 mb-6">
          {error}
        </div>
      )}

      {results && (
        <div className="space-y-6">
          {/* Direct Routes */}
          <div className="space-y-4">
            <h3 className="text-xs uppercase text-neutral-500 tracking-wider">
              Direct Available Routes ({results.one_bus_routes.length})
            </h3>
            {results.one_bus_routes.length === 0 ? (
              <div className="text-xs text-neutral-500">
                No direct single-bus routes found for this path.
              </div>
            ) : (
              results.one_bus_routes.map((route) => {
                const routeId = route.id.replace("direct-", "");
                return (
                  <div
                    key={route.id}
                    className="border border-neutral-800 p-4 rounded-lg bg-neutral-950 flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{route.route_no}</span>
                        <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded">
                          {route.route_type || "ORDINARY"}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {route.legs[0].from} → {route.legs[0].to}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        onSelectRoute([
                          {
                            routeId,
                            routeNo: route.route_no,
                            from: route.legs[0].from,
                            to: route.legs[0].to,
                            legIndex: 1,
                          },
                        ])
                      }
                      className="bg-white text-black text-xs font-bold px-4 py-2 rounded hover:bg-neutral-200 transition"
                    >
                      Select & Track Live
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Multi-Leg Routes */}
          {results.multiple_leg_routes.length > 0 && (
            <div className="space-y-4 border-t border-neutral-800 pt-6">
              <h3 className="text-xs uppercase text-neutral-500 tracking-wider">
                Transfer Routes ({results.multiple_leg_routes.length})
              </h3>
              {results.multiple_leg_routes.map((route) => {
                const { leg1RouteId, leg2RouteId } = extractMultiLegRouteIds(route.id);

                return (
                  <div
                    key={route.id}
                    className="border border-neutral-700 p-4 rounded-lg bg-neutral-900/50 space-y-3"
                  >
                    <div>
                      <div className="text-xs text-neutral-400 mb-1">Transfer at:</div>
                      <div className="font-semibold text-neutral-100">{route.transfer_stop}</div>
                    </div>

                    <div className="space-y-2 bg-black/30 p-3 rounded">
                      {route.legs.map((leg, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-1 rounded font-bold">
                            {leg.route_no}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {leg.from} → {leg.to}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        const legs: SelectedLeg[] = [
                          {
                            routeId: leg1RouteId,
                            routeNo: route.legs[0].route_no,
                            from: route.legs[0].from,
                            to: route.legs[0].to,
                            legIndex: 1,
                          },
                          {
                            routeId: leg2RouteId,
                            routeNo: route.legs[1].route_no,
                            from: route.legs[1].from,
                            to: route.legs[1].to,
                            legIndex: 2,
                          },
                        ];
                        onSelectRoute(legs);
                      }}
                      className="w-full bg-neutral-700 text-white text-xs font-bold py-2 rounded hover:bg-neutral-600 transition"
                    >
                      Track Both Buses Live
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}