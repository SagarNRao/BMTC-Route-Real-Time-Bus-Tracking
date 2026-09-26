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

export interface SelectedLeg {
  routeId: string;
  routeNo: string;
  from: string;
  to: string;
  legIndex: number;
}

interface LiveRouteLedgerProps {
  legs: SelectedLeg[];
  onBack: () => void;
}

interface LegState {
  buses: BusTelemetry[];
  isConnected: boolean;
}

export default function LiveRouteLedger({ legs, onBack }: LiveRouteLedgerProps) {
  // Keyed by routeId — one state slot per leg
  const [legStates, setLegStates] = useState<Record<string, LegState>>(() =>
    Object.fromEntries(legs.map((l) => [l.routeId, { buses: [], isConnected: false }]))
  );
  const [activeTab, setActiveTab] = useState<string>(legs[0]?.routeId ?? "");

  useEffect(() => {
    const sockets: WebSocket[] = [];

    legs.forEach((leg) => {
      const ws = new WebSocket(`ws://localhost:8000/ws/routes/${leg.routeId}`);

      ws.onopen = () => {
        setLegStates((prev) => ({
          ...prev,
          [leg.routeId]: { ...prev[leg.routeId], isConnected: true },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "FLEET_LOCATION_UPDATE") {
            setLegStates((prev) => ({
              ...prev,
              [leg.routeId]: { ...prev[leg.routeId], buses: data.buses },
            }));
          }
        } catch (err) {
          console.error(`WS parse error for ${leg.routeNo}:`, err);
        }
      };

      ws.onclose = () => {
        setLegStates((prev) => ({
          ...prev,
          [leg.routeId]: { ...prev[leg.routeId], isConnected: false },
        }));
      };

      sockets.push(ws);
    });

    // Cleanup: close ALL sockets when component unmounts
    return () => {
      sockets.forEach((ws) => ws.close());
    };
  }, []); // intentionally empty — legs are stable on mount

  const isMultiLeg = legs.length > 1;
  const activeLeg = legs.find((l) => l.routeId === activeTab)!;
  const activeState = legStates[activeTab] ?? { buses: [], isConnected: false };

  return (
    <div className="bg-black text-white p-6 font-mono border border-neutral-800 rounded-xl max-w-4xl w-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between border-b border-neutral-800 pb-4 mb-5">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-neutral-500 hover:text-white mb-2 underline underline-offset-4 cursor-pointer block"
          >
            ← Back to Route Search
          </button>
          <h2 className="text-xl font-bold tracking-tight">
            Live Fleet Ledger
            {!isMultiLeg && (
              <span className="bg-neutral-800 text-white px-2 py-0.5 rounded text-sm ml-2 align-middle">
                {legs[0].routeNo}
              </span>
            )}
          </h2>
          {isMultiLeg && (
            <p className="text-xs text-neutral-500 mt-1">
              {legs[0].from} → {legs[legs.length - 1].to} · {legs.length}-leg journey
            </p>
          )}
        </div>

        {/* Connection badges — one per leg */}
        <div className="flex flex-col items-end gap-1.5 pt-6">
          {legs.map((leg) => {
            const connected = legStates[leg.routeId]?.isConnected ?? false;
            return (
              <div key={leg.routeId} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span className="text-neutral-400 font-semibold">
                  {leg.routeNo} — {connected ? "LIVE" : "DISCONNECTED"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Journey strip (multi-leg only) ── */}
      {isMultiLeg && (
        <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1 text-xs">
          {legs.map((leg, idx) => (
            <React.Fragment key={leg.routeId}>
              <span className="text-neutral-500 shrink-0">{leg.from}</span>
              <span className="text-neutral-700 shrink-0">›</span>
              <span className="bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-white font-bold shrink-0">
                {leg.routeNo}
              </span>
              <span className="text-neutral-700 shrink-0">›</span>
              {idx === legs.length - 1 && (
                <span className="text-neutral-500 shrink-0">{leg.to}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Tabs (multi-leg only) ── */}
      {isMultiLeg && (
        <div className="flex gap-0 mb-5 border-b border-neutral-800">
          {legs.map((leg) => {
            const connected = legStates[leg.routeId]?.isConnected ?? false;
            const isActive = activeTab === leg.routeId;
            return (
              <button
                key={leg.routeId}
                onClick={() => setActiveTab(leg.routeId)}
                className={`px-5 py-2.5 text-xs font-bold tracking-wide border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-white text-white"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full mr-2 align-middle ${
                    connected ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                Leg {leg.legIndex} · {leg.routeNo}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Active leg route label ── */}
      <div className="text-xs text-neutral-500 mb-4">
        <span className="text-neutral-300 font-semibold">{activeLeg.routeNo}</span>
        <span className="mx-2 text-neutral-700">·</span>
        {activeLeg.from} → {activeLeg.to}
      </div>

      {/* ── Fleet table ── */}
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
            {activeState.buses.map((bus) => (
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
                  <span
                    className={`text-xs px-2 py-1 rounded border font-semibold ${
                      bus.available_seats > 10
                        ? "bg-neutral-900 border-neutral-800 text-neutral-200"
                        : "bg-red-950/30 border-red-900/50 text-red-400"
                    }`}
                  >
                    {bus.available_seats} left
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {activeState.buses.length === 0 && activeState.isConnected && (
          <div className="text-center py-10 text-neutral-600 text-sm">
            Waiting for live telemetry broadcast...
          </div>
        )}
        {!activeState.isConnected && (
          <div className="text-center py-10 text-neutral-700 text-sm">
            Connecting to telemetry stream...
          </div>
        )}
      </div>

      {/* ── Footer hint (multi-leg only) ── */}
      {isMultiLeg && (
        <div className="mt-6 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
          Both WebSocket streams are running simultaneously. Switch tabs to view each bus.
        </div>
      )}
    </div>
  );
}