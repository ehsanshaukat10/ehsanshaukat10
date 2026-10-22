import { Check } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, ErrorBox, Field, Select } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { useApp } from "../../lib/context";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
export function CompanyProfile({
  company,
  onReload,
}: {
  company: Company;
  onReload: () => void;
}) {
  const [profile, setProfile] = useState({
      name: company.name,
      industry: company.industry,
      country: company.country,
      currency: company.currency,
      timezone: company.timezone,
      website: company.website,
      size: company.size,
      city: company.city || "",
      businessModel: company.businessModel || "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { toast } = useApp();
  const nav = useNavigate();
  const field = (key: keyof typeof profile, v: string) =>
    setProfile((p) => ({ ...p, [key]: v }));
  return (
    <>
      <div className="page-kicker">THE FOUNDATIONS</div>
      <div className="page-title-row">
        <div>
          <h1>Your company, in focus.</h1>
          <p>Keep the essentials up to date.</p>
        </div>
      </div>
      <div className="integration-feature">
        <ErrorBox>{error}</ErrorBox>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(`/companies/${company.id}/profile`, "PATCH", {
                ...profile,
                version: company.version,
              });
              toast("Company details saved.");
              onReload();
              nav(`/companies/${company.id}/onboarding/review`);
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {(
            ["name", "industry", "country", "currency", "timezone"] as const
          ).map((k) => (
            <Field
              key={k}
              label={
                {
                  name: "Company name",
                  industry: "Industry",
                  country: "Country",
                  currency: "Currency",
                  timezone: "Time zone",
                }[k]
              }
              required
              value={profile[k]}
              onChange={(e) => field(k, e.target.value)}
            />
          ))}
          <Field
            label="Website"
            type="url"
            value={profile.website}
            onChange={(e) => field("website", e.target.value)}
          />
          <Field
            label="Company size"
            value={profile.size}
            onChange={(e) => field("size", e.target.value)}
          />
          <Field
            label="City"
            value={profile.city}
            onChange={(e) => field("city", e.target.value)}
          />
          <Select
            label="Business model"
            value={profile.businessModel}
            options={[
              "B2B",
              "B2C",
              "B2B & B2C",
              "Marketplace",
              "Nonprofit",
              "Other",
            ]}
            onChange={(v) => field("businessModel", v)}
          />
          <div className="modal-actions">
            <Link
              className="button secondary"
              to={`/companies/${company.id}/onboarding/review`}
            >
              Back to review
            </Link>
            <Button type="submit" busy={busy}>
              Save company details <Check size={16} />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
