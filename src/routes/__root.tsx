import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "EVENGIRL";

export const Route = createRootRoute({
  errorComponent: AppErrorComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content, maximum-scale=5" },
      { title: APP_NAME },
      { name: "description", content: "EVENGIRL — ışıltılı kristal güzellik stüdyosu." },
      { name: "theme-color", content: "#ffffff" },
      { name: "color-scheme", content: "light" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: APP_NAME },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Syne:wght@500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="tr" className="antialiased" style={{ colorScheme: "light", background: "#fff" }} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-white text-fg" style={{ background: "#fff", colorScheme: "light" }}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var B="evengirl-bust-0901d";if(localStorage.getItem(B)==="1")return;Object.keys(localStorage).forEach(function(k){if(/even|evengirl|oracle/i.test(k)&&k!==B)localStorage.removeItem(k);});try{sessionStorage.clear();}catch(e){}if(navigator.serviceWorker)navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});if(window.caches)caches.keys().then(function(ks){ks.forEach(function(n){caches.delete(n);});});localStorage.setItem(B,"1");}catch(e){}})();`,
          }}
        />
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
