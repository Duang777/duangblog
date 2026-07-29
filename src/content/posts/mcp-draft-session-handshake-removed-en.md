---
author: Duang
pubDatetime: 2026-07-28T16:00:00+08:00
title: "What changed in the MCP draft: sessions and handshake are gone"
draft: false
lang: en
tags:
  - 最新速递
  - Agent
  - 拆解
description: Notes from the official MCP spec draft's changelog, compared against the 2025-11-25 version, focused on sessions, the handshake, MRTR, and migration impact.
---
> Notes from the official MCP spec draft's changelog (compared against the previous version, 2025-11-25). Original: [Key Changes](https://modelcontextprotocol.io/specification/draft/changelog#major-changes).
>

Normally I skim the MCP changelog in a few minutes: a new field here, some rewording there. This time I couldn't skim it. Against the 2025-11-25 version, the draft touches the protocol's core model: sessions are gone, the handshake is gone, the server can no longer send requests back to the client, and even stream-resume-after-disconnect is gone. This isn't a patch. It's a redrawn foundation.

If you have an MCP server or client running in production, these changes land directly on your architecture decisions, and they're worth reading through one by one. Below, I've reorganized the changelog by topic, and added what each change means for implementation after each section.

## First, a recap: what MCP used to look like

Before getting into the changes, it helps to lay out the old model clearly. Otherwise it's hard to feel exactly which nerve this draft is touching.

The old MCP worked like this: the client establishes a connection with the server and sends an `initialize`, reporting its supported protocol version, capabilities, and identity; the server replies with an `InitializeResult`, reporting its own capabilities and identity; the client then sends a `notifications/initialized` to signal the handshake is done. Once this opening exchange finishes, a session is established, the server issues an `Mcp-Session-Id`, and the client attaches it to every subsequent request.

Once a session exists, both sides remember who the other one is. That enables a few capabilities that are genuinely useful, but also expensive: the server can return a different `tools/list` per client based on session identity; it can open a separate long-lived SSE connection over HTTP GET to push change notifications, paired with `resources/subscribe` to watch specific resources, and resume from where it left off after a disconnect using `Last-Event-ID`; it can keep that long connection alive with `ping`; and `logging/setLevel` set once fixes the log level for the whole session.

The most critical part is that the connection is bidirectional. If the server, mid-processing, realizes it's missing information, it can turn around and send a request to the client: use `roots/list` to ask what local directories the client has, use `sampling/createMessage` to borrow the client's model for a single inference, use `elicitation/create` to ask the user for an input. During all of this, the server keeps this call's context hanging while it waits for the result.

<section class="article-embed-note">
  <p class="article-embed-note-title">Old MCP session lifecycle (diagram)</p>
  <div class="article-diagram-head">
    <span>Client</span>
    <span>Server</span>
  </div>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>Stage 1: handshake begins</b></p>
      <p>The client sends `initialize`, carrying protocol version, client capabilities, and `clientInfo`.</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>Stage 2: handshake response</b></p>
      <p>The server returns `InitializeResult`, carrying server capabilities and `serverInfo`.</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>Stage 3: session established</b></p>
      <p>The client sends `notifications/initialized`, and the server issues `Mcp-Session-Id`.</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>Stage 4: normal calls</b></p>
      <p>The client calls `tools/list` and `tools/call`; results can vary by session identity.</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>Stage 5: server-initiated request</b></p>
      <p>The server can initiate `roots/list`, `sampling/createMessage`, or `elicitation/create`, waiting for the client to fill in information.</p>
    </div>
  </div>
  <p class="article-embed-note-foot">Core trait: state is carried implicitly by the connection and session; deploying to the cloud requires session stickiness.</p>
</section>

This model is very natural for local stdio use: one process talking to one process, the connection is the process's lifetime, and state just sits in memory. The problem shows up once you move to the cloud. Session state has to live somewhere, load balancing has to guarantee that requests from the same session land on the same instance, and a rolling restart invalidates every client's session at once. This is exactly the baggage the draft is trying to strip out.

## The conclusion first

One line: MCP has gone from a stateful, long-connection protocol to a stateless request-response protocol.

The draft's choice is to tear the whole session-based RPC model down. Each request carries its full context on its own, the server doesn't need to remember anything, and it can deploy like an ordinary stateless HTTP service. The cost is that a whole set of mechanisms that used to depend on sessions need to be redesigned from scratch. Most of what follows is a chain reaction from this one decision.

<section class="article-embed-note">
  <p class="article-embed-note-title">Old vs. new MCP (diagram)</p>
  <table class="article-compare-table">
    <thead>
      <tr>
        <th>Comparison point</th>
        <th>Old: session model</th>
        <th>New: stateless model</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Startup</td>
        <td>Handshake required, going through <code>initialize</code> and <code>notifications/initialized</code> first.</td>
        <td>No handshake; every request carries its own version and capabilities in <code>_meta</code>.</td>
      </tr>
      <tr>
        <td>Where state lives</td>
        <td>Kept alive via <code>Mcp-Session-Id</code>; session state lives on the server.</td>
        <td>No session; cross-call state is passed as an explicit handle parameter.</td>
      </tr>
      <tr>
        <td>Interaction direction</td>
        <td>Server can send requests back to the client, commonly Roots, Sampling, Elicitation.</td>
        <td>Replaced by MRTR: returns <code>input_required</code>, client fills in and retries.</td>
      </tr>
      <tr>
        <td>Notifications & disconnects</td>
        <td>GET + SSE, resumable via <code>Last-Event-ID</code>.</td>
        <td>Goes through <code>subscriptions/listen</code>; a disconnect invalidates it, must resend with a new ID.</td>
      </tr>
      <tr>
        <td>Deployment traits</td>
        <td>Needs session stickiness; rolling restarts are costly.</td>
        <td>Naturally fits load balancing, horizontal scaling, and rolling releases.</td>
      </tr>
    </tbody>
  </table>
  <p class="article-embed-note-foot">Core change: the protocol layer subtracts features, scaling friendliness goes up, and idempotency/retry complexity shifts onto the business side.</p>
</section>

## 1. Sessions are completely removed

The `Mcp-Session-Id` header in the Streamable HTTP transport is removed. At the protocol level, the concept of a session no longer exists.

An easy-to-miss constraint that comes with this: the three list endpoints, `tools/list`, `resources/list`, and `prompts/list`, no longer vary by connection. In the past you could expose a different tool set to different clients based on session identity; now you can't. The same server gives every caller the same capability list. If your product depends on dynamically generating a tool list per logged-in user, you need to plan a replacement ahead of time, for example splitting into different endpoint addresses per tenant.

So what about cases where the server genuinely needs to keep state across calls, like a multi-step wizard or the intermediate result of a long-running task? The spec's answer is for the server to issue its own explicit handle and pass it around as an ordinary tool parameter. This is actually a familiar pattern: it's the same idea as a pagination cursor or a temporary task ID on the web. The upside is that state becomes explicit, visible, and something you control the expiry policy for yourself, instead of hidden context buried in the transport layer. The cost is that this complexity moves down from the protocol layer to the business layer; every server author has to implement it again themselves.

The corresponding SEP is 2567.

## 2. The handshake is gone too

The opening sequence of `initialize` and `notifications/initialized` is canceled. Protocol version and client capabilities now travel with every request instead, placed in `_meta`. Four keys are involved:

| Key | Direction | Purpose |
| --- | --- | --- |
| io.modelcontextprotocol/protocolVersion | Request | Declares the protocol version used for this request |
| io.modelcontextprotocol/clientCapabilities | Request | Declares client capabilities |
| io.modelcontextprotocol/clientInfo | Request | Client identity; recommended on every request |
| io.modelcontextprotocol/serverInfo | Result | Server identity; recommended on every result |

When versions don't match, the server returns `UnsupportedProtocolVersionError`.

There's a real trade-off here: repeating version and capability info on every request definitely adds bytes, but in exchange, any request can be handled by any instance. For services that need to sit behind a gateway or scale horizontally, that trade is worth it.

## 3. New: server/discover

The handshake is gone, but the need to check who you are and what version you support first still exists, so the spec adds a new RPC, `server/discover`, and states that servers must implement it.

It returns the list of protocol versions the server supports, its capabilities, and its identity. A client can choose to call it once before sending any other request, to settle on a version; or, in an STDIO scenario, use it as a backward-compatibility probe to check whether the other side is running the new version or the old one.

Note that this call is optional, not a mandatory prerequisite. A client can perfectly well send `tools/call` directly; it just needs to be ready to get a version error back. This is a different thing from the old handshake: the handshake was a state machine you had to go through, discovery is just a plain query.

The two sections above correspond to SEP 2575.

## 4. Notifications move to subscriptions/listen

The old HTTP GET endpoint, along with `resources/subscribe` and `resources/unsubscribe`, are all replaced by a single entry point, `subscriptions/listen`, which is essentially a long-lived POST response stream.

The client has to explicitly declare which types it wants to listen for; once the server confirms, it tags each notification with `io.modelcontextprotocol/subscriptionId`, and the client dispatches based on that ID.

| Subscription type | Meaning |
| --- | --- |
| toolsListChanged | Tool list changed |
| promptsListChanged | Prompt list changed |
| resourcesListChanged | Resource list changed |
| resourceSubscriptions | Subscription to a specific resource |

There's a spot here that's easy to implement wrong, worth calling out on its own: not every notification goes through this stream. `notifications/progress` and `notifications/message` are request-scoped notifications; they still travel on the response stream of the request that triggered them. In other words, `subscriptions/listen` only handles server-initiated change notifications unrelated to any specific request; things like progress and logs that belong to one particular call travel with that call itself.

The benefit of splitting these two kinds of notifications apart: a stateless service doesn't need to look up which machine a client's listening stream is on just to send a single progress notification.

## 5. Three methods are removed outright

`ping` is removed. With no state, there's no long-lived connection to keep alive; liveness probing can just be left to the transport layer.

`logging/setLevel` is removed. Log level is now set per request, written in `_meta` under `io.modelcontextprotocol/logLevel`. There's a hard requirement attached: when a request doesn't carry this field, the server must not send `notifications/message` for it. In other words, logging is off by default, and you turn it on request by request as needed.

`notifications/roots/list_changed` is removed. This is the same story as Roots being deprecated further down.

## 6. MRTR: the server no longer sends requests back

This is the one part of the whole changelog I found most worth chewing on.

In the past, when the server realized mid-processing that it was missing information, it would turn around and send a request to the client: use `roots/list` to ask about directories, use `sampling/createMessage` to have the client run a model, use `elicitation/create` to ask the user for an input. This approach carries a hidden assumption: the connection is bidirectional, and the server holds onto this call's context the whole time it's waiting. Under the stateless model, neither assumption holds anymore.

The new Multi Round-Trip Requests pattern, MRTR for short, flips the direction:

The server no longer sends a request; instead it directly returns an incomplete result of type `InputRequiredResult`, where `resultType` is `input_required`, and the `inputRequests` field lists what it still needs. The client gathers that information and retries the original request, sending the answers along in `inputResponses`.

If the server needs to correlate the same piece of work across multiple retries, it encodes its own identifier into `requestState`.

The matching change is that every result must now carry a `resultType` field: an ordinary result is `complete`, an intermediate state is `input_required`. Results from old-version servers don't carry this field, and the client must treat them as `complete`; that's the door left open for backward compatibility.

One practical change this pattern brings is that a call goes from one round trip to potentially several, and the client has to manage its own retry loop and retry cap. The upside is that every round is a complete, independent, replayable request; if it breaks in the middle, the server doesn't get stuck in a dangling state.

Corresponds to SEP 2322.

## 7. Tasks move out of the core protocol

The experimental tasks feature is moved out of the core spec into the official extension `io.modelcontextprotocol/tasks`, and redesigned along the way. There are four changes:

The blocking `tasks/result` is canceled in favor of polling with `tasks/get`. A new `tasks/update` lets the client feed additional input to the server while a task is in progress. `tasks/list` is removed. The server can return a task handle directly in the result without needing per-request opt-in.

The first two are an inevitable result of going stateless: blocking and waiting requires the server to hold the connection and context, while polling doesn't. Removing `tasks/list` follows the same logic: without a session, there's no concept of the task list for the current connection.

Corresponds to SEP 2663.

## 8. Stream-resume capability is removed

Streamable HTTP no longer supports SSE stream resumption or message redelivery; both the `Last-Event-ID` header and SSE event IDs are removed.

The rule is now blunt: the moment a response stream breaks, that in-flight request is void, and the client must resend with a new request ID instead of picking up where it left off.

This means the responsibility for reliability shifts from the protocol to the implementation. If your tool has side effects, like placing an order, sending an email, writing to an external system, idempotent design stops being optional. Since the client resends with a new ID, the server has no way at the protocol level to know this is a retry of the same thing; you have to carry an idempotency key in the parameters yourself.

## 9. Caching is written into the spec

This is a set of changes easy to skim past as minor, but with a big impact on performance.

The results of five endpoints, `tools/list`, `prompts/list`, `resources/list`, `resources/read`, and `resources/templates/list`, must now implement a new `CacheableResult` interface, carrying two fields:

`ttlMs` is a freshness hint in milliseconds, telling the client how long it can cache this result, aimed at cutting down pointless polling. `cacheScope` takes `public` or `private`, controlling whether a shared intermediate layer is allowed to cache the response. Both are complementary to the existing `listChanged` notifications, not a replacement for them: the former controls how often to check back, the latter tells you the moment something changes.

A directly related point: servers should keep `tools/list`'s return order stable. The reason isn't just client-side caching; more practically, the tool list gets spliced into the prompt, and if the order changes, the LLM's prompt cache invalidates entirely. If your tool list is iterated out of a map, you need to add a sort step here.

Corresponds to SEP 2549.

## 10. Transport layer and schema adjustments

The transport layer has a new hard requirement: Streamable HTTP POST requests must carry two standard headers, `Mcp-Method` and `Mcp-Name`. These two headers lift information that used to be buried in the JSON-RPC body up to the HTTP layer, so gateways, logging systems, and WAFs can route and rate-limit without unpacking the body. It also supports injecting custom headers from tool parameters via `x-mcp-header`. Corresponds to SEP 2243.

On the schema side, it's a loosening in the other direction: `inputSchema` and `outputSchema` are now allowed to use any JSON Schema 2020-12 keyword, and `structuredContent` allows any JSON value. It also adds requirements for reference resolution and resource caps on composition keywords, to stop anyone from writing an infinitely nested schema that drags a client down. Corresponds to SEP 2106.

One more change of a fix-it nature: the types of `minimum`, `maximum`, and `default` in schema.json are now correctly represented as `number` rather than just `integer`; this used to be caused by a wrong generator argument.

## 11. Error codes get reorganized

The resource-not-found error code changes from -32002 to -32602, aligning with JSON-RPC's Invalid Params.

More importantly, the spec settles on an error-code allocation policy this time, splitting JSON-RPC's server-error range into two segments: -32000 through -32019 stays open for implementations to define their own, and everything existing SDKs already use there is fully preserved; -32020 through -32099 belongs to the spec.

A few error codes newly introduced in this draft are renumbered under this policy:

| Error | Old code | New code |
| --- | --- | --- |
| HeaderMismatch | -32001 | -32020 |
| MissingRequiredClientCapability | -32003 | -32021 |
| UnsupportedProtocolVersion | -32004 | -32022 |

At the same time, `HeaderMismatchError` is formally added to the schema; before, it only existed in the transport layer's prose description.

## 12. Authorization gets tightened

There are four changes to authorization, all moving in a stricter direction.

Authorization servers should include the `iss` parameter in the authorization response per RFC 9207, and MCP clients must compare that `iss` against the issuer they have on record before exchanging the authorization code. This is the standard defense against mix-up attacks. Corresponds to SEP 2468.

When a client does dynamic registration, it must specify an appropriate `application_type`, to avoid conflicting with OpenID Connect's redirect URI rules. Corresponds to SEP 837.

Client credentials are now explicitly bound to the authorization server that issued them: they must be persisted keyed by issuer, must not be reused against a different authorization server, and must be re-registered the moment the authorization server changes. Corresponds to SEP 2352.

The last one is directional: OAuth 2.0 Dynamic Client Registration Protocol (RFC 7591) is deprecated as a registration mechanism, in favor of Client ID Metadata Documents. It's still kept around for compatibility with authorization servers that don't support the new approach.

## 13. Observability

The spec formally settles how OpenTelemetry trace context propagates within `_meta`, involving three keys: `traceparent`, `tracestate`, `baggage`. Corresponds to SEP 414.

This isn't complicated on its own, but it matters. Before, every implementation made up its own field name for passing trace info, and none of it stitched together across systems. Now with a shared convention, the full chain of a tool call, from client to server to downstream service, shows up directly in an off-the-shelf APM. Combined with Logging being deprecated in favor of OpenTelemetry above, you can see the spec's stance on observability: don't reinvent the wheel, just use the industry standard.

## 14. Deprecation list and lifecycle policy

This draft also introduces a feature lifecycle and deprecation policy: features fall into three states, Active, Deprecated, Removed; the deprecation window is at least 12 months; and there's a dedicated deprecated-feature registry tracking them. Corresponds to SEP 2596.

The following features remain fully usable during the window, but new implementations shouldn't adopt them.

| Deprecated item | Officially recommended replacement |
| --- | --- |
| Roots | Pass directories and files via tool parameters, resource URIs, or server config |
| Sampling | Talk to the LLM provider's API directly |
| Logging | Write to stderr in stdio scenarios, or switch to OpenTelemetry |
| HTTP+SSE transport | Migrate to Streamable HTTP |
| includeContext's thisServer and allServers | Omit the field, or pass none |
| OAuth 2.0 Dynamic Client Registration (RFC 7591) | Client ID Metadata Documents |

Roots, Sampling, and Logging are deprecated together, corresponding to SEP 2577. These three features share one thing in common: they all require the server to be able to reach back and invoke the client's capabilities. Seen against the backdrop of statelessness and MRTR, deprecating them is the natural next step.

HTTP+SSE transport has been marked deprecated since 2025-03-26; this draft just formally folds it into the new lifecycle policy. `includeContext`'s two values have been soft-deprecated since 2025-11-25 and are now formally listed as Deprecated; officially, their removal won't happen later than Sampling itself.

One more removed detail: the `notifications/elicitation/complete` notification introduced in 2025-11-25, along with the `elicitationId` field in URL-mode elicitation requests, are both dropped this time. The reasoning is clear: under MRTR, the client learns the result by retrying the original request, so a server-initiated completion signal and the identifier used to correlate it no longer make sense in the new model.

## 15. Governance and process

Besides the lifecycle policy above, there's another easy-to-miss process change: the SEP process is now formalized as a PR-based workflow. Proposals are markdown files in the seps directory, numbering is derived from the PR number, sponsor and champion responsibilities are spelled out, and status is managed through PR labels. Corresponds to SEP 1850.

For an ordinary user, this means tracing the full history of a change gets a lot easier going forward; every SEP number in the changelog can point straight to its corresponding discussion.

## If you're migrating, check these first

Turning the above into a self-check list, on the server side you need to confirm: whether you depend on the session ID to store context, whether you dynamically return different tool lists based on session, whether you're using server-initiated requests, whether tools are idempotent, whether list endpoints can give a stable order and a reasonable ttl, and whether `server/discover` is implemented.

On the client side you need to confirm: whether every request carries the full protocol version and capability fields, whether it can handle the `input_required` intermediate state and retry correctly, whether it treats a missing `resultType` as `complete`, whether it can resend with a new ID after a stream disconnect, and whether the authorization flow validates `iss`.

## Closing

Looking at all these changes together, the direction is clear.

Statelessness is the main thread. No sessions, no handshake, every request self-contained, and an MCP server can do load balancing, horizontal scaling, and rolling restarts just like an ordinary HTTP service. I think this is the one reason driving every other change.

The protocol is subtracting. Capabilities that got tacked on along the way, `ping`, Roots, Sampling, Logging, are either cut outright or land on the deprecation list, leaving the core down to tools, resources, and prompts. For a protocol meant to be widely implemented, a smaller surface area isn't a bad thing.

What's left is leaning toward mature web engineering practice. Cache semantics, standard request headers, OpenTelemetry, JSON-RPC error code allocation: none of this is new, it's just formally written into the spec this time. Add a clear deprecation policy and SEP process, and MCP looks like it's moving from a fast-evolving experiment toward a standard you can depend on for the long haul.

For existing implementations, the migration cost is real, and it's especially large for projects that depend on sessions, the `initialize` handshake, and server-initiated requests. What you get in exchange is a simpler protocol that's easier to implement correctly.

One last note: this is still a draft, and it can still change before it's finalized. Right now is a good time for technical research and architecture assessment, to identify the parts that will definitely be affected, without rushing into a full migration.

---

References: [MCP spec draft changelog](https://modelcontextprotocol.io/specification/draft/changelog), [full diff](https://github.com/modelcontextprotocol/specification/compare/2025-11-25...draft), [feature lifecycle and deprecation policy](https://modelcontextprotocol.io/community/feature-lifecycle)
