import type { LoadedEpub } from "./epub";

export interface DetectedChapter {
  /** stable id used by the UI */
  id: string;
  /** zip path of the spine document */
  href: string;
  /** element id for fragment, if any */
  anchor?: string;
  /** title to display in TOC */
  title: string;
  /** which heuristic produced this break */
  source: "heading" | "bold" | "keyword" | "break" | "toc" | "fallback";
  /** 0..1 confidence */
  confidence: number;
  /** initially picked? */
  selected: boolean;
  /** estimated page count for this chapter (~280 words/page) */
  pageCount: number;
}

const CHAPTER_KEYWORDS = [
  "capitolo",
  "prologo",
  "epilogo",
  "introduzione",
  "ringraziamenti",
  "prefazione",
  "postfazione",
  "appendice",
  "parte",
  "libro",
  "chapter",
  "prologue",
  "epilogue",
  "foreword",
  "preface",
  "afterword",
  "appendix",
  "acknowledgments",
  "introduction",
  "conclusion",
  "part",
  "book",
];

const KEYWORD_RE = new RegExp(
  `^\\s*(?:${CHAPTER_KEYWORDS.join("|")})\\b[\\s\\.:,\\-–—0-9ivxlcdmIVXLCDM]*$`,
  "i",
);

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function isShort(s: string): boolean {
  const wc = wordCount(s);
  return wc > 0 && wc <= 10 && s.length <= 80;
}

function fontSizePx(style: string): number | null {
  const m = /font-size\s*:\s*([\d.]+)\s*(px|em|rem|pt|%)/i.exec(style);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "px") return n;
  if (unit === "pt") return n * 1.333;
  if (unit === "em" || unit === "rem") return n * 16;
  if (unit === "%") return (n / 100) * 16;
  return null;
}

function isBoldStyle(style: string): boolean {
  const m = /font-weight\s*:\s*(\w+)/i.exec(style);
  if (!m) return false;
  const v = m[1].toLowerCase();
  return v === "bold" || v === "bolder" || (parseInt(v, 10) >= 600 && !isNaN(parseInt(v, 10)));
}

function cleanTitle(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Read spine order from OPF, returning zip paths in reading order. */
function readSpine(epub: LoadedEpub, opfDoc: Document): string[] {
  const manifestItems = Array.from(opfDoc.getElementsByTagNameNS("*", "item"));
  const idToHref = new Map<string, string>();
  for (const it of manifestItems) {
    const id = it.getAttribute("id");
    const href = it.getAttribute("href");
    const mt = it.getAttribute("media-type") ?? "";
    if (id && href && (mt.includes("html") || /\.x?html?$/i.test(href))) {
      idToHref.set(id, href);
    }
  }
  const spineItems = Array.from(opfDoc.getElementsByTagNameNS("*", "itemref"));
  const dir = epub.meta.opfDir;
  const result: string[] = [];
  for (const ref of spineItems) {
    const idref = ref.getAttribute("idref");
    if (!idref) continue;
    const href = idToHref.get(idref);
    if (!href) continue;
    result.push(dir ? `${dir}/${href}` : href);
  }
  return result;
}

/** Extract titles from existing nav.xhtml or toc.ncx to cross-reference. */
async function readExistingTocTitles(
  epub: LoadedEpub,
  opfDoc: Document,
): Promise<Set<string>> {
  const titles = new Set<string>();
  const items = Array.from(opfDoc.getElementsByTagNameNS("*", "item"));
  const dir = epub.meta.opfDir;
  const candidates: string[] = [];
  for (const it of items) {
    const props = (it.getAttribute("properties") ?? "").toLowerCase();
    const mt = (it.getAttribute("media-type") ?? "").toLowerCase();
    const href = it.getAttribute("href");
    if (!href) continue;
    if (props.includes("nav") || mt.includes("x-dtbncx")) {
      candidates.push(dir ? `${dir}/${href}` : href);
    }
  }
  for (const path of candidates) {
    const f = epub.zip.file(path);
    if (!f) continue;
    const text = await f.async("string");
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const labels = Array.from(doc.getElementsByTagNameNS("*", "navLabel"));
    for (const l of labels) {
      const t = l.textContent?.trim();
      if (t) titles.add(t.toLowerCase());
    }
    const anchors = Array.from(doc.getElementsByTagName("a"));
    for (const a of anchors) {
      const t = a.textContent?.trim();
      if (t) titles.add(t.toLowerCase());
    }
  }
  return titles;
}

interface RawBreak {
  anchor?: string;
  title: string;
  source: DetectedChapter["source"];
  confidence: number;
}

/** Heuristic scan of a single HTML document. */
function scanHtml(html: string): RawBreak[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body ?? doc.documentElement;
  if (!body) return [];

  const breaks: RawBreak[] = [];
  const seen = new Set<string>();

  function push(b: RawBreak, key: string) {
    if (!b.title) return;
    if (seen.has(key)) return;
    seen.add(key);
    breaks.push(b);
  }

  // 1) Headings h1..h6
  for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    const els = Array.from(body.getElementsByTagName(tag));
    for (const el of els) {
      const text = cleanTitle(el.textContent ?? "");
      if (!text) continue;
      const level = parseInt(tag.slice(1), 10);
      push(
        {
          anchor: el.id || undefined,
          title: text,
          source: "heading",
          confidence: Math.max(0.5, 1 - (level - 1) * 0.1),
        },
        `${tag}:${text}`,
      );
    }
  }

  // 2) Isolated bold / large inline / keyword paragraphs
  const blockTags = ["p", "div", "section"];
  for (const tag of blockTags) {
    const els = Array.from(body.getElementsByTagName(tag));
    for (const el of els) {
      const text = cleanTitle(el.textContent ?? "");
      if (!text) continue;
      const style = el.getAttribute("style") ?? "";
      const fs = fontSizePx(style);
      const childTags = Array.from(el.children).map((c) => c.tagName.toLowerCase());
      const onlyStrong =
        el.children.length > 0 &&
        childTags.every((t) => t === "b" || t === "strong" || t === "br");

      const isKeyword = KEYWORD_RE.test(text);
      const isBigFont = fs !== null && fs >= 18;
      const isBold = isBoldStyle(style) || onlyStrong;

      if (isKeyword && isShort(text)) {
        push(
          { anchor: el.id || undefined, title: text, source: "keyword", confidence: 0.9 },
          `kw:${text}`,
        );
      } else if (isBold && isShort(text)) {
        push(
          { anchor: el.id || undefined, title: text, source: "bold", confidence: 0.55 },
          `b:${text}`,
        );
      } else if (isBigFont && isShort(text)) {
        push(
          { anchor: el.id || undefined, title: text, source: "bold", confidence: 0.55 },
          `f:${text}`,
        );
      }
    }
  }

  // 3) Sequences of ≥3 <br> followed by short text node
  const brs = Array.from(body.getElementsByTagName("br"));
  for (let i = 0; i < brs.length - 2; i++) {
    if (brs[i + 1].previousSibling === brs[i] && brs[i + 2].previousSibling === brs[i + 1]) {
      // walk forward to next non-whitespace text
      let n: Node | null = brs[i + 2].nextSibling;
      while (n && n.nodeType === 3 && !((n as Text).data ?? "").trim()) n = n.nextSibling;
      if (n) {
        const text = cleanTitle((n.textContent ?? "").split(/\n|<br/i)[0] ?? "");
        if (isShort(text)) {
          push({ title: text, source: "break", confidence: 0.4 }, `br:${text}`);
        }
      }
    }
  }

  return breaks;
}

/** Regex matching titles that are *just* a chapter keyword (e.g. "Capitolo 1"). */
const JUST_KEYWORD_RE =
  /^\s*(?:capitolo|chapter|parte|part|libro|book)\s*(?:[0-9]+|[ivxlcdm]+)?\s*[:.\-–—]?\s*$/i;

/** Detect chapters across the whole ePub. */
export async function detectChapters(
  epub: LoadedEpub,
): Promise<DetectedChapter[]> {
  const opfFile = epub.zip.file(epub.meta.opfPath);
  if (!opfFile) return [];
  const opfText = await opfFile.async("string");
  const opfDoc = new DOMParser().parseFromString(opfText, "application/xml");

  const spine = readSpine(epub, opfDoc);
  const tocTitles = await readExistingTocTitles(epub, opfDoc);

  const raw: DetectedChapter[] = [];
  const fileWords = new Map<string, number>();
  let idx = 0;

  for (const href of spine) {
    const file = epub.zip.file(href);
    if (!file) {
      fileWords.set(href, 0);
      continue;
    }
    const html = await file.async("string");
    const doc = new DOMParser().parseFromString(html, "text/html");
    fileWords.set(href, wordCount(doc.body?.textContent ?? ""));

    let breaks = scanHtml(html);

    // Boost confidence for entries matching the existing TOC
    breaks = breaks.map((b) => {
      if (tocTitles.has(b.title.toLowerCase())) {
        return { ...b, source: "toc", confidence: Math.min(1, b.confidence + 0.3) };
      }
      return b;
    });

    if (breaks.length === 0) {
      const base = href.split("/").pop()?.replace(/\.x?html?$/i, "") ?? `Sezione ${idx + 1}`;
      raw.push({
        id: `c${++idx}`,
        href,
        title: prettifyFilename(base),
        source: "fallback",
        confidence: 0.2,
        selected: false,
        pageCount: 0,
      });
      continue;
    }

    for (const b of breaks) {
      raw.push({
        id: `c${++idx}`,
        href,
        anchor: b.anchor,
        title: b.title,
        source: b.source,
        confidence: b.confidence,
        selected: b.confidence >= 0.55,
        pageCount: 0,
      });
    }
  }

  // Merge "Capitolo X" + adjacent title pairs in the same file
  const merged: DetectedChapter[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (
      next &&
      cur.href === next.href &&
      JUST_KEYWORD_RE.test(cur.title) &&
      !JUST_KEYWORD_RE.test(next.title)
    ) {
      merged.push({
        ...cur,
        title: `${cur.title.trim()} — ${next.title.trim()}`.replace(/\s+/g, " "),
        anchor: cur.anchor ?? next.anchor,
        confidence: Math.max(cur.confidence, next.confidence),
      });
      i++; // skip the consumed sibling
    } else {
      merged.push(cur);
    }
  }

  // Estimate page count per chapter: split each file's words across its chapters
  const countByFile = new Map<string, number>();
  for (const c of merged) countByFile.set(c.href, (countByFile.get(c.href) ?? 0) + 1);
  for (const c of merged) {
    const words = fileWords.get(c.href) ?? 0;
    const n = countByFile.get(c.href) ?? 1;
    c.pageCount = Math.max(0, Math.round(words / n / 280));
    // Auto-deselect zero-page entries (TOC, sommario, frontespizio)
    if (c.pageCount === 0) c.selected = false;
  }

  return merged;
}

function prettifyFilename(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Build EPUB3 nav.xhtml content from approved chapters. */
function buildNavXhtml(chapters: DetectedChapter[], opfDir: string, title: string): string {
  const items = chapters
    .map((c) => {
      const rel = relFromOpf(c.href, opfDir);
      const href = c.anchor ? `${rel}#${c.anchor}` : rel;
      return `    <li><a href="${escapeAttr(href)}">${escapeText(c.title)}</a></li>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="it">
<head>
  <meta charset="utf-8"/>
  <title>${escapeText(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Indice</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

/** Build EPUB2 toc.ncx content from approved chapters. */
function buildNcx(chapters: DetectedChapter[], opfDir: string, title: string): string {
  const points = chapters
    .map((c, i) => {
      const rel = relFromOpf(c.href, opfDir);
      const src = c.anchor ? `${rel}#${c.anchor}` : rel;
      return `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeText(c.title)}</text></navLabel>
      <content src="${escapeAttr(src)}"/>
    </navPoint>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="it">
  <head>
    <meta name="dtb:uid" content="kobo-epub"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeText(title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

function relFromOpf(zipPath: string, opfDir: string): string {
  if (!opfDir) return zipPath;
  const prefix = opfDir + "/";
  return zipPath.startsWith(prefix) ? zipPath.slice(prefix.length) : zipPath;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

/**
 * Write nav.xhtml + toc.ncx into the zip, updating the OPF manifest & spine
 * so e-readers (and Kobo) pick up the new structure.
 */
export async function applyChapters(
  epub: LoadedEpub,
  chapters: DetectedChapter[],
): Promise<void> {
  const opfFile = epub.zip.file(epub.meta.opfPath);
  if (!opfFile) throw new Error("OPF missing");
  let opfText = await opfFile.async("string");
  const opf = new DOMParser().parseFromString(opfText, "application/xml");

  const opfDir = epub.meta.opfDir;
  const navText = buildNavXhtml(chapters, opfDir, epub.meta.title);
  const ncxText = buildNcx(chapters, opfDir, epub.meta.title);

  const navPath = opfDir ? `${opfDir}/nav.xhtml` : "nav.xhtml";
  const ncxPath = opfDir ? `${opfDir}/toc.ncx` : "toc.ncx";
  epub.zip.file(navPath, navText);
  epub.zip.file(ncxPath, ncxText);

  // Update manifest
  const manifest = opf.getElementsByTagNameNS("*", "manifest")[0];
  if (manifest) {
    const ns = manifest.namespaceURI;
    const items = Array.from(manifest.getElementsByTagNameNS("*", "item"));

    // Ensure nav item
    let navItem = items.find((it) =>
      (it.getAttribute("properties") ?? "").includes("nav"),
    );
    if (!navItem) {
      navItem = ns ? opf.createElementNS(ns, "item") : opf.createElement("item");
      navItem.setAttribute("id", "nav");
      navItem.setAttribute("href", "nav.xhtml");
      navItem.setAttribute("media-type", "application/xhtml+xml");
      navItem.setAttribute("properties", "nav");
      manifest.appendChild(navItem);
    } else {
      navItem.setAttribute("href", "nav.xhtml");
      const props = navItem.getAttribute("properties") ?? "";
      if (!props.includes("nav")) navItem.setAttribute("properties", `${props} nav`.trim());
    }

    // Ensure ncx item
    let ncxItem = items.find(
      (it) => (it.getAttribute("media-type") ?? "") === "application/x-dtbncx+xml",
    );
    if (!ncxItem) {
      ncxItem = ns ? opf.createElementNS(ns, "item") : opf.createElement("item");
      ncxItem.setAttribute("id", "ncx");
      ncxItem.setAttribute("href", "toc.ncx");
      ncxItem.setAttribute("media-type", "application/x-dtbncx+xml");
      manifest.appendChild(ncxItem);
    } else {
      ncxItem.setAttribute("href", "toc.ncx");
    }

    // Spine: make sure toc attribute references ncx id
    const spine = opf.getElementsByTagNameNS("*", "spine")[0];
    if (spine && ncxItem) {
      const ncxId = ncxItem.getAttribute("id") ?? "ncx";
      spine.setAttribute("toc", ncxId);
    }

    opfText = new XMLSerializer().serializeToString(opf);
    epub.zip.file(epub.meta.opfPath, opfText);
  }
}
