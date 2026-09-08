"use client";

import React, { useEffect, useState } from "react";

interface BusTelemetry {
  bus_id: string;
  latitude: number;
  longitude: number;
  next_stop: string;
  eta_mins: number;
  available_seats: number;
}

interface LiveRouteLedgerProps {
  routeId: string;
  routeNo: string;
  onBack: () => void;
}

export default function LiveRouteLedger({ routeId, routeNo, onBack }: LiveRouteLedgerProps) {
  const [buses, setBuses] = useState<BusTelemetry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Open WebSocket stream to FastAPI telemetry endpoint
    const ws = new WebSocket(`ws://localhost:8000/ws/routes/${routeId}`);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "FLEET_LOCATION_UPDATE") {
          setBuses(data.buses);
        }
      } catch (err) {
        console.error("Failed to parse WebSocket telemetry frame:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [routeId]);

  return (
    <div className="bg-black text-white p-6 font-mono border border-neutral-800 rounded-xl max-w-4xl w-full">
      {/* Header & Control Bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
        <div>
          <button 
            onClick={onBack}
            className="text-xs text-neutral-400 hover:text-white mb-2 underline underline-offset-4 cursor-pointer"
          >
            ← Back to Route Search
          </button>
          <h2 className="text-xl font-bold tracking-tight">
            Live Fleet Ledger <span className="bg-neutral-800 text-white px-2 py-0.5 rounded text-sm ml-2">{routeNo}</span>
          </h2>
        </div>
        
        {/* Connection Status Badge */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-neutral-400 font-semibold">{isConnected ? "LIVE TELEMETRY" : "DISCONNECTED"}</span>
        </div>
      </div>

      {/* Real-time Fleet Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
              <th className="py-3 px-2">Vehicle Reg No.</th>
              <th className="py-3 px-2">Approaching Stop</th>
              <th className="py-3 px-2">Coordinates</th>
              <th className="py-3 px-2">ETA</th>
              <th className="py-3 px-2">Seats</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900">
            {buses.map((bus) => (
              <tr key={bus.bus_id} className="hover:bg-neutral-950 transition-colors">
                <td className="py-3 px-2 font-semibold text-white">{bus.bus_id}</td>
                <td className="py-3 px-2 text-neutral-300">{bus.next_stop}</td>
                <td className="py-3 px-2 text-neutral-500 text-xs">
                  {bus.latitude.toFixed(4)}, {bus.longitude.toFixed(4)}
                </td>
                <td className="py-3 px-2">
                  <span className="bg-neutral-900 border border-neutral-800 text-emerald-400 px-2 py-1 rounded text-xs font-bold">
                    {bus.eta_mins} mins
                  </span>
                </td>
                <td className="py-3 px-2">
                  <span className={`text-xs px-2 py-1 rounded border font-semibold ${
                    bus.available_seats > 10 
                      ? "bg-neutral-900 border-neutral-800 text-neutral-200" 
                      : "bg-red-950/30 border-red-900/50 text-red-400"
                  }`}>
                    {bus.available_seats} left
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {buses.length === 0 && isConnected && (
          <div className="text-center py-8 text-neutral-600 text-sm">
            Waiting for live telemetry broadcast...
          </div>
        )}
      </div>
    </div>
  );
}