"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROWS: Array<[string, string]> = [
  ["Drag piece", "Move a piece or connected group"],
  ["Drag background", "Pan the table (or Space + drag, middle mouse)"],
  ["Scroll / pinch", "Zoom at the cursor (two-finger scroll pans on trackpads)"],
  ["Click / tap piece", "Rotate 90° clockwise (rotation puzzles)"],
  ["Right-click piece", "Rotate 90° counter-clockwise"],
  ["Second finger tap", "Rotate the piece you're dragging (touch)"],
  ["R  /  Shift+R or Q", "Rotate piece under cursor / being dragged"],
  ["Ctrl/⌘ + Z", "Undo"],
  ["Ctrl/⌘ + Shift + Z", "Redo"],
  ["Ctrl/⌘ + S", "Save now"],
  ["G", "Toggle ghost image"],
  ["E", "Cycle piece filter: all → edges → interior"],
  ["F  /  B", "Fit whole table / focus the board"],
  ["+  /  −", "Zoom in / out"],
  ["P", "Toggle side panel"],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Controls & shortcuts</DialogTitle>
          <DialogDescription>Mouse, trackpad, touch and keyboard all work.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y text-sm">
          {ROWS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2">
              <dt>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
              </dt>
              <dd className="text-right text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
