export * from "./database.types";
export * from "./phone";
export * from "./validators";
export * from "./domain";

import type { Database } from "./database.types";

type PublicTables = Database["public"]["Tables"];
export type Row<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type Insert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type Update<T extends keyof PublicTables> = PublicTables[T]["Update"];
