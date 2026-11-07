export type Bookmark =
  | { id: string; kind: "file"; label: string; path: string }
  | { id: string; kind: "search"; label: string; query: string };
