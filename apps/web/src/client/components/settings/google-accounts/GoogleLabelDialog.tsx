import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GoogleLabelDialogProps {
  open: boolean;
  onConfirm: (label: string) => void;
  onCancel: () => void;
}

const MAX_LABEL_LENGTH = 20;

function GoogleLabelDialogInner({ onConfirm, onCancel }: Omit<GoogleLabelDialogProps, 'open'>) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Label is required.');
      return;
    }
    if (trimmed.length > MAX_LABEL_LENGTH) {
      setError(`Label must be ${MAX_LABEL_LENGTH} characters or less.`);
      return;
    }
    onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <>
      <div className="space-y-3 py-1">
        <p className="text-sm text-muted-foreground">
          Give this Google account a label so you can tell it apart from others.
        </p>
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Work, Personal, School"
          maxLength={MAX_LABEL_LENGTH + 5}
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!label.trim()}>
          Connect
        </Button>
      </DialogFooter>
    </>
  );
}

export function GoogleLabelDialog({ open, onConfirm, onCancel }: GoogleLabelDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Name this account</DialogTitle>
        </DialogHeader>
        {open && <GoogleLabelDialogInner onConfirm={onConfirm} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  );
}
