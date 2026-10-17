import { ImageResponse } from "next/og";

export const alt = "Arcadia, your study plan survives real life";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export const runtime = "edge";

const dmSans = fetch(
  "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf",
).then((response) => response.arrayBuffer());

export default async function OpenGraphImage() {
  const font = await dmSans;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#f3f1ea",
          color: "#1d2a22",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          overflow: "hidden",
          padding: "62px 72px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#d8e0d3",
            borderRadius: "50%",
            height: 560,
            opacity: 0.7,
            position: "absolute",
            right: -190,
            top: -280,
            width: 560,
          }}
        />
        <div
          style={{
            background: "#e5e9df",
            borderRadius: "50%",
            bottom: -310,
            height: 560,
            left: -130,
            position: "absolute",
            width: 560,
          }}
        />

        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontFamily: "DM Sans",
            fontSize: 31,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            position: "relative",
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "#1d2a22",
              borderRadius: 16,
              display: "flex",
              height: 56,
              justifyContent: "center",
              marginRight: 17,
              overflow: "hidden",
              width: 56,
            }}
          >
            <svg
              height="36"
              viewBox="0 0 48 48"
              width="36"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 42 20.5 7h8L17 42Z" fill="#b6d1ab" />
              <path d="M27.5 7 44 42H32.5L20.5 17.5Z" fill="#b6d1ab" />
              <path d="m24 30 6 12H18Z" fill="#b6d1ab" />
            </svg>
          </div>
          Arcadia
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 875,
            position: "relative",
          }}
        >
          <div
            style={{
              color: "#2f4a3a",
              display: "flex",
              fontFamily: "DM Sans",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.11em",
              marginBottom: 25,
              textTransform: "uppercase",
            }}
          >
            A study planner for real life
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "DM Sans",
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: "-0.065em",
              lineHeight: 1.03,
            }}
          >
            Your study plan survives real life.
          </div>
        </div>

        <div
          style={{
            color: "#2f4a3a",
            display: "flex",
            fontFamily: "DM Sans",
            fontSize: 27,
            fontWeight: 500,
            position: "relative",
          }}
        >
          Plans around your week, then adapts when it changes.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          data: font,
          name: "DM Sans",
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
