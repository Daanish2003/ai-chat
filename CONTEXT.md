# ai-chat

A personal ChatGPT-style chat app: signed-in users talk to LLMs and keep their history.

## Language

**Conversation**:
One chat thread owned by a single user, listed in the sidebar.
_Avoid_: Chat, thread, session

**Message**:
One turn in a Conversation, authored by either the user or the assistant.
_Avoid_: Turn, reply, prompt

**Branch**:
One path through a Conversation's tree of Messages, created when a Message is edited or regenerated.
_Avoid_: Fork, version, variant

**Shared link**:
A public, read-only snapshot of a Conversation taken at the moment it is shared.
_Avoid_: Share, public chat, permalink
