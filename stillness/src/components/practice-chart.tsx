'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChartPoint } from '@/lib/stats';
import { cn } from '@/lib/utils';

interface PracticeChartProps {
  week: ChartPoint[];
  month: ChartPoint[];
  year: ChartPoint[];
}

export function PracticeChart({ week, month, year }: PracticeChartProps) {
  return (
    <Tabs defaultValue="week">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Minutes of practice</h2>
        <TabsList>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="week">
        <Bars points={week} caption="Minutes per day, last 7 days" />
      </TabsContent>
      <TabsContent value="month">
        <Bars points={month} caption="Minutes per day, last 30 days" labelEvery={5} />
      </TabsContent>
      <TabsContent value="year">
        <Bars points={year} caption="Minutes per month, last 12 months" />
      </TabsContent>
    </Tabs>
  );
}

function Bars({ points, caption, labelEvery = 1 }: { points: ChartPoint[]; caption: string; labelEvery?: number }) {
  const max = Math.max(10, ...points.map((p) => p.minutes));
  const total = points.reduce((sum, p) => sum + p.minutes, 0);
  return (
    <figure>
      <div className="flex h-44 items-end gap-[3px] sm:gap-1.5" role="img" aria-label={`${caption}. ${total} minutes in total.`}>
        {points.map((point) => (
          <div key={point.key} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className={cn(
                'w-full rounded-t-lg transition-[height] duration-700 ease-out',
                point.minutes ? (point.isToday ? 'bg-gold' : 'bg-sage/80 group-hover:bg-sage') : 'bg-muted',
              )}
              style={{ height: point.minutes ? `${Math.max(6, (point.minutes / max) * 100)}%` : '4px' }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {point.minutes} min
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px] sm:gap-1.5" aria-hidden>
        {points.map((point, i) => (
          <span key={point.key} className={cn('flex-1 text-center text-[10px] text-muted-foreground', point.isToday && 'font-semibold text-foreground')}>
            {i % labelEvery === 0 || point.isToday ? point.label : ''}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
