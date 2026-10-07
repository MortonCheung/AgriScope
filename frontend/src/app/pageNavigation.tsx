import { forwardRef, useCallback } from 'react';
import { Link, NavLink, useLocation, useNavigate, type LinkProps, type NavLinkProps, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom';
import { isSpatialEntry } from './routeTransitions';

function canAnimateNavigation(from: string, to: To) {
  const pathname = typeof to === 'string' ? to.split(/[?#]/, 1)[0] : to.pathname;
  return typeof document.startViewTransition === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && Boolean(pathname && pathname !== from && !isSpatialEntry(from, pathname));
}

export const BEFORE_PAGE_NAVIGATION_EVENT = 'agriscope:before-page-navigation';

function notifyBeforeNavigation(from: string, to: To) {
  const pathname = typeof to === 'string' ? to.split(/[?#]/, 1)[0] : to.pathname;
  if (!pathname || pathname === from) return;
  window.dispatchEvent(new CustomEvent(BEFORE_PAGE_NAVIGATION_EVENT, { detail: { from, to: pathname } }));
}

/** Use the router's public transition option; it also records reverse POPs. */
export const TransitionLink = forwardRef<HTMLAnchorElement, LinkProps>(function TransitionLink({ to, viewTransition, onClick, ...props }, ref) {
  const { pathname } = useLocation();
  return <Link {...props} ref={ref} to={to} viewTransition={viewTransition ?? canAnimateNavigation(pathname, to)} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented) notifyBeforeNavigation(pathname, to);
  }} />;
});

export const TransitionNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function TransitionNavLink({ to, viewTransition, onClick, ...props }, ref) {
  const { pathname } = useLocation();
  return <NavLink {...props} ref={ref} to={to} viewTransition={viewTransition ?? canAnimateNavigation(pathname, to)} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented) notifyBeforeNavigation(pathname, to);
  }} />;
});

export function usePageNavigate(): NavigateFunction {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') return navigate(to);
    notifyBeforeNavigation(pathname, to);
    return navigate(to, { viewTransition: canAnimateNavigation(pathname, to), ...options });
  }, [navigate, pathname]) as NavigateFunction;
}
