"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import {ChevronsUpDownIcon, XIcon} from "lucide-react";

const Autocomplete = AutocompletePrimitive.Root;

function AutocompleteInput({
   className,
   showTrigger = false,
   showClear = false,
   startAddon,
   size,
   ...props
}: Omit<AutocompletePrimitive.Input.Props, "size"> & {
    showTrigger?: boolean;
    showClear?: boolean;
    startAddon?: React.ReactNode;
    size?: "sm" | "default" | "lg" | number;
}) {
    const sizeValue = (size ?? "default") as "sm" | "default" | "lg" | number;

    return (
        // <div className="relative w-full">
        <div className="relative not-has-[>*.w-full]:w-fit w-full text-foreground has-disabled:opacity-64">
        {startAddon && (
                <div
                    aria-hidden="true"
                    className="[&_svg]:-mx-0.5 pointer-events-none absolute inset-y-0 start-px z-10 flex items-center ps-[calc(--spacing(3)-1px)] opacity-80 has-[+[data-size=sm]]:ps-[calc(--spacing(2.5)-1px)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4"
                    data-slot="autocomplete-start-addon"
                >
                    {startAddon}
                </div>
            )}
            <AutocompletePrimitive.Input
                className={cn(
                    startAddon &&
                        "data-[size=sm]:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(7.5)-1px)] *:data-[slot=autocomplete-input]:ps-[calc(--spacing(8.5)-1px)] sm:data-[size=sm]:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(7)-1px)] sm:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(8)-1px)]",
                    sizeValue === "sm"
                        ? "has-[+[data-slot=autocomplete-trigger],+[data-slot=autocomplete-clear]]:*:data-[slot=autocomplete-input]:pe-6.5"
                        : "has-[+[data-slot=autocomplete-trigger],+[data-slot=autocomplete-clear]]:*:data-[slot=autocomplete-input]:pe-7",
                    className,
                )}
                data-slot="autocomplete-input"
                render={<Input className='px-8 focus:outline-hidden focus-visible:ring-0 ' />}
                {...props}
            />
            {showTrigger && (
                <AutocompleteTrigger
                    className={cn(
                        "absolute top-1/2 inline-flex size-7 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-72 transition-colors outline-none hover:opacity-100 has-[+[data-slot=autocomplete-clear]]:hidden pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                        sizeValue === "sm" ? "end-0" : "end-0.5",
                    )}>
                    <ChevronsUpDownIcon />
                </AutocompleteTrigger>
            )}
            {showClear && (
                <AutocompleteClear
                    className={cn(
                        "absolute top-1/2 inline-flex size-7 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-72 transition-colors outline-none hover:opacity-100 has-[+[data-slot=autocomplete-clear]]:hidden pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                        sizeValue === "sm" ? "end-0" : "end-0.5",
                    )}>
                    <XIcon />
                </AutocompleteClear>
            )}
        </div>
    );
}

function AutocompletePopup({
   className,
   children,
   sideOffset = 4,
   ...props
}: AutocompletePrimitive.Popup.Props & {
    sideOffset?: number;
}) {
    return (
        <AutocompletePrimitive.Portal>
            <AutocompletePrimitive.Positioner
                className="z-50 select-none"
                data-slot="autocomplete-positioner"
                sideOffset={sideOffset}>
        <span
            className={cn(
                "bg-popover relative flex max-h-full origin-(--transform-origin) rounded-lg border bg-clip-padding transition-[scale,opacity] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-lg has-data-starting-style:scale-98 has-data-starting-style:opacity-0 dark:not-in-data-[slot=group]:bg-clip-border",
                className,
            )}>
          <AutocompletePrimitive.Popup
              className="flex max-h-[min(var(--available-height),23rem)] w-(--anchor-width) max-w-(--available-width) flex-col"
              data-slot="autocomplete-popup"
              {...props}>
            {children}
          </AutocompletePrimitive.Popup>
        </span>
            </AutocompletePrimitive.Positioner>
        </AutocompletePrimitive.Portal>
    );
}

function AutocompleteItem({
  className,
  children,
  ...props
}: AutocompletePrimitive.Item.Props) {
    return (
        <AutocompletePrimitive.Item
            className={cn(
                "data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1 text-xs/relaxed outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-64",
                className,
            )}
            data-slot="autocomplete-item"
            {...props}>
            {children}
        </AutocompletePrimitive.Item>
    );
}

function AutocompleteSeparator({
   className,
   ...props
}: AutocompletePrimitive.Separator.Props) {
    return (
        <AutocompletePrimitive.Separator
            className={cn("bg-border mx-2 my-1 h-px last:hidden", className)}
            data-slot="autocomplete-separator"
            {...props}
        />
    );
}

function AutocompleteGroup({
   className,
   ...props
}: AutocompletePrimitive.Group.Props) {
    return (
        <AutocompletePrimitive.Group
            className={className}
            data-slot="autocomplete-group"
            {...props}
        />
    );
}

function AutocompleteGroupLabel({
    className,
    ...props
}: AutocompletePrimitive.GroupLabel.Props) {
    return (
        <AutocompletePrimitive.GroupLabel
            className={cn(
                "text-muted-foreground px-2 py-1.5 text-xs font-medium",
                className,
            )}
            data-slot="autocomplete-group-label"
            {...props}
        />
    );
}

function AutocompleteEmpty({
   className,
   ...props
}: AutocompletePrimitive.Empty.Props) {
    return (
        <AutocompletePrimitive.Empty
            className={cn(
                "text-muted-foreground text-center text-sm not-empty:p-2",
                className,
            )}
            data-slot="autocomplete-empty"
            {...props}
        />
    );
}

function AutocompleteRow({
  className,
  ...props
}: AutocompletePrimitive.Row.Props) {
    return (
        <AutocompletePrimitive.Row
            className={className}
            data-slot="autocomplete-row"
            {...props}
        />
    );
}

function AutocompleteValue({ ...props }: AutocompletePrimitive.Value.Props) {
    return (
        <AutocompletePrimitive.Value data-slot="autocomplete-value" {...props} />
    );
}

function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props) {
    return (
        <ScrollArea scrollbarGutter scrollFade>
            <AutocompletePrimitive.List
                className={cn(
                    "not-empty:scroll-py-1 not-empty:px-1 not-empty:py-1 in-data-has-overflow-y:pe-3",
                    className,
                )}
                data-slot="autocomplete-list"
                {...props}
            />
        </ScrollArea>
    );
}

function AutocompleteClear({
   className,
   ...props
}: AutocompletePrimitive.Clear.Props) {
    return (
        <AutocompletePrimitive.Clear
            className={cn(
                "absolute end-0.5 top-1/2 inline-flex size-7 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-72 transition-[color,background-color,box-shadow,opacity] outline-none hover:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            data-slot="autocomplete-clear"
            {...props}>
            <XIcon />
        </AutocompletePrimitive.Clear>
    );
}

function AutocompleteStatus({
    className,
    ...props
}: AutocompletePrimitive.Status.Props) {
    return (
        <AutocompletePrimitive.Status
            className={cn(
                "text-muted-foreground px-3 py-2 text-xs font-medium empty:m-0 empty:p-0",
                className,
            )}
            data-slot="autocomplete-status"
            {...props}
        />
    );
}

function AutocompleteCollection({
    ...props
}: AutocompletePrimitive.Collection.Props) {
    return (
        <AutocompletePrimitive.Collection
            data-slot="autocomplete-collection"
            {...props}
        />
    );
}

function AutocompleteTrigger({
 className,
 ...props
}: AutocompletePrimitive.Trigger.Props) {
    return (
        <AutocompletePrimitive.Trigger
            className={className}
            data-slot="autocomplete-trigger"
            {...props}
        />
    );
}

export {
    Autocomplete,
    AutocompleteInput,
    AutocompleteTrigger,
    AutocompletePopup,
    AutocompleteItem,
    AutocompleteSeparator,
    AutocompleteGroup,
    AutocompleteGroupLabel,
    AutocompleteEmpty,
    AutocompleteValue,
    AutocompleteList,
    AutocompleteClear,
    AutocompleteStatus,
    AutocompleteRow,
    AutocompleteCollection,
};
