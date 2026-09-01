"use client";

import React, { useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

interface DirectRoute {
  id: string;
  route_no: string;
  current_stop_summary: string;
  eta_mins: number;
  is_at_start: boolean;
  legs: { from: string; to: string; route_no: string }[];
}

interface MultiLegRoute {
  id: string;
  transfer_stop: string;
  legs: {
    from: string;
    to: string;
    route_no: string;
    current_stop_summary: string;
    eta_mins: number;
    is_at_start: boolean;
  }[];
}

export default function RouteSearch() {
  const [start, setStart] = useState("Majestic (KBS)");
  const [waypoint, setWaypoint] = useState("");
  const [destination, setDestination] = useState("Chikkabanavara");

  const [oneBusRoutes, setOneBusRoutes] = useState<DirectRoute[]>([]);
  const [multiLegRoutes, setMultiLegRoutes] = useState<MultiLegRoute[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start,
        destination,
        ...(waypoint ? { waypoint } : {}),
      });

      const res = await fetch(`http://localhost:8000/api/v1/routes/search?${params}`);
      const data = await res.json();

      setOneBusRoutes(data.one_bus_routes || []);
      setMultiLegRoutes(data.multiple_leg_routes || []);
    } catch (err) {
      console.error("Failed to fetch routes", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans">
      {/* Search Header Bar */}
      <div className="flex gap-4 mb-8 max-w-3xl">
        <div className="flex-1">
          <Label className="text-xs text-neutral-400 block mb-1">Start</Label>
          <Input
            type="text"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
          />
        </div>

        <div className="flex-1">
          <Label className="text-xs text-neutral-400 block mb-1">Waypoint (Optional)</Label>
          <Input
            type="text"
            value={waypoint}
            onChange={(e) => setWaypoint(e.target.value)}
            placeholder="e.g. Yeshwanthpur TTMC"
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
          />
        </div>

        <div className="flex-1">
          <Label className="text-xs text-neutral-400 block mb-1">Destination</Label>
          <Input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
          />
        </div>

        <div className="flex items-end">
          <Button
            onClick={fetchRoutes}
            className="bg-white text-black text-sm font-medium px-5 py-2 rounded hover:bg-neutral-200 transition"
          >
            {loading ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      {/* Routes Display Box */}
      <div className="max-w-4xl bg-neutral-950 border border-neutral-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-6">Routes</h2>

        {/* ONE BUS SECTION */}
        {oneBusRoutes.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 text-neutral-300">One bus</h3>
            <div className="flex gap-6 overflow-x-auto pb-2">
              {oneBusRoutes.map((route) => (
                <div key={route.id} className="bg-black border border-neutral-800 rounded-lg p-5 min-w-[280px]">
                  <div className="text-sm font-mono text-neutral-400">{route.legs[0].from}</div>
                  
                  {/* Vertical Dotted Line + Route & ETA */}
                  <div className="border-l-2 border-dashed border-neutral-700 ml-2 pl-4 py-3 my-1">
                    <span className="bg-neutral-900 text-white font-mono text-xs px-2.5 py-1 rounded border border-neutral-700 underline underline-offset-4">
                      {route.route_no}
                    </span>
                    <span className="text-xs text-neutral-300 ml-2">
                      ({route.is_at_start ? "Here now" : `${route.current_stop_summary} | ETA: ${route.eta_mins} mins`})
                    </span>
                  </div>

                  <div className="text-sm font-mono text-neutral-400">{route.legs[0].to}</div>

                  <Button className="mt-6 w-full bg-white text-black text-xs font-semibold py-2 rounded hover:bg-neutral-200 transition">
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MULTIPLE LEGS SECTION */}
        {multiLegRoutes.length > 0 && (
          <div>
            <h3 className="text-lg font-medium mb-4 text-neutral-300">Multiple Legs</h3>
            <div className="flex gap-6 overflow-x-auto pb-2">
              {multiLegRoutes.map((route) => (
                <div key={route.id} className="bg-black border border-neutral-800 rounded-lg p-5 min-w-[300px]">
                  {/* Leg 1 */}
                  <div className="text-sm font-mono text-neutral-400">{route.legs[0].from}</div>
                  <div className="border-l-2 border-dashed border-neutral-700 ml-2 pl-4 py-2 my-1">
                    <span className="bg-neutral-900 text-white font-mono text-xs px-2 py-1 rounded border border-neutral-700 underline underline-offset-4">
                      {route.legs[0].route_no}
                    </span>
                  </div>

                  {/* Intermediate Stop */}
                  <div className="text-sm font-mono text-white font-semibold my-1">{route.legs[0].to}</div>

                  {/* Leg 2 */}
                  <div className="border-l-2 border-dashed border-neutral-700 ml-2 pl-4 py-2 my-1">
                    <span className="bg-neutral-900 text-white font-mono text-xs px-2 py-1 rounded border border-neutral-700 underline underline-offset-4">
                      {route.legs[1].route_no}
                    </span>
                  </div>
                  <div className="text-sm font-mono text-neutral-400">{route.legs[1].to}</div>

                  <Button className="mt-6 w-full bg-white text-black text-xs font-semibold py-2 rounded hover:bg-neutral-200 transition">
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {oneBusRoutes.length === 0 && multiLegRoutes.length === 0 && !loading && (
          <div className="text-neutral-500 text-sm py-4">Click "Search" to load routes.</div>
        )}
      </div>
    </div>
  );
}