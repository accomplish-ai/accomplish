// apps/desktop/src/renderer/components/settings/shared/ConnectButton.tsx

import {Button} from "@/components/ui/button";
import {Spinner} from "@/components/ui/spinner";
import {PlugZap} from "lucide-react";

interface ConnectButtonProps {
  onClick: () => void;
  connecting: boolean;
  disabled?: boolean;
}

export function ConnectButton({ onClick, connecting, disabled }: ConnectButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={connecting || disabled}
      data-testid="connect-button"
      className="w-full"
      variant='outline'
    >
      {connecting ? (
        <>
          <Spinner />
          Connecting...
        </>
      ) : (
        <>
          <PlugZap className='size-4' />
          Connect
        </>
      )}
    </Button>
  );
}
