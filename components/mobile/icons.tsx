"use client";

export type IconName =
  | "prev" | "next" | "play" | "pause" | "list" | "rec" | "full" | "exitfull" | "back" | "gear" | "plus"
  | "search" | "x" | "tv" | "edit" | "trash" | "up" | "down" | "film" | "clock" | "check" | "stop" | "rotate";

const P: Record<IconName, React.ReactNode> = {
  prev: <><path d="M19 5v14L8 12z" fill="currentColor" stroke="none" /><path d="M5 5v14" /></>,
  next: <><path d="M5 5v14l11-7z" fill="currentColor" stroke="none" /><path d="M19 5v14" /></>,
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
  rec: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  exitfull: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  back: <path d="M15 5l-7 7 7 7" />,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8l1.4 2.6a7.4 7.4 0 0 1 2.2.9l2.8-.9 1.9 3.3-2.1 2a7.4 7.4 0 0 1 0 2.6l2.1 2-1.9 3.3-2.8-.9a7.4 7.4 0 0 1-2.2.9L12 21.2l-1.4-2.6a7.4 7.4 0 0 1-2.2-.9l-2.8.9-1.9-3.3 2.1-2a7.4 7.4 0 0 1 0-2.6l-2.1-2 1.9-3.3 2.8.9a7.4 7.4 0 0 1 2.2-.9z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 21h6M12 17v4" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />,
  up: <path d="M6 14l6-6 6 6" />,
  down: <path d="M6 10l6 6 6-6" />,
  film: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M4 15h16M9 4v16M15 4v16" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  rotate: <><rect x="3" y="8" width="13" height="9" rx="1.5" transform="rotate(-90 9.5 12.5)" /><path d="M17 5h3.5V1.5M20.5 5A9 9 0 0 0 12 3M7 19H3.5v3.5M3.5 19A9 9 0 0 0 12 21" /></>,
};

export function Icon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}
