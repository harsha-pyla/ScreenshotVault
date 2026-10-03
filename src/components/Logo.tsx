export function Logo({ size = 16, className = "" }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path 
        d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"
        stroke="currentColor" 
        strokeWidth="1.75" 
        strokeLinecap="square"
      />
      <rect x="9.1" y="6" width="1.8" height="8" fill="var(--accent-color)"/>
    </svg>
  );
}
