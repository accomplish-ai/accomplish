'use client';

import * as React from 'react';
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from '@/lib/utils';

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg";
}) {
  return (
      <AvatarPrimitive.Root
          data-slot="avatar"
          data-size={size}
          className={cn(
              "after:border-border group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-lg after:border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
              className,
          )}
          {...props}
      />
  );
}


function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
      <AvatarPrimitive.Image
          data-slot="avatar-image"
          className={cn(
              "rounded-full aspect-square size-full object-cover",
              className,
          )}
          {...props}
      />
  );
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
      <AvatarPrimitive.Fallback
          data-slot="avatar-fallback"
          className={cn(
              "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-lg text-sm group-data-[size=sm]/avatar:text-xs",
              className,
          )}
          {...props}
      />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
