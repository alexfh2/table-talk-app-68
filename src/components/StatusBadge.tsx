import { cn } from "@/lib/utils";
import {
  RESERVATION_STATUS_LABELS,
  RESTAURANT_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  INTEGRATION_STATUS_LABELS,
  type ReservationStatus,
  type RestaurantStatus,
  type HandoffStatus,
  type IntegrationStatus,
} from "@/lib/types";

type Kind =
  | { kind: "reservation"; value: ReservationStatus }
  | { kind: "restaurant"; value: RestaurantStatus }
  | { kind: "handoff"; value: HandoffStatus }
  | { kind: "integration"; value: IntegrationStatus };

const styles: Record<string, string> = {
  // reservation
  pending: "bg-warning/15 text-warning border-warning/30",
  confirmed: "bg-success/15 text-success border-success/30",
  modified: "bg-info/15 text-info border-info/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  requires_human: "bg-destructive/15 text-destructive border-destructive/30",
  no_show: "bg-muted text-muted-foreground border-border",
  // restaurant
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  // handoff
  in_review: "bg-info/15 text-info border-info/30",
  resolved: "bg-success/15 text-success border-success/30",
  // integration
  connected: "bg-success/15 text-success border-success/30",
  needs_review: "bg-warning/15 text-warning border-warning/30",
};

const labels: Record<string, Record<string, string>> = {
  reservation: RESERVATION_STATUS_LABELS,
  restaurant: RESTAURANT_STATUS_LABELS,
  handoff: HANDOFF_STATUS_LABELS,
  integration: INTEGRATION_STATUS_LABELS,
};

export function StatusBadge(props: Kind & { className?: string }) {
  const label = labels[props.kind][props.value] ?? props.value;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[props.value] ?? "bg-muted text-muted-foreground border-border",
        props.className,
      )}
    >
      {label}
    </span>
  );
}