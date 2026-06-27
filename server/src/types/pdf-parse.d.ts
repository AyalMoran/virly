// Minimal ambient types for pdf-parse v2 (ships no type declarations).
// Only the surface we use is declared.
declare module "pdf-parse" {
  export class PDFParse {
    constructor(options: { data: Uint8Array });
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  }
}
