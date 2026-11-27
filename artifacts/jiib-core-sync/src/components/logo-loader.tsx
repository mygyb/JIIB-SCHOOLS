import { createPortal } from "react-dom";

// Loading state: a dimmed full-screen overlay with the J-SCHOOLS logo on a cube turning smoothly, and a caption underneath.
export function LogoLoader({ label = "Loading…" }: { label?: string; compact?: boolean }) {
  const overlay = <div role="status" aria-live="polite" data-testid="logo-loader" className="jiib-cube-overlay">
    <div className="text-center">
      <div className="jiib-cube-scene"><div className="jiib-cube">
        {["f", "r", "b", "l"].map((face) => <img key={face} src="/icons/jschools-mark.png" alt="" draggable={false} className={`jiib-cube-face jiib-cube-${face}`} />)}
      </div></div>
      <p className="mt-6 text-sm font-semibold text-white">{label}</p>
    </div>
  </div>;
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
