"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { AddCityDialog } from "~/components/shared/add-city-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { busiestState, groupCitiesByState, useCities } from "~/hooks/use-cities";
import { useTranslate } from "~/hooks/use-translate";

/** Every city a Customer can be in, under its state. Cities are added, never edited or removed. */
export function CitiesTab() {
  const tx = useTranslate();
  const { cities, isCitiesLoading, isCitiesError, refetchCities } = useCities();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const term = searchTerm.trim().toLowerCase();
  const shownGroups = groupCitiesByState(
    term
      ? cities.filter(
          (city) =>
            city.name.toLowerCase().includes(term) || city.state.toLowerCase().includes(term),
        )
      : cities,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{tx("admin.settings.cities.intro")}</p>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={tx("common.cities.search")}
            aria-label={tx("common.cities.search")}
            className="rounded-xl bg-muted-soft pl-9"
          />
        </div>
        <Button
          type="button"
          className="shrink-0 gap-1.5 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          onClick={() => setIsAddOpen(true)}
        >
          <PlusIcon className="size-4" />
          {tx("common.cities.add")}
        </Button>
      </div>

      {isCitiesLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : isCitiesError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{tx("admin.settings.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetchCities()}>
            {tx("common.actions.tryAgain")}
          </Button>
        </div>
      ) : shownGroups.length === 0 ? (
        cities.length === 0 ? (
          <EmptyStateCard
            compact
            media="none"
            title={tx("empty.cities.title")}
            body={tx("empty.cities.body")}
            action={{ label: tx("empty.actions.addCity"), onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <EmptyStateCard
            compact
            media="none"
            title={tx("empty.noMatch.title", { term: searchTerm.trim() })}
            body={tx("empty.noMatch.body")}
            action={{ label: tx("empty.actions.clearSearch"), onClick: () => setSearchTerm("") }}
          />
        )
      ) : (
        shownGroups.map((group) => (
          <div key={group.state} className="rounded-xl border bg-card shadow-sm p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{group.state}</p>
              <Badge variant="outline" className="shrink-0 text-muted-foreground">
                {tx(
                  group.cities.length === 1
                    ? "admin.settings.cities.countOne"
                    : "admin.settings.cities.countOther",
                  { count: group.cities.length },
                )}
              </Badge>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {group.cities.map((city) => (
                <li key={city.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {city.name}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <AddCityDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        initialState={busiestState(cities)}
      />
    </div>
  );
}
