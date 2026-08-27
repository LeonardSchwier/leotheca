import { setWorkspacePath } from "./store";
import { pickWorkspaceFolder } from "../workspace/tauriBridge";

export function WelcomeDialog() {
  const handleChoose = async () => {
    const folder = await pickWorkspaceFolder();
    if (folder) await setWorkspacePath(folder.path, folder.token);
  };

  return (
    <div class="modal-overlay">
      <div class="modal welcome-dialog">
        <h2>Welcome to Leotheca</h2>
        <p>Choose a folder on disk to use as your root workspace. You can change it later from Settings.</p>
        <button onClick={handleChoose}>Choose Folder</button>
      </div>
    </div>
  );
}
