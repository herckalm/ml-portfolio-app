/**
 * Domain filter as a row of toggle buttons. Controlled — owns no state; parent
 * holds the selected value. Options are `PROJECT_DOMAINS` plus an explicit
 * `"all"` sentinel for no-filter. The exhaustive button set (vs a dropdown)
 * keeps the active filter always visible.
 */
import { Button } from "@/components/ui/button";
import { PROJECT_DOMAINS, type ProjectDomain } from "@/types/project";

/** Selected filter: a real domain, or `"all"` meaning no filter applied. */
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
