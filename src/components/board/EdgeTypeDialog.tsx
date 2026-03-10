import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EDGE_KIND_COLORS } from "@/stores/board-store";

const EDGE_KINDS = [
  { value: "same_topic", label: "Same Topic" },
  { value: "depends_on", label: "Depends On" },
  { value: "contradicts", label: "Contradicts" },
  { value: "supports", label: "Supports" },
  { value: "continuation_of", label: "Continuation Of" },
  { value: "causes", label: "Causes" },
  { value: "temporal", label: "Temporal" },
];

interface EdgeTypeDialogProps {
  open: boolean;
  onConfirm: (kind: string, label: string) => void;
  onCancel: () => void;
}

export function EdgeTypeDialog({
  open,
  onConfirm,
  onCancel,
}: EdgeTypeDialogProps) {
  const [kind, setKind] = useState("same_topic");
  const [label, setLabel] = useState("");

  const handleConfirm = () => {
    onConfirm(kind, label);
    setKind("same_topic");
    setLabel("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Create Relationship</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose the type of connection between these nodes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Relationship Type
            </label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDGE_KINDS.map((ek) => (
                  <SelectItem key={ek.value} value={ek.value}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-0.5 rounded"
                        style={{
                          backgroundColor:
                            EDGE_KIND_COLORS[ek.value] || "#94a3b8",
                        }}
                      />
                      {ek.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Label (optional)
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., 'led to', 'before'..."
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
