import { ImageResponse } from "next/og";

// iOS home-screen icon at 180x180. Uses the same 128-unit path as the
// shared Logo component and the favicon so every rendering of the mark
// (browser tab, home screen, in-app corner) reads as the same shape,
// just at different sizes.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0714",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="128" height="128" viewBox="0 0 128 128">
          <path
            fill="#7c5cff"
            fillRule="evenodd"
            d="M64 8 L124 120 L4 120 Z M64 44 L96 108 L32 108 Z M64 76 L78 98 L50 98 Z"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
