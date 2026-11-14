/**
 * NavigationMenu: the Radix navigation menu, for a site navbar whose menus
 * share one popup (the `Viewport`) that stays open and resizes as the
 * pointer moves between triggers. It brings hover intent, arrow-key
 * movement across the top-level items, Escape with focus return, and
 * dismissal on a chosen link. The caller styles every part; the website's
 * DesktopNav is the one user.
 */
export {
  Content as NavigationMenuContent,
  Item as NavigationMenuItem,
  Link as NavigationMenuLink,
  List as NavigationMenuList,
  Root as NavigationMenu,
  Trigger as NavigationMenuTrigger,
  Viewport as NavigationMenuViewport,
} from '@radix-ui/react-navigation-menu';
