import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ScheduleException } from "@/lib/types";
import { EXCEPTION_KIND_LABELS } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  exceptions: ScheduleException[];
  onAdd: () => void;
  onEdit: (e: ScheduleException) => void;
  onDelete: (e: ScheduleException) => void;
}

function periodLabel(p: string | null) {
  if (p === "lunch") return "Mediodía";
  if (p === "dinner") return "Noche";
  return "Mediodía y noche";
}

export function ExceptionsList({ exceptions, onAdd, onEdit, onDelete }: Props) {
  const sorted = [...exceptions].sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Excepciones</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Las excepciones tienen prioridad sobre las temporadas.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" /> Añadir excepción
        </Button>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay excepciones.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((e) => (
              <li key={e.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {format(parseISO(e.date), "EEEE d 'de' MMMM yyyy", { locale: es })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {EXCEPTION_KIND_LABELS[e.kind] ?? e.kind}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{periodLabel(e.service_period)}</span>
                    {e.start_time && e.end_time && (
                      <span className="text-[11px] text-muted-foreground">
                        · {e.start_time.slice(0, 5)}–{e.end_time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {e.reason && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">Nota interna: {e.reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(e)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(e)} title="Eliminar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}