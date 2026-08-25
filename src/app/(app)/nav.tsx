"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 마스트헤드 네비.
 * 현재 위치는 굵기와 밑줄로만 나타낸다. 색으로 상태를 만들지 않는다 (DESIGN.md §3).
 */

const ITEMS = [
  { href: "/briefing", label: "브리핑" },
  { href: "/holdings", label: "보유자산" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-baseline gap-5">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-small font-semibold underline decoration-fg underline-offset-[6px]"
                : "text-small text-muted hover:text-fg"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
