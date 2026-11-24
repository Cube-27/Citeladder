import { useEffect } from 'react';

import { ChatConversation, ReplyComposer, type ChatThread } from '@/components/agent/chat-thread';
import { useFollowLatest } from '@/components/agent/use-follow-latest';
import { EditorRailPanel } from '@/components/ui/editor-workspace';
import type { AgentChatDetail } from '@/lib/api/agent';

const WORKSPACE_COMPOSER_ID = 'page-chat-message';

type ChatProps = Readonly<{ thread: ChatThread; detail: AgentChatDetail }>;

export function WorkspaceConversation({ thread, detail }: ChatProps) {
  const { scrollRef } = useFollowLatest();
  return (
    <EditorRailPanel label="Agent conversation" scrollRef={scrollRef} padding="thread">
      <ChatConversation thread={thread} detail={detail} />
    </EditorRailPanel>
  );
}

export function WorkspaceComposer({
  thread,
  detail,
  focusRequest,
}: ChatProps & Readonly<{ focusRequest: number }>) {
  useEffect(() => {
    if (focusRequest > 0) document.getElementById(WORKSPACE_COMPOSER_ID)?.focus();
  }, [focusRequest]);
  return (
    <ReplyComposer
      id={WORKSPACE_COMPOSER_ID}
      thread={thread}
      detail={detail}
      placeholder="Ask about the page or request a change"
    />
  );
}
