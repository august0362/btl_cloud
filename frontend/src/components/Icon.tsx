const paths = {
  school: "m2 9 10-5 10 5-10 5L2 9Zm4 2v6l6 3 6-3v-6M22 9v7",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v5h5M8 12h8M8 16h5",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  download: "M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5",
  book: "M12 5v16M3 3c4 0 6 1 9 3 3-2 5-3 9-3v15c-4 0-6 1-9 3-3-2-5-3-9-3V3Z",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 9 3 3 5-5",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  lock: "M6 10h12v12H6V10Zm2 0V6a4 4 0 0 1 8 0v4m-4 5v3",
  user: "M20 21v-3a8 8 0 0 0-16 0v3h16ZM16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  users: "M17 21v-2a5 5 0 0 0-10 0v2M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 14v-2a4 4 0 0 0-3-3.9M3 21v-2a4 4 0 0 1 3-3.9",
  menu: "M3 6h18M3 12h18M3 18h18",
  logout: "M9 3H3v18h6m6-15 6 6-6 6M8 12h13",
  sparkles: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v-5m0-3h.01",
  check: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-4-10 3 3 5-6",
  alert: "M12 3 2 21h20L12 3Zm0 6v5m0 3h.01",
  swap: "M4 8h14l-4-4m6 12H6l4 4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  sort: "M4 6h16M7 12h10M10 18h4",
  sliders: "M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M16 4v4M10 10v4M18 16v4",
  refresh: "M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5m-5 5a8 8 0 0 0 14 5l2-2m0 5v-5h-5",
  terminal: "M3 4h18v16H3V4Zm4 5 3 3-3 3m5 0h5",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  power: "M12 2v10M6.3 5.6a8 8 0 1 0 11.4 0",
  play: "M7 4v16l13-8L7 4Z",
  stop: "M6 6h12v12H6V6Z",
  cloud: "M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.6 10 4 4 0 0 1 18 18H7Z",
  copy: "M9 9h11v11H9V9Zm-4 6H4V4h11v1",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className = "icon" }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
