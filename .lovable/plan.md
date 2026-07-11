Use the existing robot-reading favicon (`/favicon.ico`) as the source for all PWA install icons, replacing the current book icons.

Plan:

1. Extract the robot-reading image from `public/favicon.ico`.
2. Generate PNG icons from that source:
   - `public/icon-192.png` (192x192, full bleed)
   - `public/icon-512.png` (512x512, full bleed)
   - `public/icon-512-maskable.png` (512x512, with centered content and transparent padding for adaptive/maskable shapes)
3. Keep icon paths unchanged in `vite.config.ts` and `src/routes/__root.tsx` so the manifest and `<head>` links still point to `/icon-192.png`, `/icon-512.png`, `/icon-512-maskable.png`, and `/apple-touch-icon.png`.
4. Update `public/apple-touch-icon.png` to match the robot favicon as well.
5. Run a build to confirm the PWA manifest and service worker still emit correctly.

No new files or routes are created; only the icon assets in `public/` are replaced and regenerated from the favicon source.