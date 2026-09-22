import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.arcadiahq.arcadia",
  appName: "Arcadia",
  // The iOS shell loads the live app below. This directory is only a small
  // native fallback that lets Capacitor keep its standard project structure.
  webDir: "public",
  server: {
    url: "https://arcadiahq.app/app",
    allowNavigation: ["arcadiahq.app", "*.arcadiahq.app"],
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0a0e14",
    scrollEnabled: true,
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0a0e14",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0e14",
    },
  },
};

export default config;
