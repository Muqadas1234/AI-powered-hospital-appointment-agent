"use client";

import dynamic from "next/dynamic";

const AppContent = dynamic(() => import("./AppContent"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "sans-serif", color: "#5a6783" }}>
      Loading CareVoice Application...
    </div>
  ),
});

export default function Page() {
  return <AppContent />;
}
