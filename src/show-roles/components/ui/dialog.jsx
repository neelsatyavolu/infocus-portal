import * as React from "react";

import { Modal } from "./simple-modal";
import { cn } from "../../lib/utils";

const DialogContext = React.createContext({
  open: false,
  onOpenChange: () => {},
});

function Dialog({ open, onOpenChange, children }) {
  const value = React.useMemo(
    () => ({
      open: Boolean(open),
      onOpenChange: typeof onOpenChange === "function" ? onOpenChange : () => {},
    }),
    [open, onOpenChange],
  );

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

const DialogTrigger = ({ children }) => children;
const DialogPortal = ({ children }) => children;
const DialogOverlay = ({ className, ...props }) => (
  <div className={cn("fixed inset-0 bg-black/55", className)} {...props} />
);
const DialogClose = ({ children }) => children;

function DialogContent({ children, className, ...props }) {
  const { open, onOpenChange } = React.useContext(DialogContext);
  return (
    <Modal open={open} onClose={() => onOpenChange(false)} className={className} {...props}>
      {children}
    </Modal>
  );
}

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
