# @dialout/shared

Domain types and pure functions used by the web app, the agent, and (next)
the React Native app. Nothing in here imports `fs`, `next/…`, or
`react-native` — the moment it does, it stops being shareable.

One home for `AiEvent`, `AiSessionSummary`, `AiCapabilities`,
`PERMISSION_MODES`, `shouldNotifyAi`, and the chat rules (`groupEvents`,
`shouldFollow`, `toolAppearance`, `commandQuery`, `shouldSubmitOnEnter`).
Adding a field here is a compile error in every consumer. That is the point:
the previous copies had already drifted (`origin` / `permissionMode` missing
from the web `AiSessionSummary`).

```ts
import { groupEvents, shouldNotifyAi, PERMISSION_MODES } from '@dialout/shared';
```
