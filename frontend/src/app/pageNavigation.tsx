import { forwardRef, useCallback, type MouseEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate, type LinkProps, type NavLinkProps, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom';
import { changesPaper, prefersInstantPaper, withPaperExit } from './paperNavigation';

const urlFor = (from: string, to: To) => typeof to === 'string' ? to : `${to.pathname ?? from.split('?')[0]}${to.search ?? ''}${to.hash ?? ''}`;
function canAnimateNavigation(from: string, to: To) {
  return typeof document.startViewTransition === 'function' && !prefersInstantPaper() && changesPaper(from, urlFor(from, to));
}
export const BEFORE_PAGE_NAVIGATION_EVENT = 'agriscope:before-page-navigation';
function notifyBeforeNavigation(from: string, to: To) {
  if (!changesPaper(from, urlFor(from, to))) return;
  window.dispatchEvent(new CustomEvent(BEFORE_PAGE_NAVIGATION_EVENT, { detail: { from, to: urlFor(from, to) } }));
}
function plainClick(event: MouseEvent<HTMLAnchorElement>, target?: string) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (!target || target === '_self');
}
function needsFallback(from: string, to: To) {
  return typeof document.startViewTransition !== 'function' && !prefersInstantPaper()
    && changesPaper(from, urlFor(from, to)) && typeof Element.prototype.animate === 'function';
}
/** One live route. Native browsers fold snapshots; older browsers fold the DOM. */
export const TransitionLink = forwardRef<HTMLAnchorElement, LinkProps>(function TransitionLink({ to, viewTransition, onClick, ...props }, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const from = `${location.pathname}${location.search}`;
  return <Link {...props} ref={ref} to={to} viewTransition={viewTransition ?? canAnimateNavigation(from, to)} onClick={event => {
    onClick?.(event);
    if (!plainClick(event, props.target) || props.reloadDocument) return;
    notifyBeforeNavigation(from, to);
    if (needsFallback(from, to)) {
      event.preventDefault();
      void withPaperExit(from, urlFor(from, to), () => navigate(to, { replace: props.replace, state: props.state, relative: props.relative, preventScrollReset: props.preventScrollReset }));
    }
  }} />;
});
export const TransitionNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function TransitionNavLink({ to, viewTransition, onClick, ...props }, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const from = `${location.pathname}${location.search}`;
  return <NavLink {...props} ref={ref} to={to} viewTransition={viewTransition ?? canAnimateNavigation(from, to)} onClick={event => {
    onClick?.(event);
    if (!plainClick(event, props.target) || props.reloadDocument) return;
    notifyBeforeNavigation(from, to);
    if (needsFallback(from, to)) {
      event.preventDefault();
      void withPaperExit(from, urlFor(from, to), () => navigate(to, { replace: props.replace, state: props.state, relative: props.relative, preventScrollReset: props.preventScrollReset }));
    }
  }} />;
});
export function usePageNavigate(): NavigateFunction {
  const navigate = useNavigate();
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;
  return useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') return navigate(to);
    notifyBeforeNavigation(from, to);
    return withPaperExit(from, urlFor(from, to), () => navigate(to, { viewTransition: canAnimateNavigation(from, to), ...options }));
  }, [navigate, from]) as NavigateFunction;
}
