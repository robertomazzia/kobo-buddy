import { createServerFn } from "@tanstack/react-start";

export interface CoverResult {
  id: string;
  source: "openlibrary" | "googlebooks";
  thumbnail: string; // URL for grid preview
  full: string; // URL for full-size download
  title?: string;
  author?: string;
}

export const searchCovers = createServerFn({ method: "POST" })
  .inputValidator((d: { title: string; author: string }) => ({
    title: String(d.title ?? "").slice(0, 200),
    author: String(d.author ?? "").slice(0, 200),
  }))
  .handler(async ({ data }): Promise<CoverResult[]> => {
    const { title, author } = data;
    const results: CoverResult[] = [];

    // Open Library
    try {
      const url = new URL("https://openlibrary.org/search.json");
      url.searchParams.set("title", title);
      if (author) url.searchParams.set("author", author);
      url.searchParams.set("limit", "12");
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const json = (await res.json()) as {
          docs?: Array<{
            cover_i?: number;
            title?: string;
            author_name?: string[];
            key?: string;
          }>;
        };
        for (const doc of json.docs ?? []) {
          if (!doc.cover_i) continue;
          results.push({
            id: `ol-${doc.cover_i}`,
            source: "openlibrary",
            thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
            full: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
            title: doc.title,
            author: doc.author_name?.[0],
          });
        }
      }
    } catch {
      /* ignore */
    }

    // Google Books
    try {
      const q = [`intitle:${title}`, author ? `inauthor:${author}` : ""]
        .filter(Boolean)
        .join("+");
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12`;
      const res = await fetch(url);
      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{
            id: string;
            volumeInfo?: {
              title?: string;
              authors?: string[];
              imageLinks?: {
                thumbnail?: string;
                smallThumbnail?: string;
                small?: string;
                medium?: string;
                large?: string;
                extraLarge?: string;
              };
            };
          }>;
        };
        for (const item of json.items ?? []) {
          const links = item.volumeInfo?.imageLinks;
          const thumb = links?.thumbnail ?? links?.smallThumbnail;
          if (!thumb) continue;
          const httpsThumb = thumb.replace(/^http:/, "https:");
          const large =
            links?.extraLarge ?? links?.large ?? links?.medium ?? links?.small ?? httpsThumb;
          results.push({
            id: `gb-${item.id}`,
            source: "googlebooks",
            thumbnail: httpsThumb,
            full: large.replace(/^http:/, "https:"),
            title: item.volumeInfo?.title,
            author: item.volumeInfo?.authors?.[0],
          });
        }
      }
    } catch {
      /* ignore */
    }

    return results;
  });

export const fetchCoverBytes = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => ({ url: String(d.url) }))
  .handler(async ({ data }): Promise<{ base64: string; mime: string }> => {
    const u = new URL(data.url);
    if (!["covers.openlibrary.org", "books.google.com", "books.googleusercontent.com"].includes(
      u.hostname,
    )) {
      throw new Error("Untrusted cover host");
    }
    const res = await fetch(u, { headers: { Accept: "image/*" } });
    if (!res.ok) throw new Error(`Cover fetch failed: ${res.status}`);
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { base64: btoa(binary), mime };
  });
