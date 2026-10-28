import { useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button, Modal } from "../../components/ui";
import "./google-connection.css";

export type GoogleSetup = {
  ready: boolean;
  missing: string[];
  invalid: string[];
};

export function GoogleConnectionSetup({
  setup,
  onClose,
  onRetry,
}: {
  setup?: GoogleSetup;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [message, setMessage] = useState("");
  const encryptionKey = useRef("");
  const callback = window.location.origin + "/api/integrations/google/callback";
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(
        label + " copied. Paste it into the matching Vercel Value field.",
      );
    } catch {
      setMessage(
        "Clipboard access is blocked. Allow clipboard access in your browser and try again.",
      );
    }
  }
  return (
    <Modal title="Set up Google connection" onClose={onClose}>
      <div className="google-setup">
        <p>
          This one-time setup lets Aynor request permission to read private
          sheets. Your spreadsheets stay private.
        </p>
        <ol>
          <li>
            <strong>Create your Google app</strong>
            <p>
              Open Google Cloud, select or create an Aynor project, then enable
              the Google Sheets API.
            </p>
            <a
              href="https://console.cloud.google.com/apis/library/sheets.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              Open Google Cloud <ExternalLink size={13} />
            </a>
          </li>
          <li>
            <strong>Set up Google Auth Platform</strong>
            <p>
              Set the app name to Aynor. Choose an External audience and, while
              testing, add the Google email you use to open your sheets as a
              test user. Under Data Access, add the Google Sheets read-only
              scope: spreadsheets.readonly.
            </p>
          </li>
          <li>
            <strong>Create an OAuth client</strong>
            <p>
              Under Clients, create a <b>Web application</b>. Add this exact
              Authorized redirect URI:
            </p>
            <div className="google-setup-copy">
              <code>{callback}</code>
              <Button
                type="button"
                variant="text"
                aria-label="Copy Google callback URL"
                onClick={() => void copy(callback, "Callback URL")}
              >
                <Copy size={14} />
              </Button>
            </div>
          </li>
          <li>
            <strong>Add the credentials in Vercel Production</strong>
            <p>
              Use these exact names in Key. Put the corresponding value in
              Value. Keep both secrets server-only, without a VITE_ prefix.
            </p>
            <dl>
              {[
                ["GOOGLE_CLIENT_ID", "Client ID from the Google OAuth client"],
                [
                  "GOOGLE_CLIENT_SECRET",
                  "Client secret from the same OAuth client (Secret)",
                ],
                ["GOOGLE_REDIRECT_URI", "The exact callback URL above"],
                [
                  "SHEETS_ENCRYPTION_KEY",
                  "A stable 64-character encryption key (Secret)",
                ],
              ].map(([name, description]) => (
                <div key={name}>
                  <dt>
                    <code>{name}</code>
                    <span>
                      {setup?.invalid.includes(name) ? (
                        "Check value"
                      ) : setup?.missing.includes(name) ? (
                        "Missing"
                      ) : setup ? (
                        <Check size={13} aria-label="Configured" />
                      ) : (
                        "Required"
                      )}
                    </span>
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
            {setup?.missing.includes("SHEETS_ENCRYPTION_KEY") && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!encryptionKey.current)
                    encryptionKey.current = Array.from(
                      crypto.getRandomValues(new Uint8Array(32)),
                      (byte) => byte.toString(16).padStart(2, "0"),
                    ).join("");
                  void copy(encryptionKey.current, "Encryption key");
                }}
              >
                <Copy size={14} />
                Copy new encryption key
              </Button>
            )}
            <p>
              Save, redeploy, then return here and connect Google. Keep the
              encryption key unchanged on future deployments.
            </p>
          </li>
        </ol>
        {message && <p role="status">{message}</p>}
        <div className="google-setup-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={onRetry}>
            Check setup & connect
          </Button>
        </div>
      </div>
    </Modal>
  );
}
