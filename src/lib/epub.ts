import JSZip from "jszip";

export interface EpubMeta {
  title: string;
  author: string;
  language?: string;
  coverPath?: string; // path inside zip
  coverMime?: string;
  opfPath: string;
  opfDir: string;
}

export interface LoadedEpub {
  zip: JSZip;
  meta: EpubMeta;
  fileName: string;
  htmlFiles: string[];
  encodingIssues: { path: string; samples: string[] }[];
}

const MOJIBAKE_RE =
  /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â\u0080\u0099|â\u0080\u009C|â\u0080\u009D|â\u0080\u0093|â\u0080\u0094/;

const MOJIBAKE_SAMPLE_RE =
  /\b\w*(?:Ã[©¨à²ùìêâôûîçÉÈÀÒÙÌÊÂÔÛÎÇ]|â\u0080\u0099|â\u0080\u009C|â\u0080\u009D)\w*/g;

function looksLikeMojibake(text: string): boolean {
  return MOJIBAKE_RE.test(text);
}

function tryDecode(bytes: Uint8Array, label: string, fatal = false): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/** Re-decode a mojibake string by interpreting each char's low byte as UTF-8. */
function repairMojibake(text: string): string {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return new TextDecoder("utf-8").decode(bytes);
}

/** Decode bytes as best-effort UTF-8, repairing common mojibake from ISO-8859-1 sources. */
export function decodeToUtf8(bytes: Uint8Array): { text: string; repaired: boolean } {
  const strict = tryDecode(bytes, "utf-8", true);
  if (strict !== null) {
    if (looksLikeMojibake(strict)) {
      return { text: repairMojibake(strict), repaired: true };
    }
    return { text: strict, repaired: false };
  }
  // not valid utf-8 → treat as latin1
  const latin = tryDecode(bytes, "iso-8859-1") ?? tryDecode(bytes, "windows-1252") ?? "";
  return { text: latin, repaired: true };
}

function ensureUtf8Declaration(text: string, kind: "html" | "xml" | "css"): string {
  let out = text;
  if (kind === "xml" || kind === "html") {
    // Update XML prolog
    if (/^\s*<\?xml[^?]*\?>/i.test(out)) {
      out = out.replace(
        /^\s*<\?xml([^?]*)\?>/i,
        (_m, attrs) => {
          const hasEnc = /encoding\s*=/i.test(attrs);
          const cleaned = hasEnc
            ? attrs.replace(/encoding\s*=\s*["'][^"']*["']/i, 'encoding="utf-8"')
            : `${attrs.trim()} encoding="utf-8"`;
          return `<?xml ${cleaned.trim()}?>`;
        },
      );
    }
    if (kind === "html") {
      // Replace meta charset
      if (/<meta[^>]+charset\s*=/i.test(out)) {
        out = out.replace(
          /<meta[^>]+charset\s*=\s*["']?[\w-]+["']?[^>]*>/gi,
          '<meta charset="utf-8"/>',
        );
      } else if (/<head[^>]*>/i.test(out)) {
        out = out.replace(/<head[^>]*>/i, (m) => `${m}\n<meta charset="utf-8"/>`);
      }
    }
  }
  if (kind === "css") {
    if (/^\s*@charset\s+["'][^"']+["']\s*;/i.test(out)) {
      out = out.replace(/^\s*@charset\s+["'][^"']+["']\s*;/i, '@charset "utf-8";');
    }
  }
  return out;
}

function resolveZipPath(base: string, rel: string): string {
  const baseParts = base.split("/").filter(Boolean);
  const relParts = rel.split("/");
  const stack = [...baseParts];
  for (const p of relParts) {
    if (p === "" || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

async function readContainerOpfPath(zip: JSZip): Promise<string> {
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Invalid ePub: missing META-INF/container.xml");
  const text = await containerFile.async("string");
  const doc = parseXml(text);
  const rootfile = doc.getElementsByTagName("rootfile")[0];
  const fullPath = rootfile?.getAttribute("full-path");
  if (!fullPath) throw new Error("Invalid ePub: missing rootfile full-path");
  return fullPath;
}

function getText(doc: Document, tag: string): string {
  const els = doc.getElementsByTagNameNS("*", tag);
  return els[0]?.textContent?.trim() ?? "";
}

export async function loadEpub(file: File): Promise<LoadedEpub> {
  const zip = await JSZip.loadAsync(file);
  const opfPath = await readContainerOpfPath(zip);
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("Invalid ePub: OPF not found");
  const opfText = await opfFile.async("string");
  const opf = parseXml(opfText);

  const title = getText(opf, "title") || file.name.replace(/\.epub$/i, "");
  const author = getText(opf, "creator") || "Unknown";
  const language = getText(opf, "language") || undefined;

  // Find cover via metadata: <meta name="cover" content="<id>"/>
  let coverPath: string | undefined;
  let coverMime: string | undefined;
  const metas = Array.from(opf.getElementsByTagName("meta"));
  const coverMeta = metas.find((m) => m.getAttribute("name") === "cover");
  const items = Array.from(opf.getElementsByTagNameNS("*", "item"));
  if (coverMeta) {
    const id = coverMeta.getAttribute("content");
    const item = items.find((i) => i.getAttribute("id") === id);
    if (item) {
      const href = item.getAttribute("href");
      if (href) {
        coverPath = opfDir ? `${opfDir}/${href}` : href;
        coverMime = item.getAttribute("media-type") ?? undefined;
      }
    }
  }
  // fallback: properties="cover-image"
  if (!coverPath) {
    const item = items.find((i) => (i.getAttribute("properties") ?? "").includes("cover-image"));
    if (item) {
      const href = item.getAttribute("href");
      if (href) {
        coverPath = opfDir ? `${opfDir}/${href}` : href;
        coverMime = item.getAttribute("media-type") ?? undefined;
      }
    }
  }

  // Collect html/xhtml files referenced in manifest
  const htmlFiles: string[] = [];
  for (const item of items) {
    const mt = item.getAttribute("media-type") ?? "";
    const href = item.getAttribute("href");
    if (!href) continue;
    if (mt.includes("html") || /\.x?html?$/i.test(href)) {
      htmlFiles.push(opfDir ? `${opfDir}/${href}` : href);
    }
  }

  // Scan for encoding issues
  const encodingIssues: LoadedEpub["encodingIssues"] = [];
  for (const path of htmlFiles) {
    const f = zip.file(path);
    if (!f) continue;
    const bytes = await f.async("uint8array");
    const strict = tryDecode(bytes, "utf-8", true);
    const text = strict ?? tryDecode(bytes, "iso-8859-1") ?? "";
    if (strict === null || looksLikeMojibake(text)) {
      const samples = Array.from(text.matchAll(MOJIBAKE_SAMPLE_RE))
        .slice(0, 4)
        .map((m) => m[0]);
      encodingIssues.push({ path, samples: samples.length ? samples : ["(non-UTF8 bytes)"] });
    }
  }

  return {
    zip,
    meta: { title, author, language, coverPath, coverMime, opfPath, opfDir },
    fileName: file.name,
    htmlFiles,
    encodingIssues,
  };
}

/** Rewrite every text file inside the zip as clean UTF-8, repairing mojibake. */
export async function normalizeEncoding(epub: LoadedEpub): Promise<number> {
  let fixed = 0;
  const targets: { path: string; kind: "html" | "xml" | "css" }[] = [];
  epub.zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const lower = relPath.toLowerCase();
    if (/\.(x?html?|htm|opf|ncx|xml)$/i.test(lower)) targets.push({ path: relPath, kind: lower.endsWith(".css") ? "css" : lower.endsWith(".opf") || lower.endsWith(".ncx") || lower.endsWith(".xml") ? "xml" : "html" });
    else if (/\.css$/i.test(lower)) targets.push({ path: relPath, kind: "css" });
  });

  for (const { path, kind } of targets) {
    const file = epub.zip.file(path);
    if (!file) continue;
    const bytes = await file.async("uint8array");
    const { text, repaired } = decodeToUtf8(bytes);
    const normalized = ensureUtf8Declaration(text, kind);
    if (repaired || normalized !== text) fixed++;
    epub.zip.file(path, normalized);
  }
  return fixed;
}

/** Replace the cover image inside the ePub with new bytes. Returns updated meta. */
export async function setCover(
  epub: LoadedEpub,
  imageBytes: Uint8Array,
  mime: string,
): Promise<void> {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const opfFile = epub.zip.file(epub.meta.opfPath);
  if (!opfFile) throw new Error("OPF missing");
  let opfText = await opfFile.async("string");
  const opf = parseXml(opfText);

  // Replace bytes at existing coverPath if present, else create new file
  let coverPath = epub.meta.coverPath;
  if (coverPath) {
    epub.zip.file(coverPath, imageBytes);
  } else {
    const dir = epub.meta.opfDir;
    coverPath = `${dir ? dir + "/" : ""}cover.${ext}`;
    epub.zip.file(coverPath, imageBytes);

    // Add manifest item + meta
    const manifest = opf.getElementsByTagNameNS("*", "manifest")[0];
    const metadata = opf.getElementsByTagNameNS("*", "metadata")[0];
    if (manifest && metadata) {
      const ns = manifest.namespaceURI;
      const item = ns
        ? opf.createElementNS(ns, "item")
        : opf.createElement("item");
      item.setAttribute("id", "cover-image");
      item.setAttribute("href", `cover.${ext}`);
      item.setAttribute("media-type", mime);
      item.setAttribute("properties", "cover-image");
      manifest.appendChild(item);

      const metaEl = ns
        ? opf.createElementNS(ns, "meta")
        : opf.createElement("meta");
      metaEl.setAttribute("name", "cover");
      metaEl.setAttribute("content", "cover-image");
      metadata.appendChild(metaEl);

      opfText = new XMLSerializer().serializeToString(opf);
      epub.zip.file(epub.meta.opfPath, opfText);
    }
    epub.meta.coverPath = coverPath;
    epub.meta.coverMime = mime;
  }
}

export async function getCoverDataUrl(epub: LoadedEpub): Promise<string | null> {
  if (!epub.meta.coverPath) return null;
  const file = epub.zip.file(epub.meta.coverPath);
  if (!file) return null;
  const bytes = await file.async("uint8array");
  const mime = epub.meta.coverMime ?? "image/jpeg";
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

export async function packEpub(epub: LoadedEpub): Promise<Blob> {
  // Ensure mimetype file is first and stored uncompressed
  return epub.zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}

export { resolveZipPath };
