export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type HandleChatInput = {
  messages: ChatMessage[];
};

export type HandleChatOutput = {
  text: string;
};

function lastUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content?.trim() || '';
}

export async function handleChat(input: HandleChatInput): Promise<HandleChatOutput> {
  const text = lastUserText(input.messages);
  if (!text) {
    return { text: 'I could not read that message.' };
  }

  // Temporary local handler to keep webhook flow stable.
  return { text };
}

export default handleChat;
