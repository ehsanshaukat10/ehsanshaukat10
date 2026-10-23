import { ArrowUpRight } from "lucide-react";
import { ExecutiveDashboard } from "../dashboard/ExecutiveDashboard";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, ErrorBox, Modal } from "../../components/ui";
import { api, type Company, type WorkspaceData } from "../../lib/api";
import { useApp } from "../../lib/context";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function Overview({
  company,
}: {
  company: Company;
  save: (d: WorkspaceData) => Promise<boolean | undefined>;
}) {
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(""),
    [error, setError] = useState("");
  const { toast } = useApp();
  return (
    <>
      <ExecutiveDashboard key={company.id} company={company} />
      <div className="workspace-management">
        <Link to="/companies">
          Manage companies <ArrowUpRight size={13} />
        </Link>
        {company.role === "Owner" ? (
          <button onClick={() => setConfirm("archive")}>Archive company</button>
        ) : (
          <button onClick={() => setConfirm("leave")}>Leave company</button>
        )}
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "archive"
              ? "Archive this company?"
              : "Leave this company?"
          }
          onClose={() => setConfirm("")}
        >
          <p>
            {confirm === "archive"
              ? "This hides this company in the prototype. Reset sample data to restore the original sample companies. No real company is affected."
              : "You will lose access to this workspace. You will need a new invitation to return."}
          </p>
          <ErrorBox>{error}</ErrorBox>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirm("")}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api(`/companies/${company.id}/${confirm}`, "POST");
                  toast(
                    confirm === "archive"
                      ? "Company archived."
                      : "You left the company.",
                  );
                  nav("/companies");
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              Confirm {confirm}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
