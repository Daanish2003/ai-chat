# ai-chat

A personal ChatGPT-style chat app: signed-in users talk to LLMs and keep their history.

## Language

**Chat SDK**:
The reusable chat feature (Conversations, runs, settings, Shared links) a Host embeds. It knows users only by id.
_Avoid_: Library, package, chat module

**Host**:
An app that embeds the Chat SDK and supplies its users, its routes and a Postgres database. The web app in this repo is one Host.
_Avoid_: Consumer, client app, integrator

**Conversation**:
One chat thread owned by a single user, listed in the sidebar.
_Avoid_: Chat, thread, session

**Message**:
One turn in a Conversation, authored by either the user or the assistant.
_Avoid_: Turn, reply, prompt

**Run**:
The generation of one assistant Message, from the moment it's sent until it ends `complete`, `stopped` or `error`. It goes on without a reader, and anyone can join it while it's live.
_Avoid_: Job, generation, stream

**Branch**:
One path through a Conversation's tree of Messages, created when a Message is edited or regenerated.
_Avoid_: Fork, version, variant

**Active Branch**:
The one Branch of a Conversation that is currently shown and that the next Message continues. Switching to a sibling makes its newest Branch active.
_Avoid_: Current branch, selected path

**Provider**:
An LLM vendor a user can chat through, one per TanStack AI chat adapter (Anthropic, OpenAI, Gemini, OpenRouter, Ollama, …).
_Avoid_: Vendor, backend

**Model**:
One specific LLM offered by a Provider. A Conversation has a selected Model, and each assistant Message records the Model that wrote it.
_Avoid_: Engine, LLM (as a noun for one choice)

**Provider credentials**:
What one user supplies to reach one Provider: usually an API key, sometimes with an account or region, or just a host for a local Provider. Every run uses the user's own Provider credentials; the app holds none of its own.
_Avoid_: Provider key, API key (ambiguous), token, BYOK key

**Tool credential**:
A user's own API key for a non-LLM service a tool needs, such as web search. Without it, that tool is unavailable to the user.
_Avoid_: Search key, Provider credentials (those are for Providers only)

**Source**:
A web page a web search returned during an assistant Message, numbered within that Message and shown as a chip under the search and wherever the reply cites it.
_Avoid_: Citation (that is the chip in the text pointing at a Source), result, reference

**Shared link**:
A public, read-only snapshot of a Conversation's Active Branch taken at the moment it is shared. A Conversation has at most one; sharing again moves it to the current Active Branch under the same link. It disappears when its Conversation is deleted.
_Avoid_: Share, public chat, permalink

**Attachment**:
A file (image, PDF or text file) a user uploads and attaches to their Message. It is never copied: editing a Message carries its Attachments over to the new Branch, where the user can remove some or add more; regenerating a reply leaves them as they were. A Shared link shows only each Attachment's file name and type.
_Avoid_: Upload, file part, document
