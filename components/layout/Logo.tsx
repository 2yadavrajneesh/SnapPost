/** The OpenLens mark: an open lens ring, a teal iris and a small amber spark where the ring opens. */
export default function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray="132 31.4" transform="rotate(-62 32 32)" />
      <circle cx="32" cy="32" r="14" fill="#0f766e" />
      <circle cx="32" cy="32" r="6" fill="currentColor" />
      <circle cx="36.5" cy="27.5" r="2.6" fill="#fff" />
      <circle cx="50" cy="13" r="4.2" fill="#fbbf24" />
    </svg>
  );
}
