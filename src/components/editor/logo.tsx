/** Strudelton's mark: four tracks rolled up like strudel dough. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="4 -4.5 61 61"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.6}
      strokeLinecap="round"
    >
      <path d="M6 31H40A5 5 0 1 0 35 26M6 37H40A11 11 0 1 0 29 26M6 43H40A17 17 0 1 0 23 26M6 49H40A23 23 0 1 0 17 26" />
    </svg>
  );
}
