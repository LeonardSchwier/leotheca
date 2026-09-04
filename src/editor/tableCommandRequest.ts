import { signal } from "@preact/signals";
import type { MarkdownTableCommand } from "../markdown/tableCommands";

export interface TableCommandRequest {
  command: MarkdownTableCommand;
  requestId: number;
}

export const tableCommandRequest = signal<TableCommandRequest | null>(null);

let nextRequestId = 1;

export function requestTableCommand(command: MarkdownTableCommand): void {
  tableCommandRequest.value = { command, requestId: nextRequestId++ };
}
