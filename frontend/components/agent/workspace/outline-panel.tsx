import { Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/typography';
import { TreeBranch } from '@/components/ui/workspace';
import { pageOutline, type OutlineHeading } from '@/lib/agent/page-workspace';

type OutlineNode = { heading: OutlineHeading; children: OutlineNode[] };

function nest(headings: readonly OutlineHeading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const open: OutlineNode[] = [];
  for (const heading of headings) {
    const node: OutlineNode = { heading, children: [] };
    while ((open.at(-1)?.heading.level ?? 0) >= heading.level) open.pop();
    (open.at(-1)?.children ?? roots).push(node);
    open.push(node);
  }
  return roots;
}

function Branch({
  nodes,
  nested,
  onJump,
}: Readonly<{ nodes: readonly OutlineNode[]; nested: boolean; onJump: (from: number) => void }>) {
  const items = nodes.map((node) => (
    <Stack as="li" gap="tight" key={node.heading.from}>
      <Pressable look="jump" text="body" box="auto-start" onClick={() => onJump(node.heading.from)}>
        {node.heading.text}
      </Pressable>
      {node.children.length > 0 ? <Branch nodes={node.children} nested onJump={onJump} /> : null}
    </Stack>
  ));
  return nested ? (
    <TreeBranch as="ol">{items}</TreeBranch>
  ) : (
    <Stack as="ol" gap="tight">
      {items}
    </Stack>
  );
}

export function OutlinePanel({
  body,
  onJump,
}: Readonly<{ body: string; onJump: (from: number) => void }>) {
  const tree = nest(pageOutline(body));
  if (tree.length === 0)
    return (
      <Text as="p" variant="body" tone="ink-2">
        This page has no headings yet.
      </Text>
    );
  return (
    <nav aria-label="Page outline">
      <Branch nodes={tree} nested={false} onJump={onJump} />
    </nav>
  );
}
