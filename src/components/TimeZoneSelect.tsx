import { useMemo } from "react";
import { listTimeZones } from "../lib/time";
import { Select } from "./ui";

interface Props {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  error?: string;
}

export default function TimeZoneSelect({ id, value, onChange, error }: Props) {
  const zones = useMemo(listTimeZones, []);
  const options = zones.includes(value) ? zones : [value, ...zones];
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} error={error}>
      {options.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
