import { ImageResponse } from "next/og";

// iOS home-screen icon. Safari ignores manifest icons and looks for
// this specific route (Next.js maps /apple-icon → apple-touch-icon).
// Rendered at 180×180 which is the size iOS actually pins to the grid;
// matches the design in app/icon.svg — violet mark on the same dark
// gradient — but PNG for iOS compatibility (Safari doesn't do SVG here).

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(to bottom, #1a1225 0%, #0a0714 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="140" height="140" viewBox="-224 -204 448 444">
          <path
            fill="#7c5cff"
            fillRule="evenodd"
            d="
              M 0 -204 L 224 240 L -224 240 Z
              M 0 -60  L 128 172  L -128 172 Z
              M 0 68   L 56 156   L -56 156  Z
            "
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
