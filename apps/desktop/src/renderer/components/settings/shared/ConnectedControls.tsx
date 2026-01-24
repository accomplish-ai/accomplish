// apps/desktop/src/renderer/components/settings/shared/ConnectedControls.tsx

import {Button} from "@/components/ui/button";
import {InfoIcon} from "lucide-react";
import {Label} from "@/components/ui/label";

interface ConnectedControlsProps {
  onDisconnect: () => void;
}

export function ConnectedControls({ onDisconnect }: ConnectedControlsProps) {
  return (
    <div className="flex flex-col gap-4 bg-muted/50 p-2 rounded-xl">
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-1'>
            <InfoIcon className='size-3.5 text-muted-foreground' />
            <Label>Danger zone</Label>
          </div>
        <p>
            This will disconnect you from the active provider. To continue using <span className='font-semibold'>Openwork</span>, you will need to connect to a new provider.
        </p>
        </div>
      <Button
        onClick={onDisconnect}
        data-testid="disconnect-button"
        title="Disconnect"
        variant='destructive'
      >
          Disconnect
      </Button>
    </div>
  );
}
