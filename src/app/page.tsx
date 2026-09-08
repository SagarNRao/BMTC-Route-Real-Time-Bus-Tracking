"use client";

import React, { useState } from "react";
import RouteSearch from "@/components/RouteSearch";
import LiveRouteLedger from "@/components/LiveRouteLedger";

interface SelectedRoute {
  routeId: string;
  routeNo: string;
}

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<SelectedRoute | null>(null);

  return (
    <main className="min-h-screen bg-black text-white p-8 flex justify-center items-start font-mono">
      {!selectedRoute ? (
        <RouteSearch
          onSelectRoute={(routeId, routeNo) =>
            setSelectedRoute({ routeId, routeNo })
          }
        />
      ) : (
        <LiveRouteLedger
          routeId={selectedRoute.routeId}
          routeNo={selectedRoute.routeNo}
          onBack={() => setSelectedRoute(null)}
        />
      )}
    </main>
  );
}