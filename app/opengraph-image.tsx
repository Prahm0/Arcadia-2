import { ImageResponse } from "next/og";

export const alt = "Arcadia, your study plan survives real life";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background:
            "radial-gradient(circle at 82% 14%, rgba(130, 86, 255, 0.36), transparent 29%), radial-gradient(circle at 12% 88%, rgba(86, 59, 198, 0.28), transparent 30%), #04040e",
          color: "#f8f7ff",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "64px 72px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontFamily: "sans-serif",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "linear-gradient(145deg, #9c83ff, #6540ee)",
              borderRadius: 18,
              display: "flex",
              fontSize: 35,
              height: 58,
              justifyContent: "center",
              marginRight: 18,
              width: 58,
            }}
          >
            A
          </div>
          ARCADIA
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 910 }}>
          <div
            style={{
              color: "#c7baff",
              display: "flex",
              fontFamily: "sans-serif",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 25,
              textTransform: "uppercase",
            }}
          >
            Study planner for real life
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "serif",
              fontSize: 82,
              fontWeight: 500,
              letterSpacing: "-0.045em",
              lineHeight: 1,
            }}
          >
            Your study plan survives real life.
          </div>
        </div>

        <div
          style={{
            color: "#b5b0c6",
            display: "flex",
            fontFamily: "sans-serif",
            fontSize: 28,
          }}
        >
          Plans around school, deadlines, sport and work. Rebuilds when life changes.
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
