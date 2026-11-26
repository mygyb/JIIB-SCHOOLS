// Page loading state: the J-SCHOOLS logo box turning smoothly with a short caption underneath.
export function LogoLoader({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) {
  return <div role="status" aria-live="polite" data-testid="logo-loader" className={`grid place-items-center text-center ${compact ? "py-8" : "py-20"}`}>
    <div>
      <img src="/icons/jschools-mark.png" alt="" width={64} height={64} className="logo-loader-box mx-auto h-16 w-16 rounded-2xl shadow-lg" />
      <p className="mt-4 text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  </div>;
}
