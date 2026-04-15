import { SpinnerGap } from '@phosphor-icons/react';

export function SidebarFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
      <SpinnerGap className="animate-spin mb-2" />
      <div>Loading navigation…</div>
    </div>
  );
}
