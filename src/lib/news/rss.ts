import "server-only";

import { XMLParser } from "fast-xml-parser";

import { DROP_PATTERNS, type Feed } from "./feeds";

/**
 * RSS 2.0 / Atom 파싱.
 * 저장하는 것은 제목 + 리드문 + 링크 + 발행시각뿐이다.
 * 기사 전문은 수집·저장하지 않는다 (CLAUDE.md §2-3).
 */

export type NewsItem = {
  source: string;
  url: string;
  title: string;
  lead: string | null;
  published_at: string;
  category: string;
};

/** 리드문 상한. 이보다 길면 전문 저장에 가까워진다. */
const LEAD_MAX = 300;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("#text" in record) return textOf(record["#text"]);
  }
  return "";
}

/** HTML 태그·엔티티를 걷어내고 공백을 정리한다. */
function clean(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toLead(raw: string): string | null {
  const text = clean(raw);
  if (!text) return null;
  return text.length > LEAD_MAX ? `${text.slice(0, LEAD_MAX)}…` : text;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Atom의 link는 배열이거나 속성에 href가 있다. */
function atomLink(link: unknown): string {
  for (const candidate of toArray(link as unknown[])) {
    if (typeof candidate === "string") return candidate;
    const record = candidate as Record<string, unknown>;
    const rel = record["@_rel"];
    if (rel === undefined || rel === "alternate") {
      const href = record["@_href"];
      if (typeof href === "string") return href;
    }
  }
  return "";
}

function toIso(raw: string): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isDropped(url: string, title: string): boolean {
  const haystack = `${url} ${title}`.toLowerCase();
  return DROP_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/** 피드 하나를 받아 정규화한다. 실패하면 빈 배열 — 한 소스가 죽어도 나머지는 돈다. */
export async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  let xml: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(feed.url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return [];
    xml = await response.text();
  } catch {
    return [];
  }

  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const rss = root.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const atomFeed = root.feed as Record<string, unknown> | undefined;

  const entries = channel
    ? toArray(channel.item as Record<string, unknown>[])
    : toArray(atomFeed?.entry as Record<string, unknown>[]);

  const items: NewsItem[] = [];

  for (const entry of entries) {
    const title = clean(textOf(entry.title));
    const url = channel
      ? clean(textOf(entry.link)) || clean(textOf(entry.guid))
      : atomLink(entry.link);

    if (!title || !url.startsWith("http")) continue;
    if (isDropped(url, title)) continue;

    const published =
      toIso(textOf(entry.pubDate)) ??
      toIso(textOf(entry.published)) ??
      toIso(textOf(entry.updated)) ??
      toIso(textOf(entry["dc:date"]));

    // 발행시각이 없으면 "직전 브리핑 이후"를 판단할 수 없어 쓸모가 없다.
    if (!published) continue;

    // 종합 피드는 기사 자체 분류를 따른다. 화이트리스트 밖이면 버린다.
    let category = feed.category;
    if (feed.itemCategory) {
      const mapped = feed.itemCategory(
        clean(textOf(entry.category) || textOf(entry["dc:category"])),
      );
      if (!mapped) continue;
      category = mapped;
    }

    const lead = toLead(
      textOf(entry.description) ||
        textOf(entry.summary) ||
        textOf(entry["content:encoded"]) ||
        textOf(entry.content),
    );

    items.push({
      source: feed.source,
      url,
      title,
      lead,
      published_at: published,
      category,
    });
  }

  return items;
}
