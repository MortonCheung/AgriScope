import { forwardRef, useCallback, type MouseEvent } from 'react';
import { Link, NavLink, createPath, useLocation, useNavigate, useResolvedPath, type LinkProps, type NavLinkProps, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom';
import { cancelPendingPaperNavigation, changesPaper, withPaperExit } from './paperNavigation';

const urlFor = (from: string, to: To) => typeof to === 'string' ? to : `${to.pathname ?? from.split(/[?#]/)[0]}${to.search ?? ''}${to.hash ?? ''}`;
export const BEFORE_PAGE_NAVIGATION_EVENT = 'agriscope:before-page-navigation';
function notifyBeforeNavigation(from: string, to: string) {
  if (!changesPaper(from, to)) return;
  window.dispatchEvent(new CustomEvent(BEFORE_PAGE_NAVIGATION_EVENT, { detail: { from, to } }));
}
function plainClick(event: MouseEvent<HTMLAnchorElement>, target?: string) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (!target || target === '_self');
}
function internalTarget(to: To): To | null {
  if (typeof to !== 'string' || !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(to)) return to;
  try {
    const url = new URL(to, window.location.href);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}

/** All internal intents share cancellation, including a same-workspace click. */
export const TransitionLink = forwardRef<HTMLAnchorElement, LinkProps>(function TransitionLink({ to, viewTransition: _viewTransition, onClick, ...props }, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const internal = internalTarget(to);
  const resolved = useResolvedPath(internal ?? to, { relative: props.relative });
  const from = createPath(location);
  const target = createPath(resolved);
  return <Link {...props} ref={ref} to={to} viewTransition={false} onClick={event => {
    onClick?.(event);
    if (!plainClick(event, props.target) || props.reloadDocument || props.download !== undefined || internal === null) return;
    event.preventDefault();
    notifyBeforeNavigation(from, target);
    void withPaperExit(from, target, () => navigate(resolved, { replace: props.replace ?? from === target, state: props.state, preventScrollReset: props.preventScrollReset, viewTransition: false }), (props.replace ?? from === target) ? 'replace' : 'push');
  }} />;
});
export const TransitionNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function TransitionNavLink({ to, viewTransition: _viewTransition, onClick, ...props }, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const internal = internalTarget(to);
  const resolved = useResolvedPath(internal ?? to, { relative: props.relative });
  const from = createPath(location);
  const target = createPath(resolved);
  return <NavLink {...props} ref={ref} to={to} viewTransition={false} onClick={event => {
    onClick?.(event);
    if (!plainClick(event, props.target) || props.reloadDocument || props.download !== undefined || internal === null) return;
    event.preventDefault();
    notifyBeforeNavigation(from, target);
    void withPaperExit(from, target, () => navigate(resolved, { replace: props.replace ?? from === target, state: props.state, preventScrollReset: props.preventScrollReset, viewTransition: false }), (props.replace ?? from === target) ? 'replace' : 'push');
  }} />;
});
export function usePageNavigate(): NavigateFunction {
  const navigate = useNavigate();
  const location = useLocation();
  const from = createPath(location);
  return useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') { cancelPendingPaperNavigation(); return navigate(to); }
    const target = urlFor(from, to);
    notifyBeforeNavigation(from, target);
    return withPaperExit(from, target, () => navigate(to, { ...options, viewTransition: false }), options?.replace ? 'replace' : 'push');
  }, [navigate, from]) as NavigateFunction;
}
