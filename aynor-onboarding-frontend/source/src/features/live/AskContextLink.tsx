import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { businessLink } from "./dashboard-navigation";
export function AskContextLink({
  companyId,
  search,
  origin,
  focus,
}: {
  companyId: string;
  search: string;
  origin: string;
  focus?: string;
}) {
  const url = businessLink(
    companyId,
    `/companies/${companyId}/ask` +
      (focus ? `?focus=${encodeURIComponent(focus)}` : ""),
    search,
    origin,
  );
  return (
    <Link
      className="button secondary"
      aria-label="Ask Aynor about this view"
      to={url}
    >
      <Sparkles size={14} />
      Ask Aynor
    </Link>
  );
}
