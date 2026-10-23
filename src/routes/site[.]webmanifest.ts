import { createFileRoute } from "@tanstack/react-router";
import { BRAND_NAME } from "@/shared/brand";

// The web app manifest, built here rather than kept as a static file so the
// installed app's name follows the brand settings.
function handleManifestRequest(): Response {
  return Response.json(
    {
      name: BRAND_NAME,
      short_name: BRAND_NAME,
      icons: [
        {
          src: "/android-chrome-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/android-chrome-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
      theme_color: "#0a0f0d",
      background_color: "#0a0f0d",
      display: "standalone",
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}

export const Route = createFileRoute("/site.webmanifest")({
  server: {
    handlers: {
      GET: () => handleManifestRequest(),
    },
  },
});
