import {
  Content,
  Item,
  Link,
  List,
  Root,
  Trigger,
  Viewport,
} from '@radix-ui/react-navigation-menu';
import type { ComponentProps } from 'react';

export { Item as NavigationMenuItem, Link as NavigationMenuLink, Root as NavigationMenu };

export function NavigationMenuList(
  props: Readonly<Omit<ComponentProps<typeof List>, 'className'>>,
) {
  return <List data-nav-part="list" {...props} />;
}

export function NavigationMenuTrigger(
  props: Readonly<Omit<ComponentProps<typeof Trigger>, 'className'>>,
) {
  return <Trigger data-nav-part="link" className="focus-ring" {...props} />;
}

export function NavigationMenuContent(
  props: Readonly<Omit<ComponentProps<typeof Content>, 'className'>>,
) {
  return <Content data-nav-part="content" {...props} />;
}

export function NavigationMenuViewport(
  props: Readonly<Omit<ComponentProps<typeof Viewport>, 'className'>>,
) {
  return <Viewport data-nav-part="viewport" {...props} />;
}
