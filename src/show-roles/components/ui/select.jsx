import * as React from "react";

import { cn } from "../../lib/utils";

const SelectContext = React.createContext({
  value: "",
  onValueChange: () => {},
});

function Select({ value, onValueChange, children }) {
  const contextValue = React.useMemo(
    () => ({
      value: value ?? "",
      onValueChange: typeof onValueChange === "function" ? onValueChange : () => {},
    }),
    [value, onValueChange],
  );

  return <SelectContext.Provider value={contextValue}>{children}</SelectContext.Provider>;
}

const SelectGroup = ({ children }) => children;
const SelectValue = ({ placeholder }) => <span className="text-muted-foreground">{placeholder}</span>;

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("w-full", className)} {...props}>
    {children}
  </div>
));
SelectTrigger.displayName = "SelectTrigger";

const SelectScrollUpButton = ({ children }) => children;
const SelectScrollDownButton = ({ children }) => children;

function SelectContent({ className, children }) {
  const { value, onValueChange } = React.useContext(SelectContext);
  const items = React.Children.toArray(children)
    .filter((child) => React.isValidElement(child) && child.type === SelectItem)
    .map((child) => child.props);

  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        className,
      )}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.children}
        </option>
      ))}
    </select>
  );
}

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <span ref={ref} className={cn("py-1.5 pl-2 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = "SelectLabel";

const SelectItem = ({ children }) => children;
const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = "SelectSeparator";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
