/** Each page fades up 4px as it arrives (docs/06 section 7); reduced motion turns it off globally. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}
