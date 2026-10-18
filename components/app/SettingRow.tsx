import type { ReactNode } from "react";

/**
 * One Settings row: an icon, a title and a line of explanation on the left,
 * the action on the right. On a phone the action drops under the text and
 * fills the width, so nothing floats with empty space beside it.
 */
export default function SettingRow({ icon, title, detail, children }: { icon?: ReactNode; title: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? (
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{title}</p>
          {detail ? <p className="mt-0.5 text-[13px] leading-5" style={{ color: "var(--app-text-muted)" }}>{detail}</p> : null}
        </div>
      </div>
      {children ? (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center [&>*]:w-full sm:[&>*]:w-auto">{children}</div>
      ) : null}
    </div>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Small line icons for Settings rows. */
export const SettingIcons = {
  calendar: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></svg>,
  link: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" /></svg>,
  star: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><path d="M10 2.5c.6 4 2.5 5.9 6.5 6.5-4 .6-5.9 2.5-6.5 6.5-.6-4-2.5-5.9-6.5-6.5 4-.6 5.9-2.5 6.5-6.5z" /></svg>,
  bell: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12 5 8zM8.5 16.5a1.7 1.7 0 0 0 3 0" /></svg>,
  friends: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><circle cx="7.5" cy="7" r="2.5" /><circle cx="14" cy="8" r="2" /><path d="M3 16c.6-2.5 2.4-4 4.5-4s3.9 1.5 4.5 4M12.5 12.3c1.9 0 3.5 1.3 4 3.2" /></svg>,
  exit: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h3M12 7l3 3-3 3M15 10H8" /></svg>,
  trash: <svg viewBox="0 0 20 20" width="17" height="17" {...stroke}><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" /></svg>,
};
