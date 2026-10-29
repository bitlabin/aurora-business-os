'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NavigationItem } from '@aurora/types';
import { pickLocalized } from '@aurora/ui';
import { useLocale, useT } from '../lib/i18n';
import { NavIconGlyph } from './nav-icons';

interface NavGroup {
  item: NavigationItem;
  children: NavigationItem[];
}

function groupItems(items: NavigationItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    if (item.parentKey === null) groups.push({ item, children: [] });
  }
  for (const item of items) {
    if (item.parentKey === null) continue;
    groups.find((g) => g.item.key === item.parentKey)?.children.push(item);
  }
  return groups;
}

/** `/crm/parties?role=CUSTOMER` is active only for that role; `/crm/parties` only without one. */
function isActive(href: string | null, pathname: string, search: URLSearchParams): boolean {
  if (!href) return false;
  const [path, query = ''] = href.split('?');
  if (path === undefined) return false;
  const samePath = path === '/home' ? pathname === path : pathname.startsWith(path);
  if (!samePath) return false;
  const wanted = new URLSearchParams(query);
  const role = wanted.get('role');
  return role === null ? search.get('role') === null : search.get('role') === role;
}

/**
 * Sidebar in the product-wide order the API returns (Home … Settings). Groups expand when one
 * of their children is the current page or when toggled. Planned entries are rendered disabled
 * with their phase; they are deliberately not links (FDD §26.3). Ctrl/⌘+K focuses the menu
 * filter, which narrows the list by label in either language.
 */
export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavigationItem[];
  onNavigate?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupItems(items), [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const q = filter.trim().toLowerCase();
  const matches = (n: NavigationItem) =>
    q === '' || n.label.en.toLowerCase().includes(q) || n.label.ar.includes(q);

  const visible = groups
    .map((g) => ({
      item: g.item,
      children: g.children.filter(matches),
      self: matches(g.item),
    }))
    .filter((g) => g.self || g.children.length > 0);

  const phaseLabel = (phase: number | null) =>
    phase === null ? t('nav.planned') : t('nav.phase').replace('{n}', String(phase));

  const renderLeaf = (n: NavigationItem, sub: boolean) => {
    const className = sub ? 'au-nav-item au-nav-sub' : 'au-nav-item';
    if (n.status === 'planned' || n.href === null) {
      return (
        <li key={n.key} className={className}>
          <span
            className="au-nav-link au-nav-planned"
            aria-disabled="true"
            title={phaseLabel(n.phase)}
          >
            {n.icon ? <NavIconGlyph name={n.icon} /> : null}
            <span className="au-nav-label">{pickLocalized(n.label, locale)}</span>
            <span className="au-nav-tag">{phaseLabel(n.phase)}</span>
          </span>
        </li>
      );
    }
    return (
      <li key={n.key} className={className}>
        <Link
          className="au-nav-link"
          href={n.href}
          aria-current={isActive(n.href, pathname, search) ? 'page' : undefined}
          onClick={onNavigate}
        >
          {n.icon ? <NavIconGlyph name={n.icon} /> : null}
          <span className="au-nav-label">{pickLocalized(n.label, locale)}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav className="au-sidebar-nav" aria-label={t('nav.menu')}>
      <div className="au-nav-search">
        <input
          ref={searchRef}
          type="search"
          value={filter}
          placeholder={t('nav.search')}
          aria-label={t('nav.search')}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </div>
      <ul className="au-nav">
        {visible.length === 0 ? <li className="au-nav-empty">{t('nav.noMatch')}</li> : null}
        {visible.map((g) => {
          const allChildren = groups.find((x) => x.item.key === g.item.key)?.children ?? [];
          if (allChildren.length === 0) return renderLeaf(g.item, false);

          const childActive = allChildren.some((c) => isActive(c.href, pathname, search));
          const expanded = q !== '' || (open[g.item.key] ?? childActive);
          const planned = g.item.status === 'planned' || g.item.href === null;
          const toggle = () => {
            setOpen((s) => ({ ...s, [g.item.key]: !expanded }));
          };
          return (
            <li key={g.item.key} className="au-nav-item au-nav-group" data-expanded={expanded}>
              <div className="au-nav-row">
                {planned ? (
                  <span
                    className="au-nav-link au-nav-planned"
                    aria-disabled="true"
                    title={phaseLabel(g.item.phase)}
                  >
                    {g.item.icon ? <NavIconGlyph name={g.item.icon} /> : null}
                    <span className="au-nav-label">{pickLocalized(g.item.label, locale)}</span>
                    <span className="au-nav-tag">{phaseLabel(g.item.phase)}</span>
                  </span>
                ) : (
                  <Link
                    className="au-nav-link"
                    href={g.item.href ?? '#'}
                    aria-current={childActive && !expanded ? 'page' : undefined}
                    onClick={() => {
                      setOpen((s) => ({ ...s, [g.item.key]: true }));
                      onNavigate?.();
                    }}
                  >
                    {g.item.icon ? <NavIconGlyph name={g.item.icon} /> : null}
                    <span className="au-nav-label">{pickLocalized(g.item.label, locale)}</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="au-nav-toggle"
                  aria-expanded={expanded}
                  aria-label={pickLocalized(g.item.label, locale)}
                  onClick={toggle}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M4 6l4 4 4-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              {expanded ? (
                <ul className="au-nav-children">{g.children.map((c) => renderLeaf(c, true))}</ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
