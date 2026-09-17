import { FrontmatterPropertiesPanel, type FrontmatterPropertiesPanelProps } from "../../editor/FrontmatterPropertiesPanel";
import { BacklinksPanel } from "../../linking/BacklinksPanel";
import { CloseIcon } from "../shellIcons";

/** UX-01 spec section 13.7: consolidates Properties and Backlinks into one
 * on-demand panel "without permanently reducing editor height" -- the
 * inline frontmatter box and the always-visible sidebar backlinks list
 * this replaces both did exactly that, unconditionally, whenever a text
 * note was open. Presentational only, per section 24.2: App.tsx owns
 * `inspectorOpen`/`inspectorTab` and every value/callback here.
 *
 * Docking behavior (13.7): this pass renders it as an overlay at every
 * width it appears at (Medium+, matching DocumentHeader/ActivityRail's
 * own scoping), not just Wide/Medium as the spec requires -- Expanded's
 * "may dock" is optional wording, so always-overlay is a spec-compliant,
 * deliberately simpler choice for this first pass rather than adding a
 * third docked layout mode. Compact keeps the pre-Inspector rendering
 * (FrontmatterPropertiesPanel inline, BacklinksPanel in the sidebar)
 * completely untouched; this component does not render there at all. */

export type InspectorTab = "properties" | "backlinks";

export interface InspectorProps {
  activeTab: InspectorTab;
  onSetActiveTab: (tab: InspectorTab) => void;
  onClose: () => void;
  properties: FrontmatterPropertiesPanelProps;
  path: string;
  onOpenFile: (path: string, name: string) => void | Promise<void>;
}

export function Inspector({ activeTab, onSetActiveTab, onClose, properties, path, onOpenFile }: InspectorProps) {
  // A disabled Properties tab (workspace setting) has nothing to show;
  // falling back to Backlinks here keeps the panel from ever opening onto
  // an empty pane, without App.tsx needing to know this rule itself.
  const effectiveTab: InspectorTab = activeTab === "properties" && !properties.enabled ? "backlinks" : activeTab;

  return (
    <aside class="inspector" aria-label="Note inspector">
      <div class="inspector-header">
        <div class="inspector-tabs" role="tablist" aria-label="Inspector tabs">
          {properties.enabled && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === "properties"}
              class={effectiveTab === "properties" ? "active" : ""}
              onClick={() => onSetActiveTab("properties")}
            >
              Properties
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === "backlinks"}
            class={effectiveTab === "backlinks" ? "active" : ""}
            onClick={() => onSetActiveTab("backlinks")}
          >
            Backlinks
          </button>
        </div>
        <button type="button" class="icon-button" aria-label="Close Inspector" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div class="inspector-content">
        {effectiveTab === "properties" ? (
          <FrontmatterPropertiesPanel {...properties} />
        ) : (
          <BacklinksPanel path={path} onOpenFile={onOpenFile} />
        )}
      </div>
    </aside>
  );
}
