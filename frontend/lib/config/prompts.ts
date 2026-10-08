/** UI generation ceiling; the API additionally enforces its runtime allowance. */
export const MAX_GENERATION_COUNT = 100;
/** Rows per import request; mirrors the API's `import_max_rows`, which rejects the whole upload above it. */
export const PROMPT_IMPORT_MAX_ROWS = 500;
