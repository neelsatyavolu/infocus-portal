/** Passthrough: the Portal's own template fades its pages in, so wrapping here would animate twice. */
export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
