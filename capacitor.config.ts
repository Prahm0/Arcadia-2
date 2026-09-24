import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "app.arcadiahq.arcadia",
  appName: "Arcadia",
  // The iOS shell loads the live app below (server.url). This directory is
  // only a placeholder so Capacitor keeps its standard project structure; its
  // contents are never loaded on device. It must NOT be `public`, because
  // Next.js serves everything under public/ at the site root, and a stray
  // index.html there shadows the real landing page.
  webDir: "capacitor-shell",
  server: {
    url: "https://arcadiahq.app/app",
    // Capacitor iOS loads this bundled page if the remote app cannot start.
    errorPath: "offline.html",
    allowNavigation: ["arcadiahq.app", "*.arcadiahq.app"],
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#04040e",
    scrollEnabled: true,
    preferredContentMode: "mobile",
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#04040e",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#04040e",
    },
  },
};

export default config;
