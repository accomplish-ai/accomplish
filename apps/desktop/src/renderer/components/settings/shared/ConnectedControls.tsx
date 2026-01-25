// apps/desktop/src/renderer/components/settings/shared/ConnectedControls.tsx

import {Button} from "@/components/ui/button";
import {InfoIcon} from "lucide-react";
import {Label} from "@/components/ui/label";
import {Field, FieldDescription, FieldLabel} from "@/components/ui/field";

interface ConnectedControlsProps {
  onDisconnect: () => void;
}

export function ConnectedControls({ onDisconnect }: ConnectedControlsProps) {
  return (
      <Field className='bg-muted/50 px-3 py-2 rounded-lg'>
          <FieldLabel className='justify-between'>
            <div className='flex items-center gap-1'>
                <InfoIcon className='size-3.5 text-muted-foreground' />
                <Label>Danger zone</Label>
            </div>
            <Button
            onClick={onDisconnect}
            data-testid="disconnect-button"
            title="Disconnect"
            variant='destructive'
            className='max-w-max'>
              Disconnect
          </Button>
          </FieldLabel>
          <FieldDescription>
              To continue using <span className='font-semibold'>Openwork</span>, you will need to connect to a new provider once disconnected.
          </FieldDescription>
      </Field>
  );
}
