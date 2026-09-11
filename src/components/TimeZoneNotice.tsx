import { Button } from "./ui";

interface Props {
  pollZone: string;
  localZone: string;
  viewZone: string;
  onChange: (zone: string) => void;
}

/** "Times shown in X · View in my local time zone" */
export default function TimeZoneNotice({ pollZone, localZone, viewZone, onChange }: Props) {
  const differs = pollZone !== localZone;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-mute">
      <span>
        Times shown in <span className="font-medium text-ink">{viewZone.replace(/_/g, " ")}</span>
      </span>
      {differs && (
        <Button
          variant="quiet"
          className="!px-2 !py-0.5 text-[15px] underline underline-offset-4"
          onClick={() => onChange(viewZone === pollZone ? localZone : pollZone)}
        >
          {viewZone === pollZone
            ? `View in my local time (${localZone.replace(/_/g, " ")})`
            : `View in the poll's time zone (${pollZone.replace(/_/g, " ")})`}
        </Button>
      )}
    </p>
  );
}
