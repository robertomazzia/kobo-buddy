import { createFileRoute } from "@tanstack/react-router";

// The Kobo browser cannot run React. Redirect to the static ES5 page in /public.
export const Route = createFileRoute("/kobo")({
  ssr: false,
  component: KoboRedirect,
});

function KoboRedirect() {
  if (typeof window !== "undefined") {
    window.location.replace("/kobo.html");
  }
  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content="0; url=/kobo.html" />
        <title>Redirect</title>
      </head>
      <body style={{ background: "#fff", color: "#000", fontFamily: "serif", fontSize: 20, padding: 20 }}>
        <a href="/kobo.html">Apri la libreria</a>
      </body>
    </html>
  );
}
