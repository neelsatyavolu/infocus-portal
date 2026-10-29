import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RECOMPOSITE_LABEL, RedoForm } from "@/app/(app)/editing/show-edit-parts";

const redo = async () => true;

describe("re-composite checkbox", () => {
  it("Redo offers it, ticked when the last edit was re-composited", () => {
    const html = renderToStaticMarkup(<RedoForm busy={false} recomposite onRedo={redo} />);
    expect(html).toContain(RECOMPOSITE_LABEL);
    expect(html).toMatch(/<input[^>]*\schecked=""/);
  });

  it("is unticked for an edit that wasn't", () => {
    const html = renderToStaticMarkup(<RedoForm busy={false} recomposite={false} onRedo={redo} />);
    expect(html).toContain(RECOMPOSITE_LABEL);
    expect(html).not.toMatch(/<input[^>]*\schecked=""/);
  });
});
