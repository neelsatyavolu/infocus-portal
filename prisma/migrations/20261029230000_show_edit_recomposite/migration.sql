-- Automatic editing: "Re-set the anchors on the virtual set", ticked at Start or Redo.
ALTER TABLE "ShowEditJob" ADD COLUMN IF NOT EXISTS "recomposite" BOOLEAN NOT NULL DEFAULT false;
