/** Typed subset of the installed React DOM client API consumed by this entry.
 * The existing project ships React DOM without its optional declaration package.
 * No runtime implementation or alternative renderer is introduced here.
 */
declare module "react-dom/client" {
  import type { ReactNode } from "react";
  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}
