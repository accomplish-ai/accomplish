// apps/desktop/src/renderer/components/settings/shared/ConnectButton.tsx

import connectIcon from '/assets/icons/connect.svg';
import {Button} from "@/components/ui/button";

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
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
          </svg>
          Connecting...
        </>
      ) : (
        <>
          <img src={connectIcon} alt="" className="h-4 w-4" />
          Connect
        </>
      )}
    </Button>
  );
}
