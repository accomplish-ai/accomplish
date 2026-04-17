import { cn } from '@/lib/utils';
import loadingSymbol from '/assets/loading-symbol.svg';

export const SpinningIcon = ({ className }: { className?: string }) => (
  <img src={loadingSymbol} alt="" className={cn('animate-spin-ccw', className)} />
);
