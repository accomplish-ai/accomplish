'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
 className,
 ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
      <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className={cn(
              "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 isolate z-50 bg-black/80 duration-200 backdrop-blur-xs",
              className,
          )}
          {...props}
      />
  );
}

function DialogContent({
 className,
 children,
 showCloseButton = true,
 ...props
}: DialogPrimitive.Popup.Props & {
    showCloseButton?: boolean;
}){
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
              "bg-background data-open:animate-fade-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl p-4 text-xs/relaxed ring-1 duration-200 outline-hidden sm:max-w-lg",
              className,
          )}
          {...props}>
          {children}
          {showCloseButton && (
              <DialogPrimitive.Close data-slot="dialog-close" className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
          )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
      <div
          data-slot="dialog-header"
          className={cn("flex flex-col gap-1", className)}
          {...props}
      />
  );
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
      <DialogPrimitive.Title
          data-slot="dialog-title"
          className={cn("text-lg font-semibold leading-none tracking-tight", className)}
          {...props}
      />
  );
}

function DialogDescription({
 className,
 ...props
}: DialogPrimitive.Description.Props) {
  return (
      <DialogPrimitive.Description
          data-slot="dialog-description"
          className={cn(
              "text-muted-foreground hover:[a]:*:text-foreground text-sm/relaxed [a]:*:underline [a]:*:underline-offset-3",
              className,
          )}
          {...props}
      />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
