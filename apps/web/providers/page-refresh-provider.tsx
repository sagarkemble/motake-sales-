"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { RefreshButton } from "~/components/shared/refresh-button";

interface RefreshSource {
  refetch: () => unknown;
  isFetching: boolean;
}

interface PageRefreshContextValue {
  sources: Record<string, RefreshSource>;
  setSource: (id: string, source: RefreshSource | null) => void;
}

const PageRefreshContext = createContext<PageRefreshContextValue | null>(null);

/** Holds what the open page can reload; the navbar's Reload button runs all of it. */
export function PageRefreshProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<Record<string, RefreshSource>>({});

  const setSource = useCallback((id: string, source: RefreshSource | null) => {
    setSources((current) => {
      const next = { ...current };
      if (source) next[id] = source;
      else delete next[id];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ sources, setSource }), [sources, setSource]);
  return <PageRefreshContext.Provider value={value}>{children}</PageRefreshContext.Provider>;
}

/**
 * Registers a page's (or a section's) queries with the navbar's Reload button while it is mounted:
 * `refetch` reloads them, `isFetching` is true while any of them loads. Pass `enabled` false while
 * the queries are off (refetch would run a disabled query anyway).
 */
export function usePageRefresh(refetch: () => unknown, isFetching: boolean, enabled = true) {
  const context = useContext(PageRefreshContext);
  const setSource = context?.setSource;
  const id = useId();
  // The latest refetch, so a new function each render does not re-register.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    setSource?.(id, enabled ? { refetch: () => refetchRef.current(), isFetching } : null);
  }, [setSource, id, isFetching, enabled]);

  useEffect(() => () => setSource?.(id, null), [setSource, id]);
}

/** The navbar's Reload button; shown only while the open page has registered something. */
export function NavbarRefreshButton() {
  const context = useContext(PageRefreshContext);
  const sources = Object.values(context?.sources ?? {});
  if (sources.length === 0) return null;

  return (
    <RefreshButton
      isRefreshing={sources.some((source) => source.isFetching)}
      onRefresh={() => Promise.all(sources.map((source) => source.refetch()))}
    />
  );
}
