import type { ReactNode } from "react";

/** Each page change slides in gently (CSS, under 220ms, off with reduced motion). */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="arcadia-page">{children}</div>;
}
