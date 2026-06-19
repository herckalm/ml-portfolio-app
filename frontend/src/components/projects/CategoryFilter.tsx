import { Button } from "@/components/ui/button";
import { PROJECT_DOMAINS, type ProjectDomain } from "@/types/project";

// "all" is an explicit no-filter sentinel
export type DomainFilter = ProjectDomain | "all";

const OPTIONS: DomainFilter[] = ["all", ...PROJECT_DOMAINS];

type CategoryFilterProps = {
  value: DomainFilter;
  onChange: (value: DomainFilter) => void;
};

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter by domain"
    >
      {OPTIONS.map((option) => {
        const selected = option === value;
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            aria-pressed={selected}
            onClick={() => onChange(option)}
          >
            {option === "all" ? "All" : option}
          </Button>
        );
      })}
    </div>
  );
}
