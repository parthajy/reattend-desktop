import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getRecord, getRecordEntities, getRecordLinks } from "@/lib/tauri-api";
import type { Record as MemoryRecord, Entity, RecordLink } from "@/types";
import { parseTags } from "@/types";
import {
  X,
  ExternalLink,
  Tag,
  User,
  Network,
  Gauge,
  Brain,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

interface MemoryDetailSidebarProps {
  recordId: string | null;
  onClose: () => void;
}

export function MemoryDetailSidebar({
  recordId,
  onClose,
}: MemoryDetailSidebarProps) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<MemoryRecord | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [links, setLinks] = useState<[RecordLink, MemoryRecord][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    setError(null);
    setRecord(null);
    getRecord(recordId)
      .then((rec) => {
        setRecord(rec);
        // Load entities and links in parallel (non-blocking)
        Promise.all([
          getRecordEntities(recordId).catch(() => []),
          getRecordLinks(recordId).catch(() => []),
        ]).then(([ents, lnks]) => {
          setEntities(ents);
          setLinks(lnks as [RecordLink, MemoryRecord][]);
        });
      })
      .catch((err) => {
        console.error("[MemoryDetailSidebar] Failed to load record:", recordId, err);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, [recordId]);

  if (!recordId) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-20 w-[320px] bg-background border-l shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5" />
          Memory Details
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : record ? (
          <div className="p-4 space-y-4">
            {/* Title + Type Badge */}
            <div>
              <Badge variant="secondary" className="text-[10px] mb-1.5">
                {record.type}
              </Badge>
              <h4 className="text-sm font-semibold">{record.title}</h4>
            </div>

            {/* Summary */}
            {record.summary && (
              <p className="text-xs text-muted-foreground">{record.summary}</p>
            )}

            {/* Confidence */}
            {record.confidence != null && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    Confidence: {Math.round(record.confidence * 100)}%
                  </span>
                </div>
                <Progress value={record.confidence * 100} className="h-1" />
              </div>
            )}

            {/* Tags */}
            {parseTags(record.tags).length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Tags
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {parseTags(record.tags).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Entities */}
            {entities.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <User className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Entities
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {entities.map((e) => (
                    <Badge
                      key={e.id}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {e.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Memories */}
            {links.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Network className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Linked Memories ({links.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {links.map(([link, linkedRec]) => (
                    <div
                      key={link.id}
                      className="text-xs p-2 rounded border hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        onClose();
                        navigate(`/memories/${linkedRec.id}`);
                      }}
                    >
                      <Badge
                        variant="outline"
                        className={`text-[9px] mb-0.5 ${
                          link.kind === "depends_on" ? "border-amber-300 text-amber-600 dark:text-amber-400" :
                          link.kind === "followup" || link.kind === "follow_up" ? "border-blue-300 text-blue-600 dark:text-blue-400" :
                          link.kind === "contradicts" ? "border-red-300 text-red-600 dark:text-red-400" :
                          link.kind === "supports" ? "border-emerald-300 text-emerald-600 dark:text-emerald-400" :
                          link.kind === "related_to" ? "border-violet-300 text-violet-600 dark:text-violet-400" :
                          ""
                        }`}
                      >
                        {link.kind.replace(/_/g, " ")}
                      </Badge>
                      <p className="font-medium truncate">{linkedRec.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open Full */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onClose();
                navigate(`/memories/${record.id}`);
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Open Full Memory
            </Button>
          </div>
        ) : (
          <div className="text-center py-8 space-y-2">
            <p className="text-xs text-muted-foreground">Memory not found</p>
            {error && (
              <p className="text-[10px] text-destructive/60 px-4">{error}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (recordId) {
                  setLoading(true);
                  setError(null);
                  getRecord(recordId)
                    .then(setRecord)
                    .catch((e) => setError(String(e)))
                    .finally(() => setLoading(false));
                }
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
