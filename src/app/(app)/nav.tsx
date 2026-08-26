"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 마스트헤드 네비.
 * 현재 위치는 굵기와 밑줄로만 나타낸다. 색으로 상태를 만들지 않는다 (DESIGN.md §3).
 */

const ITEMS = [
  { href: "/briefing", label: "브리핑" },
  { href: "/threads", label: "이슈" },
  { href: "/glossary", label: "단어장" },
  { href: "/holdings", label: "보유자산" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-baseline gap-5">
      {ITEMS.map((item) => {
        // 이슈 상세는 /thread/[id]라 /threads로 시작하지 않는다. 그래도 이슈다.
        const active =
          pathname.startsWith(item.href) ||
          (item.href === "/threads" && pathname.startsWith("/thread"));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-subhead text-ink underline decoration-ink decoration-2 underline-offset-8"
                : "text-subhead text-faint hover:text-ink"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
