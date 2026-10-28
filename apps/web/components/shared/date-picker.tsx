"use client";

import { format, isValid, parse } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

const VALUE_FORMAT = "yyyy-MM-dd";

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = parse(value, VALUE_FORMAT, new Date());
  return isValid(date) ? date : undefined;
}

interface DatePickerProps {
  /** `yyyy-MM-dd`, the same value a native date input holds; "" when empty. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest pickable day, `yyyy-MM-dd`. */
  min?: string;
  max?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Show an X that sets the value back to "". */
  clearable?: boolean;
  className?: string;
}

/** shadcn date picker (Popover + Calendar), a drop-in for `<Input type="date">`. */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  disabled,
  placeholder,
  clearable,
  className,
}: DatePickerProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const [open, setOpen] = useState(false);

  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-11 w-full justify-between rounded-xl bg-muted/40 font-normal",
              !selected && "text-muted-foreground",
              clearable && selected && "pr-9",
            )}
          >
            {selected
              ? formatDate(selected, "d MMM yyyy")
              : (placeholder ?? tx("common.actions.pickDate"))}
            {!(clearable && selected) && <CalendarIcon className="size-4 text-muted-foreground" />}
          </Button>
        </PopoverTrigger>
        {clearable && selected && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={tx("common.actions.clearDate")}
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2 rounded-full"
            onClick={() => onChange("")}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, VALUE_FORMAT));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
