import * as React from "react";

import { Modal } from "./simple-modal";
import { buttonVariants } from "./button";
import { cn } from "../../lib/utils";

const AlertDialogContext = React.createContext({
  open: false,
  setOpen: () => {},
});

function AlertDialog({ children }) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <AlertDialogContext.Provider value={value}>{children}</AlertDialogContext.Provider>;
}

function AlertDialogTrigger({ asChild, children }) {
  const { setOpen } = React.useContext(AlertDialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (event) => {
        children.props?.onClick?.(event);
        setOpen(true);
      },
    });
  }

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

const AlertDialogPortal = ({ children }) => children;
const AlertDialogOverlay = ({ children }) => children;

function AlertDialogContent({ children, ...props }) {
  const { open, setOpen } = React.useContext(AlertDialogContext);
  return (
    <Modal open={open} onClose={() => setOpen(false)} {...props}>
      {children}
    </Modal>
  );
}

const AlertDialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);

const AlertDialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);

const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogAction = React.forwardRef(({ className, onClick, ...props }, ref) => {
  const { setOpen } = React.useContext(AlertDialogContext);
  return (
    <button
      ref={ref}
      className={cn(buttonVariants(), className)}
      onClick={(event) => {
        onClick?.(event);
        setOpen(false);
      }}
      {...props}
    />
  );
});
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef(({ className, onClick, ...props }, ref) => {
  const { setOpen } = React.useContext(AlertDialogContext);
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant: "outline" }), className)}
      onClick={(event) => {
        onClick?.(event);
        setOpen(false);
      }}
      {...props}
    />
  );
});
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
