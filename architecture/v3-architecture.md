# WebRoom v3 — Distributed Peer-Contributed Infrastructure

You are working on an existing production-working browser extension called **WebRoom**.

Your task is to evolve the existing WebRoom implementation into **WebRoom v3**, a self-organizing, ephemeral, decentralized, peer-contributed distributed communication network.

## IMPORTANT: DO NOT REWRITE THE PROJECT

The existing WebRoom implementation is already working.

You MUST:

- Preserve all existing functionality.
- Preserve the current UI unless a change is required for v3.
- Preserve the existing URL-based room model.
- Preserve decentralized presence.
- Preserve existing real-time chat.
- Preserve random emoji avatars.
- Preserve ephemeral sessions.
- Preserve existing WebRTC functionality.
- Preserve existing STUN/TURN configuration.
- Preserve existing Trystero transport unless there is a strong architectural reason to extend it.
- Follow the existing project's coding conventions.
- Reuse existing abstractions wherever possible.
- Do not introduce unnecessary dependencies.
- Do not introduce a centralized database.
- Do not introduce user accounts or login.
- Do not introduce a traditional application backend.
- Do not replace the existing architecture with a centralized architecture.

This is an incremental architectural evolution.

---

# 1. WebRoom v3 Vision

The fundamental idea of WebRoom v3 is:

> Every participating browser is a WebRoom node, and the WebRoom infrastructure is collectively created by the connected nodes themselves.

There should be no permanent server responsible for the room.

Every node is:

- A participant.
- A potential infrastructure contributor.
- Dynamically assigned responsibilities.
- Replaceable.
- Expected to disappear at any time.

The system must be designed around node failure as a normal event.

---

# 2. Core Architecture

Implement WebRoom v3 as a decentralized peer-contributed overlay network.

Conceptually:

```text
Browser A ─┐
Browser B ─┤
Browser C ─┤
Browser D ─┤
Browser E ─┤
Browser F ─┘
      │
      ▼
Distributed WebRoom Overlay
      │
      ├── Membership
      ├── Failure Detection
      ├── Resource Sharing
      ├── Role Assignment
      ├── Distributed Coordination
      └── Media Routing
```

There is NO permanent leader.

There is NO permanently trusted host.

There is NO permanently required browser.

Any node may disappear.

---

# 3. Node Identity

Create a stable cryptographic identity for every WebRoom installation.

Requirements:

- Generate a cryptographic keypair on first initialization.
- Persist the private key locally.
- Derive a stable node ID from the public key.
- Never send the private key to peers.
- Do not require login.
- Do not require a centralized identity service.

### Browser-Anchored Node Lifecycle:
- The WebRoom node is tied to the **Browser Instance / Extension Lifetime**, NOT individual transient webpage tabs.
- Tabs are lightweight, ephemeral viewports into specific webpage rooms.
- Reloading a tab (`F5`), opening a new tab, or navigating pages must NEVER destroy the cryptographic node identity, reset sequence counters, or disrupt voluntary resource contribution.
- The node remains actively participating and contributing as long as the browser is open and the user has not disabled resource sharing.

Use the browser's secure local storage mechanism already appropriate for the project.

Create a clean abstraction such as:

```text
NodeIdentity
```

Responsibilities:

- initialize()
- getNodeId()
- getPublicKey()
- sign()
- verify()

Use comments explaining WHY each operation exists.

Do not expose cryptographic secrets in logs.

---

# 4. Distributed Membership

Create a dedicated membership subsystem.

Suggested abstraction:

```text
MembershipManager
```

Responsibilities:

- Node join
- Node discovery
- Node heartbeat
- Node timeout
- Node removal
- Membership state updates
- Peer liveness tracking

Each node should periodically announce that it is alive.

### Liveness & Tab Reload Safety:
- Do NOT rely on browser tab closing or reload events to evict a node.
- Tab reloads and page navigations are transient ($1\text{–}3\text{s}$). They must NOT broadcast destructive goodbye packets that drop the node from the cluster.
- The distributed system must assume:
  > A node can disappear without warning.
- A node should therefore be considered dead strictly based on heartbeat/liveness timeouts ($5\text{s}$ suspected $\to 10\text{s}$ offline) rather than explicit tab unload events.

Use configurable constants:

```text
HEARTBEAT_INTERVAL
NODE_TIMEOUT
```

Do not scatter magic numbers throughout the codebase.

---

# 5. Node State

Define a clear node state model.

A node should contain information such as:

```ts
interface NetworkNode {
  nodeId: string;
  publicKey: string;

  lastSeen: number;

  status: "online" | "suspected" | "offline";

  contributionEnabled: boolean;

  capabilities: NodeCapabilities;

  role: NodeRole;
}
```

Keep the model extensible.

Do not tightly couple membership state with the voice/media implementation.

---

# 6. Resource Contribution

Introduce a user-controlled resource sharing system.

Default:

```text
resource sharing = enabled
```

But users MUST be able to disable it.

When disabled:

```text
User can:
- Join rooms
- Chat
- Listen
- Speak

User cannot:
- Become relay
- Forward other users' media
- Perform infrastructure responsibilities
```

Create a dedicated abstraction:

```text
ResourceManager
```

It should expose bounded capabilities such as:

```text
CPU budget
Memory budget
Network budget
Relay connection limit
Forwarding limit
```

Do NOT attempt to perfectly measure system resources.

Use conservative browser-safe heuristics.

The goal is not to control the user's entire machine.

The goal is to enforce a small WebRoom contribution budget.

---

# 7. Resource Budget

Every node must have a bounded contribution budget.

Conceptually:

```text
Node A

CPU contribution:
    LOW

Memory contribution:
    LOW

Network contribution:
    500 Kbps

Relay slots:
    2
```

These are examples only.

Do NOT hardcode these exact values without evaluating the existing application.

Make them configurable.

The architecture must ensure that a node never accidentally becomes responsible for unlimited traffic.

---

# 8. Node Roles

Create a role system.

Suggested roles:

```text
participant
contributor
relay
coordinator
standby
```

Important:

Roles are temporary and dynamic.

A node may transition:

```text
participant → relay
relay → participant
standby → relay
relay → standby
standby → coordinator
coordinator → standby / participant
```

Do not permanently assign a node to a role.

### Sticky Role Protocol & Reload Immunity:
- Roles must NOT flap or churn on simple tab reloads or momentary network blips.
- **Incumbent Coordinator Stickiness**: If an incumbent node is already actively serving as coordinator and remains online with contribution enabled, it retains its coordinator status. Other nodes joining or refreshing do not steal the role based purely on hash comparisons.
- **Failover**: Coordinator re-election only occurs when the incumbent coordinator actually becomes `suspected` or `offline`, or when the user disables resource contribution.
- When the coordinator fails, the highest-ranked standby contributor deterministically promotes to coordinator.

Create:

```text
RoleManager
```

The role manager must use deterministic and reproducible decisions wherever possible.

---

# 9. Distributed Coordination

Create a control-plane abstraction responsible for deciding:

- Which nodes are eligible for contribution.
- Which nodes are overloaded.
- Which nodes can relay.
- Which nodes should become standby.
- Which nodes should coordinate specific distributed state.

Do NOT introduce a centralized coordinator server.

The same deterministic algorithm should be executable by multiple nodes.

Where practical:

```text
same membership
+
same capabilities
+
same deterministic ranking
=
same decision
```

This reduces unnecessary consensus traffic.

---

# 10. Failure Detection

Implement failure detection as a first-class subsystem.

Example:

```text
Node A
  ↓
heartbeat

Node B
  ↓
heartbeat

Node C
  ↓
heartbeat
```

If A stops responding:

```text
A
↓
heartbeat timeout
↓
suspected
↓
offline
```

Do not immediately destroy state on a single missed heartbeat.

Use configurable failure thresholds to avoid false positives.

---

# 11. Dynamic Responsibility

When a node becomes unavailable:

```text
Detect failure
       ↓
Remove node from eligible set
       ↓
Recalculate responsibility
       ↓
Select replacement nodes
       ↓
Rebuild affected routes
```

The architecture must NOT depend on a single node surviving.

---

# 12. Media Architecture

This is extremely important.

Do NOT immediately replace the existing WebRTC voice implementation.

First create a routing abstraction:

```text
VoiceManager
      ↓
MediaRoutingLayer
      ↓
DirectPeerRoute
or
RelayRoute
```

The system should eventually support:

```text
Small room:
    direct P2P

Larger room:
    distributed relay topology
```

The routing layer should hide the topology from the rest of the application.

---

# 13. Audio Requirement

WebRoom audio requirements:

- Users can listen without speaking.
- Users can enable microphone.
- A speaker can listen to other speakers.
- Multiple users may speak simultaneously.
- Maximum active microphones should remain bounded by the existing product requirement.
- Current target: approximately 5–10 simultaneous speakers.
- Many additional users may remain listeners.

The architecture must optimize for:

```text
Few publishers
Many subscribers
```

Do NOT build a traditional full-mesh topology for large rooms.

---

# 14. Distributed Media Overlay

Do NOT implement an unrestricted browser-based SFU.

Instead, experiment with a bounded peer relay overlay.

Conceptually:

```text
Speaker A
    │
    ├──── Relay B
    │       ├── Listener D
    │       └── Listener E
    │
    └──── Relay C
            ├── Listener F
            └── Listener G
```

Each relay must have a strict forwarding budget.

A relay must never become responsible for unlimited users.

The topology must be dynamically recalculated.

---

# 15. Routing Requirements

The media routing layer must eventually support:

- Parent relay selection
- Child peer selection
- Capacity-aware routing
- Route replacement
- Failure recovery
- Reconnection
- Loop prevention
- Duplicate route prevention

Never create routing loops.

Example invalid topology:

```text
A → B → C → A
```

The routing layer must detect and prevent this.

---

# 16. Redundancy

Where practical, routes should have redundancy.

Example:

```text
Speaker A

   ┌── Relay B ── Listener D
   │
   └── Relay C ── Listener D
```

If B disappears:

```text
B ❌

D switches toward C
```

Do not attempt perfect zero-downtime migration initially.

Prioritize:

```text
fast detection
+
fast route reconstruction
+
automatic recovery
```

---

# 17. Resource Sharing UI

Add a transparent resource-sharing control to the existing WebRoom settings.

Example:

```text
Resource Sharing

[ ON ]

WebRoom may use a small amount of:
• Network bandwidth
• CPU
• Memory

Current contribution:
Network: 120 Kbps
Relays: 2
CPU: Low

[ Disable Resource Sharing ]
```

The UI must make it clear:

> This is voluntary resource contribution by the user's browser.

Do not hide this behavior.

---

# 18. Developer Diagnostics

Add a developer/debug mode.

Expose:

```text
Node ID
Room ID

Online peers
Suspected peers
Offline peers

Contribution enabled

Current role

Relay capacity
Current relay load

Active audio publishers

Current routes

Heartbeat status

Route changes

Failover events
```

Do NOT expose private keys.

Do NOT log sensitive information.

---

# 19. Observability Events

Create structured internal events for:

```text
NODE_JOINED
NODE_LEFT
NODE_SUSPECTED
NODE_RECOVERED

ROLE_CHANGED

RESOURCE_CAPACITY_CHANGED

RELAY_ASSIGNED
RELAY_RELEASED

ROUTE_CREATED
ROUTE_CHANGED
ROUTE_FAILED
ROUTE_RECOVERED
```

Keep the event system lightweight.

Do not introduce an external telemetry service.

---

# 20. Security

Assume that peers are not automatically trustworthy.

The architecture should be prepared for:

- Fake node IDs
- Message spoofing
- Resource advertisement manipulation
- Malicious relay behavior
- Excessive connection requests
- Replay attacks

For v3 initial implementation:

- Authenticate control messages using node keys where practical.
- Validate message structure.
- Validate sender identity.
- Apply rate limits.
- Never trust advertised capacity blindly.
- Never expose private keys.

Do NOT attempt to build a complete Byzantine fault-tolerant protocol in the first implementation.

Prepare clean interfaces for future security hardening.

---

# 21. Browser Lifecycle

Important clarification:

Closing a normal browser tab must NOT automatically be interpreted as destroying the entire WebRoom node.

The node lifecycle is associated with the extension/runtime and distributed liveness.

However:

The distributed system must assume that any node can disappear unexpectedly because:

- Browser quits.
- Browser crashes.
- Extension stops.
- OS terminates the process.
- Device loses network.
- Browser suspends background execution.

Therefore:

> Never depend on explicit shutdown events for correctness.

Heartbeats and failure detection are authoritative.

---

# 22. Zero-User Behavior

WebRoom is ephemeral.

If there are no active participants:

```text
Room infrastructure should not remain alive.
```

There should be no permanent room server.

When a user returns:

```text
New distributed network forms again.
```

---

# 23. Preserve Current WebRoom

Before modifying anything:

1. Audit the current architecture.
2. Identify:
   - Presence
   - Transport
   - Voice
   - Room identity
   - Peer lifecycle
   - STUN/TURN
   - UI

3. Produce a short architecture report.
4. Identify integration points.
5. Only then implement v3.

Do NOT start coding immediately.

---

# 24. Implementation Order

Implement strictly in this order:

## Phase 1

Node identity.

## Phase 2

Membership and heartbeats.

## Phase 3

Resource contribution model.

## Phase 4

Role management.

## Phase 5

Failure detection and deterministic reassignment.

## Phase 6

Media routing abstraction.

## Phase 7

Experimental distributed relay topology.

## Phase 8

Failover and route recovery.

## Phase 9

Diagnostics and observability.

Do not jump directly to Phase 7.

---

# 25. Testing Requirements

Every phase must include tests.

At minimum test:

### Node lifecycle

```text
Join
Leave
Unexpected disappearance
Rejoin
```

### Membership

```text
Heartbeat
Timeout
Recovery
Duplicate node
```

### Resource sharing

```text
Enabled
Disabled
Capacity exhausted
Capacity restored
```

### Roles

```text
Promotion
Demotion
Replacement
```

### Failure

```text
Relay disappears
Coordinator disappears
Multiple nodes disappear
```

### Media

```text
Speaker joins
Speaker leaves
Listener joins
Listener leaves
Relay failure
Route recovery
```

---

# 26. Performance Safety

Never allow WebRoom to consume unlimited resources.

All resource-intensive operations must have explicit limits.

Use:

```text
maximum peers
maximum relay connections
maximum forwarding streams
maximum bandwidth
maximum retry rate
maximum signaling rate
```

Avoid:

```text
while(true)
unbounded arrays
unbounded peer connections
unbounded retries
unbounded message propagation
```

Use backoff and cleanup everywhere.

---

# 27. DRY Architecture

Follow DRY principles.

Do not duplicate:

- Peer state handling
- Connection lifecycle logic
- Node validation
- Message serialization
- Capability calculation
- Failure detection
- Retry logic

Create reusable services/interfaces.

Keep responsibilities separated.

Suggested structure:

```text
src/
├── identity/
├── membership/
├── resources/
├── roles/
├── coordination/
├── routing/
├── voice/
├── transport/
├── presence/
├── diagnostics/
└── shared/
```

Adapt this structure to the existing project rather than blindly creating it.

---

# 28. Critical Constraint

Do NOT claim that the distributed media architecture is production-ready after implementing the first prototype.

The system must be benchmarked.

We need real-world tests with:

```text
5 users
10 users
25 users
50 users
100 users
```

And scenarios:

```text
normal network
poor network
node churn
browser restart
multiple node failure
relay overload
high listener count
maximum speaker count
```

Measure:

- CPU
- Memory
- Upload bandwidth
- Download bandwidth
- Connection count
- Audio latency
- Packet loss
- Recovery time
- Route stability

---

# 29. Most Important Architectural Principle

Remember this throughout the implementation:

> WebRoom infrastructure is not located on one machine.

It emerges from the connected participants.

Every participant is a potential contributor.

Every contributor has a bounded responsibility.

Every responsibility is replaceable.

Every node may disappear.

The system must continuously reorganize itself.

---

# 30. Final Goal

The target architecture is:

```text
                 WEBROOM v3

       Browser Nodes = Infrastructure

       A ── B ── C ── D ── E
       │    │    │    │    │
       └────┴────┴────┴────┘
                │
                ▼

       Self-Organizing Overlay

       ┌──────────────────────┐
       │ Membership            │
       │ Failure Detection     │
       │ Resource Sharing     │
       │ Role Assignment      │
       │ Distributed Routing  │
       │ Media Distribution   │
       │ Automatic Recovery   │
       └──────────────────────┘

                │
                ▼

       No permanent server
       No permanent leader
       No central database
       No login
       No permanent room infrastructure
```

The ultimate principle:

> **The WebRoom network exists only because its participants collectively provide it.**

---

# YOUR FIRST TASK

Before writing implementation code:

1. Audit the existing WebRoom repository.
2. Understand the current architecture completely.
3. Identify the exact integration points for v3.
4. Produce a proposed file/module architecture.
5. Explain which existing modules can be reused.
6. Explain which modules need modification.
7. Explain which new modules are required.
8. Identify architectural risks.
9. Identify anything in the current implementation that would prevent this architecture.
10. Produce a phased implementation plan.

**DO NOT IMPLEMENT ANY CODE YET.**

Wait for my approval after presenting the architecture plan.

When presenting the plan, be technical and concrete. Reference actual existing files/classes/functions from the repository wherever possible.

Do not make assumptions about code that you have not inspected.
