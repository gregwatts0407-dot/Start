import * as React from "react";
import { navigate } from "./router";

/** Stand-in for next/link in the standalone build. */
const Link = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }>(
  function Link({ href, onClick, prefetch: _prefetch, ...rest }, ref) {
    void _prefetch;
    return (
      <a
        ref={ref}
        href={href.startsWith("/paint/") ? `#${href.slice(7)}` : "#"}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          navigate(href);
        }}
        {...rest}
      />
    );
  },
);

export default Link;
