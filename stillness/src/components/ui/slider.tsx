'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  thumbLabel?: string;
  thumbValueText?: string;
  tone?: 'default' | 'light';
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, thumbLabel, thumbValueText, tone = 'default', ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center py-2', className)}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn('relative h-1.5 w-full grow overflow-hidden rounded-full', tone === 'light' ? 'bg-white/20' : 'bg-muted')}
      >
        <SliderPrimitive.Range className={cn('absolute h-full', tone === 'light' ? 'bg-white/90' : 'bg-sage')} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        aria-valuetext={thumbValueText}
        className={cn(
          'block size-4 rounded-full shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none',
          tone === 'light' ? 'bg-white focus-visible:ring-white/40' : 'border-2 border-sage bg-card focus-visible:ring-ring/40',
        )}
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
