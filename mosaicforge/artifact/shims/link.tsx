import * as React from "react";
import { useRoute } from "../router";

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: unknown };

/** Drop-in for next/link that navigates the in-memory router. */
const Link = React.forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, prefetch: _p, ...rest }, ref) {
  void _p;
  return (
    <a
      ref={ref}
      href={href.startsWith("/") ? "#" : href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        useRoute.getState().navigate(href);
      }}
      {...rest}
    />
  );
});

export default Link;
