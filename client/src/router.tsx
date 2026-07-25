import {
  useCallback,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

const NAVIGATION_EVENT = "relay:navigate";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(NAVIGATION_EVENT, listener);
  };
}

function snapshot() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function serverSnapshot() {
  return "/";
}

export function useLocation() {
  useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

export function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

export function useNavigate() {
  return useCallback((to: string, options?: { replace?: boolean }) => navigate(to, options?.replace), []);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

export function Link({ to, children, onClick, ...props }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    ) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handleClick} {...props}>{children}</a>;
}

type NavLinkProps = Omit<LinkProps, "className"> & {
  className?: string | ((state: { isActive: boolean }) => string);
};

export function NavLink({ className, to, ...props }: NavLinkProps) {
  const location = useLocation();
  const targetPath = to.split("?")[0];
  const isActive = location.pathname === targetPath;
  const resolvedClassName = typeof className === "function" ? className({ isActive }) : className;
  return <Link to={to} className={resolvedClassName} {...props} />;
}

export function useParams() {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/missions\/([^/]+)$/);
  return { id: match ? decodeURIComponent(match[1]) : undefined };
}

export function useSearchParams() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const setParams = (next: URLSearchParams | Record<string, string>) => {
    const value = next instanceof URLSearchParams ? next : new URLSearchParams(next);
    const query = value.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`);
  };
  return [params, setParams] as const;
}
