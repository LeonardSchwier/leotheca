import { setWorkspacePath, workspaceSelectionError } from "./store";
import { pickWorkspaceFolder } from "../workspace/tauriBridge";
import { useState } from "preact/hooks";

export function WelcomeDialog() {
  const [loading, setLoading] = useState(false);

  const handleChoose = async () => {
    setLoading(true);
    workspaceSelectionError.value = null;
    try {
      const folder = await pickWorkspaceFolder();
      if (folder) await setWorkspacePath(folder.path, folder.token);
    } catch {
      // setWorkspacePath publishes the actionable, non-sensitive error and
      // leaves no active workspace. The dialog stays open for a retry.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="modal-overlay">
      <div class="modal welcome-dialog">
        <h2>Welcome to Leotheca</h2>
        <p>Choose a folder on disk to use as your root workspace. You can change it later from Settings.</p>
        {workspaceSelectionError.value && (
          <p role="alert" class="settings-error">{workspaceSelectionError.value}</p>
        )}
        <button onClick={handleChoose} disabled={loading}>
          {loading ? "Opening folder picker…" : "Choose Folder"}
        </button>
      </div>
    </div>
  );
}
