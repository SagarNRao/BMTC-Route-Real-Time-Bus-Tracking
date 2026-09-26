"use client";

import React, { useState } from "react";
import RouteSearch, { SelectedLeg } from "@/components/RouteSearch";
import LiveRouteLedger from "@/components/LiveRouteLedger";

export default function Home() {
  const [selectedLegs, setSelectedLegs] = useState<SelectedLeg[] | null>(null);

  return (
    <main className="min-h-screen bg-black text-white p-8 flex justify-center items-start font-mono">
      {!selectedLegs ? (
        <RouteSearch onSelectRoute={(legs) => setSelectedLegs(legs)} />
      ) : (
        <LiveRouteLedger
          legs={selectedLegs}
          onBack={() => setSelectedLegs(null)}
        />
      )}
    </main>
  );
}