"use client";
import { useState } from "react";

// Renders the real Big Ticket logo from /public/logo.png (or logo.svg).
// Drop the official file at public/logo.svg. If it's missing, we fall back to a
// CSS recreation so the header never breaks.
export function Logo({ height = 34 }: { height?: number }) {
  const [imgOk, setImgOk] = useState(true);

  if (imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logo.svg"
        alt="Big Ticket"
        style={{ height, width: "auto", display: "block" }}
        onError={() => setImgOk(false)}
      />
    );
  }

  const d = height;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: d * 0.34 }}>
      <span style={{ position: "relative", width: d * 1.62, height: d, flex: "none" }}>
        <span style={{ position: "absolute", left: 0, top: 0, width: d, height: d, borderRadius: "50%", background: "linear-gradient(135deg,#46d3f0 0%,#7a6cf0 100%)" }} />
        <span style={{ position: "absolute", left: d * 0.62, top: 0, width: d, height: d, borderRadius: "50%", background: "#5e1eb9", mixBlendMode: "multiply" }} />
      </span>
      <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: d * 0.92, letterSpacing: "-0.02em", color: "#5e1eb9", lineHeight: 1 }}>
        big ticket<span style={{ color: "#46d3f0" }}>.</span>
      </span>
    </span>
  );
}
