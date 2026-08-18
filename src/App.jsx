import React, { useState } from "react";
import PipelineHeroV6 from "../temp.jsx";
import PipelineHeroV7 from "../temp2.jsx";
import PipelineHeroV8 from "../temp3.jsx";
import PipelineHeroV9 from "../temp4.jsx";
import PipelineHeroV10 from "../temp5.jsx";
import PipelineHeroV11 from "../temp6.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("v11");

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F5F5F7] flex flex-col">
      {/* Top Header Switcher */}
      <header className="border-b border-white/[0.08] px-6 py-2.5 flex items-center justify-between bg-[#080B10]/90 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
          <span className="font-sans text-xs font-semibold tracking-wider text-[#F5F5F7]">
            AI SOC · PREVIEW
          </span>
          <span className="text-[#86868B] text-xs font-sans hidden sm:inline">
            {activeTab === "v6" && "(temp.jsx · v6)"}
            {activeTab === "v7" && "(temp2.jsx · v7 LANES)"}
            {activeTab === "v8" && "(temp3.jsx · v8 Twin Capsule)"}
            {activeTab === "v9" && "(temp4.jsx · v9 Minimal)"}
            {activeTab === "v10" && "(temp5.jsx · v10 Laminar Flow)"}
            {activeTab === "v11" && "(temp6.jsx · v11 Apple Aesthetic  ✨)"}
          </span>
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.08] rounded-full backdrop-blur">
          {[
            ["v6", "temp"],
            ["v7", "temp2"],
            ["v8", "temp3"],
            ["v9", "temp4"],
            ["v10", "temp5"],
            ["v11", "temp6  ✨"],
          ].map(([id, label]) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  active
                    ? "bg-white/[0.14] text-[#F5F5F7] shadow-sm font-semibold"
                    : "text-[#86868B] hover:text-[#F5F5F7]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === "v6" && <PipelineHeroV6 />}
        {activeTab === "v7" && <PipelineHeroV7 />}
        {activeTab === "v8" && <PipelineHeroV8 />}
        {activeTab === "v9" && <PipelineHeroV9 />}
        {activeTab === "v10" && <PipelineHeroV10 />}
        {activeTab === "v11" && <PipelineHeroV11 />}
      </main>
    </div>
  );
}
