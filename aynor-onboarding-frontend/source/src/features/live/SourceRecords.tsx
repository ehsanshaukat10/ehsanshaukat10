import { useEffect, useState } from "react";
import { Button, ErrorBox } from "../../components/ui";
import { serverRequest } from "../../lib/runtime";
import { TableOverview, type TableReport } from "./TableOverview";
export function SourceRecords({
  companyId,
  timezone,
  onClose,
}: {
  companyId: string;
  timezone: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TableReport | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    serverRequest<{ data: TableReport | null }>(
      `/companies/${companyId}/sheets/overview?period=all`,
    )
      .then((v) => {
        if (active) {
          setData(v.data);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [companyId, revision]);
  return (
    <section aria-label="Imported source records">
      <Button variant="text" onClick={onClose}>
        Back to connected sources
      </Button>
      <ErrorBox>{error}</ErrorBox>
      {error ? (
        <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
          Retry records
        </Button>
      ) : data?.kind === "tables" ? (
        <TableOverview
          report={data}
          companyId={companyId}
          timezone={timezone}
        />
      ) : (
        <p role="status">
          {loaded
            ? "No imported tables are available."
            : "Loading imported records…"}
        </p>
      )}
    </section>
  );
}
