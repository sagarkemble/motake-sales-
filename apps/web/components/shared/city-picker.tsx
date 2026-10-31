"use client";

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { AddCityDialog } from "~/components/shared/add-city-dialog";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { busiestState, groupCitiesByState, useCities } from "~/hooks/use-cities";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface CityPickerProps {
  id?: string;
  value: string;
  onValueChange: (cityId: string) => void;
  invalid?: boolean;
}

/**
 * The Customer's city, searched by name or state and grouped by state. A missing city is added
 * in a dialog (state + name) and picked at once.
 */
export function CityPicker({ id, value, onValueChange, invalid }: CityPickerProps) {
  const tx = useTranslate();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { cities, isCitiesLoading } = useCities();
  const selected = cities.find((city) => city.id === value);
  const typedName = searchTerm.trim();

  function openAddCity() {
    setOpen(false);
    setIsAddOpen(true);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className="h-10 w-full justify-between rounded-xl bg-muted/40 font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? `${selected.name}, ${selected.state}` : tx("common.cities.placeholder")}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
        >
          <Command>
            <CommandInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder={tx("common.cities.search")}
            />
            <CommandList>
              <CommandEmpty>
                {isCitiesLoading ? tx("common.status.loading") : tx("common.cities.empty")}
              </CommandEmpty>
              {groupCitiesByState(cities).map((group) => (
                <CommandGroup key={group.state} heading={group.state}>
                  {group.cities.map((city) => (
                    <CommandItem
                      key={city.id}
                      value={`${city.name} ${city.state} ${city.id}`}
                      onSelect={() => {
                        onValueChange(city.id);
                        setOpen(false);
                      }}
                    >
                      <CheckIcon
                        className={cn("size-4", city.id === value ? "opacity-100" : "opacity-0")}
                      />
                      <span className="min-w-0 flex-1 truncate">{city.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            {/* Outside the filtered list, so it shows whatever is typed. */}
            <CommandSeparator />
            <div className="p-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start gap-2 text-brand"
                onClick={openAddCity}
              >
                <PlusIcon className="size-4" />
                <span className="truncate">
                  {typedName
                    ? tx("common.cities.addNamed", { name: typedName })
                    : tx("common.cities.add")}
                </span>
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      <AddCityDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        initialName={typedName}
        initialState={selected?.state ?? busiestState(cities)}
        onAdded={(city) => {
          onValueChange(city.id);
          setSearchTerm("");
        }}
      />
    </>
  );
}
