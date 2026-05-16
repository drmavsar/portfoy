import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "cashflow"
  | "wealth"
  | "screener"
  | "settings"
  | "plus"
  | "chev"
  | "arrowUp"
  | "arrowDown"
  | "arrowR"
  | "download"
  | "upload"
  | "filter"
  | "bell"
  | "sun"
  | "moon"
  | "search"
  | "calendar"
  | "check"
  | "x"
  | "edit"
  | "bolt"
  | "flame"
  | "trash"
  | "ext"
  | "sparkles"
  | "home"
  | "star"
  | "eye"
  | "flag"
  | "dot"
  | "refresh"
  | "coins"
  | "twitter"
  | "rules"
  | "upload2"
  | "folder";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "stroke"> {
  name: IconName;
  size?: number;
  stroke?: number;
}

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </>
  ),
  cashflow: (
    <>
      <path d="M3 8h18M3 16h18" />
      <circle cx="9" cy="8" r="0.5" />
      <circle cx="15" cy="16" r="0.5" />
    </>
  ),
  wealth: (
    <>
      <path d="M3 17l6-6 4 4 8-9" />
      <path d="M14 6h7v7" />
    </>
  ),
  screener: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.7l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chev: <path d="M9 6l6 6-6 6" />,
  arrowUp: <path d="M7 14l5-5 5 5" />,
  arrowDown: <path d="M7 10l5 5 5-5" />,
  arrowR: <path d="M5 12h14M13 5l7 7-7 7" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  upload: <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />,
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4z" />,
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 6 3 7 3 7H3s3-1 3-7M10 21a2 2 0 0 0 4 0" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="M5 13l4 4 10-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  edit: (
    <>
      <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
      <path d="M19 3l3 3-11 11H8v-3z" />
    </>
  ),
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  flame: <path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-2-1-2-3" />,
  trash: <path d="M3 6h18M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />,
  ext: <path d="M14 3h7v7M10 14L21 3M5 5h6M5 12v7h14" />,
  sparkles: (
    <>
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" />
      <path d="M19 14l.7 2L22 17l-2.3 1-.7 2-.7-2L16 17l2.3-1z" />
    </>
  ),
  home: <path d="M3 11l9-8 9 8M5 9v11h14V9" />,
  star: <path d="M12 2l3 7 7 .8-5.3 4.8 1.6 7.4L12 18l-6.3 4 1.6-7.4L2 9.8 9 9z" />,
  eye: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  flag: <path d="M4 21V4M4 4l13 4-3 5 3 5H4" />,
  dot: <circle cx="12" cy="12" r="4" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  coins: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M15 5a6 6 0 0 1 0 12M9 6v6l3 1.5" />
    </>
  ),
  twitter: <path d="M22 5.8c-.7.3-1.5.6-2.4.7a4.2 4.2 0 0 0 1.8-2.3 8.4 8.4 0 0 1-2.6 1 4.2 4.2 0 0 0-7.1 3.8A11.8 11.8 0 0 1 3 4.5a4.2 4.2 0 0 0 1.3 5.6 4.1 4.1 0 0 1-1.9-.5v.1a4.2 4.2 0 0 0 3.4 4.1 4.2 4.2 0 0 1-1.9.1 4.2 4.2 0 0 0 3.9 2.9 8.4 8.4 0 0 1-6.2 1.7A11.8 11.8 0 0 0 8.3 20c7.5 0 11.6-6.2 11.6-11.6V8a8.3 8.3 0 0 0 2.1-2.2z" />,
  rules: (
    <>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <circle cx="18" cy="14" r="3" />
      <path d="M18 11v6" />
    </>
  ),
  upload2: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
};

export function Icon({ name, size = 16, stroke = 1.6, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {PATHS[name] ?? PATHS.dot}
    </svg>
  );
}
