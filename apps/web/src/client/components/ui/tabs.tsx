import * as TabsPrimitive from '@radix-ui/react-tabs';

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.List className={`inline-flex items-center rounded-lg bg-muted p-1 ${className}`}>
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  className = '',
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm ${className}`}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className = '',
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount
      className={`mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden ${className}`}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
