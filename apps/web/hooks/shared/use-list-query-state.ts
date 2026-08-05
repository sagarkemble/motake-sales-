import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "./use-debounced-value";

interface UseListQueryStateParams {
  withSearch?: boolean;
}

export function useListQueryState({ withSearch = true }: UseListQueryStateParams = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageFromUrl = Number(searchParams.get("page") ?? "1") || 1;
  const searchTermFromUrl = searchParams.get("q") ?? "";

  const [searchInputValue, setSearchInputValue] = useState(searchTermFromUrl);
  const debouncedSearchTerm = useDebouncedValue(searchInputValue, 350);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (withSearch) {
      if (debouncedSearchTerm) nextSearchParams.set("q", debouncedSearchTerm);
      else nextSearchParams.delete("q");
      if (debouncedSearchTerm !== searchTermFromUrl) nextSearchParams.set("page", "1");
    }

    const nextQueryString = nextSearchParams.toString();
    const currentQueryString = searchParams.toString();
    if (nextQueryString !== currentQueryString) {
      router.replace(`${pathname}${nextQueryString ? `?${nextQueryString}` : ""}`, { scroll: false });
    }
  }, [debouncedSearchTerm, withSearch, searchTermFromUrl, searchParams, pathname, router]);

  function setPage(nextPage: number) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("page", String(nextPage));
    router.replace(`${pathname}?${nextSearchParams.toString()}`, { scroll: false });
  }

  return {
    page: pageFromUrl,
    setPage,
    searchTerm: searchInputValue,
    setSearchTerm: setSearchInputValue,
    debouncedSearchTerm,
  };
}
