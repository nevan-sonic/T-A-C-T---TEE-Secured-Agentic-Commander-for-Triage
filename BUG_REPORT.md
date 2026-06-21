# Terminal 3 — Bug & Documentation Gap Report

This report documents bugs, broken links, and documentation gaps found while building on Terminal 3's marketing site, developer documentation, and SDK/ADK tooling. Each finding includes reproduction steps, actual vs. expected behavior, and a suggested fix.

**Total findings:** 28

> **Before submitting:** BUG-03, BUG-04, and BUG-05 still contain a `[FILL IN: ...]` placeholder in their Location/URL field. Replace each with the exact destination URL you recorded when you clicked the link, and attach the corresponding screenshot, before this report goes out.

## Methodology

- Functionality and marketing-site issues (`BUG-*`) were found by navigating the live site and recording actual browser behavior (404s, broken links, non-functional UI).
- Documentation gaps (`DOC-*`) were found by following the official onboarding and developer documentation as a new developer would, end to end.
- SDK/developer-kit issues (`SDK-*`) were found by reading the live documentation source and comparing official code examples and prose against each other and against the documented API behavior.
- Every finding below includes the steps needed to reproduce it and a suggested fix.


## Summary

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| BUG-01 | External links under maintenance — 'Go to network.terminal3.io' and T3N Dashboard inaccessible | 🟠 High | Platform / Testnet |
| BUG-02 | AI Agent creation form — 'Create' button stays disabled despite valid form | 🟠 High | Platform / Testnet |
| BUG-03 | “Reusable KYC” link on Common Use Cases page returns 404 | 🟠 High | Marketing Site |
| BUG-04 | “Identity Verification for Humans and Agents” link on Common Use Cases page returns 404 | 🟠 High | Marketing Site |
| BUG-05 | “See Delete Access to AI Agents” link under Payroll Agents use case returns 404 | 🟠 High | Marketing Site |
| BUG-06 | Payroll Agent doc page mislabels and miswires its only link | 🟡 Medium | Documentation |
| DOC-01 | No self-serve developer signup on terminal3.io — only enterprise sales form exists | 🔴 Critical | Onboarding |
| DOC-02 | No clear developer onboarding flow on main website | 🔴 Critical | Onboarding |
| DOC-03 | DID registration requirement not clearly explained in onboarding | 🟠 High | Developer Experience |
| DOC-04 | Placeholder DIDs silently cause integration failure — no warning in docs | 🟠 High | Developer Experience |
| DOC-05 | DID generation flow is not discoverable — full key generation chain not documented on registration page | 🟠 High | Developer Experience |
| DOC-06 | No end-to-end integration example covering full VC workflow | 🟠 High | Developer Experience |
| DOC-07 | Wallet address source for DID registration is unclear | 🟡 Medium | Developer Experience |
| DOC-08 | API error messages lack actionable guidance — no links or endpoint hints | 🟡 Medium | Developer Experience |
| DOC-09 | No way to determine if SDK requests are live vs. simulated | 🟡 Medium | Developer Experience |
| DOC-10 | Misleading DID error masks actual 401 authentication failure | 🟡 Medium | Onboarding / Authentication |
| DOC-11 | Claimed API key returns 401 against documented endpoint — key may not be immediately active | 🟡 Medium | Onboarding / Authentication |
| DOC-12 | Endpoint documentation inaccurate or incomplete — team confirmed docs being updated | 🟡 Medium | Documentation / Developer Onboarding |
| DOC-13 | Introduction documentation page returns 404 | 🟢 Low | Documentation / Broken Link |
| DOC-14 | Product Releases page renders 'null' — no changelog or version history displayed | 🟡 Medium | Documentation |
| DOC-15 | ADK Overview does not explain what an 'Ethereum wallet' is or how to create one | 🔴 Critical | Documentation |
| DOC-16 | ADK Overview does not explain what 'fuel' is or how to estimate costs before building | 🔴 Critical | Documentation |
| DOC-17 | No Rust-to-WASM contract development guide — docs jump from concept to 'publish' with zero implementation steps | 🔴 Critical | Documentation |
| DOC-18 | Delegate Access page has two 'Coming Soon' sections with no timeline or workaround | 🟡 Medium | Documentation |
| DOC-19 | Manage Identity and Introduction pages contain dead image code — screenshots permanently hidden via {false && ...} | 🟡 Medium | Documentation |
| SDK-01 | Tenant ID is encoded two different ways across official z:<tid>:<map> examples (Rust vs TypeScript) | 🟠 High | Developer Experience |
| SDK-02 | Both published OpenAPI spec links in the official docs index return 404 | 🟡 Medium | Documentation |
| SDK-03 | Set Up Development Environment page contradicts itself on how the tenant DID is derived | 🟠 High | Developer Experience |

---

## A. Functionality & Marketing Site Bugs

### BUG-01. External links under maintenance — 'Go to network.terminal3.io' and T3N Dashboard inaccessible

**Severity:** 🟠 High  
**Type:** Functionality Bug  
**Category:** Platform / Testnet  
**Location/URL:** T3N > Data Owners > Getting Started  
**Status:** Open

**Steps to Reproduce:**
1. Navigate to T3N Data Owners Getting Started page.
2. Click 'Go to network.terminal3.io'.
3. Also click 'Manage your identity' / T3N Dashboard link.

**Actual Result:** Both links display an 'Under Maintenance' page.

**Expected Result:** Both links should open working pages — the T3N network portal and the T3N identity/dashboard respectively.

**Impact:** Developers cannot complete Data Owner onboarding or access identity management, blocking all downstream workflows.

**Suggested Fix:** Either restore the services or display a clear maintenance banner on the source page with estimated ETA. Add a maintenance status page link.

### BUG-02. AI Agent creation form — 'Create' button stays disabled despite valid form

**Severity:** 🟠 High  
**Type:** Functionality Bug  
**Category:** Platform / Testnet  
**Location/URL:** https://testnet.network.terminal3.io/agents  
**Status:** Open

**Steps to Reproduce:**
1. Navigate to AI Agents.
2. Click 'New Agent'.
3. Enter a valid Agent DID.
4. Select an Authorized Contract.
5. Observe Create button.
6. Open DevTools → run document.querySelector('form')?.checkValidity() → returns true.
7. Manually remove disabled attribute from Create button.
8. Click Create.

**Actual Result:** Create button remains disabled even though form passes validation. Manually clicking after removing disabled attribute produces no action, no success message, and no error.

**Expected Result:** Create button should enable when form is valid. Clicking it should either create the agent or return a clear validation/error message.

**Impact:** Users cannot complete the AI Agent creation workflow, entirely blocking testing of agent delegation and authorization features.

**Suggested Fix:** Debug the JavaScript condition that controls the Create button's disabled state. Ensure form.checkValidity() result actually triggers UI update. Add proper success/error response handling.

### BUG-03. “Reusable KYC” link on Common Use Cases page returns 404

**Severity:** 🟠 High  
**Type:** Functionality Bug  
**Category:** Marketing Site  
**Location/URL:** [FILL IN: exact destination URL recorded from your click — confirm before submitting]  
**Status:** Open

**Steps to Reproduce:**
1. Open the Common Use Cases page on terminal3.io.
2. Click 'Reusable KYC'.
3. Record the destination URL.
4. Observe the page that loads.

**Actual Result:** The link navigates to a 404 / Page Not Found page.

**Expected Result:** The link should open a page describing the Reusable KYC use case (e.g. T3 Verify / reusable KYC product or use-case page).

**Impact:** Visitors following the primary use-case navigation from the marketing site hit a dead end on one of the product's flagship use cases, undermining credibility and blocking discovery of the KYC/AML offering.

**Suggested Fix:** Restore the missing page or update the link target to the correct live URL for the Reusable KYC use case. Add automated link checking to the marketing site deploy pipeline.

### BUG-04. “Identity Verification for Humans and Agents” link on Common Use Cases page returns 404

**Severity:** 🟠 High  
**Type:** Functionality Bug  
**Category:** Marketing Site  
**Location/URL:** [FILL IN: exact destination URL recorded from your click — confirm before submitting]  
**Status:** Open

**Steps to Reproduce:**
1. Open the Common Use Cases page on terminal3.io.
2. Click 'Identity Verification for Humans and Agents'.
3. Record the destination URL.
4. Observe the page that loads.

**Actual Result:** The link navigates to a 404 / Page Not Found page.

**Expected Result:** The link should open a page describing identity verification for both human users and AI agents.

**Impact:** Visitors trying to learn about the agent-identity use case — a core differentiator for Terminal 3 — cannot reach any content, weakening the use-case narrative for the platform's main AI-agent audience.

**Suggested Fix:** Restore the missing page or correct the link target. Add automated link checking to the marketing site deploy pipeline.

### BUG-05. “See Delete Access to AI Agents” link under Payroll Agents use case returns 404

**Severity:** 🟠 High  
**Type:** Functionality Bug  
**Category:** Marketing Site  
**Location/URL:** [FILL IN: exact destination URL recorded from your click — confirm before submitting]  
**Status:** Open

**Steps to Reproduce:**
1. Open the Payroll Agents use-case page.
2. Find the 'Delete Access to AI Agents' section.
3. Click 'See Delete Access to AI Agents'.
4. Record the destination URL.
5. Observe the page that loads.

**Actual Result:** The link navigates to a 404 / Page Not Found page.

**Expected Result:** The link should open documentation or a page explaining how to delete/revoke an AI agent's access.

**Impact:** Enterprise readers evaluating the Payroll Agents use case cannot reach access-revocation information, which is a core trust/safety concern for any payroll-handling agent — directly undercutting the page's compliance pitch.

**Suggested Fix:** Restore the missing page or correct the link target to point at the correct access-revocation documentation. Add automated link checking to the marketing site deploy pipeline.

### BUG-06. Payroll Agent doc page mislabels and miswires its only link

**Severity:** 🟡 Medium  
**Type:** Documentation Bug  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/developers/adk/use-cases/payroll-agent.md  
**Status:** Open

**Steps to Reproduce:**
1. Fetch https://docs.terminal3.io/developers/adk/use-cases/payroll-agent.md directly (or open the Payroll Agent page under Developers > ADK > Use Cases).
2. Observe the page contains a single line: 'See [Delete Access to AI Agents](t3n/use-cases/delegate-access-to-agent#payroll)'.
3. Compare the link text to its target: the destination is the 'Delegate Access to AI Agents' page (delegate-access-to-agent.md), not a 'Delete Access' page — no such page exists in the docs index (confirmed against https://docs.terminal3.io/llms.txt).
4. Note the link path itself is also relative ('t3n/use-cases/...') with no leading slash, unlike other internal links in the same docs set which use root-relative paths (e.g. '/developers/adk/get-started/walkthrough/invoke-contract').

**Actual Result:** The Payroll Agent page's only content is a link labeled 'Delete Access to AI Agents' that actually points to the 'Delegate Access to AI Agents' page. The link text does not match either the destination page's title or its content, and the link's path format is inconsistent with other root-relative internal links elsewhere in the docs.

**Expected Result:** The link text should read 'Delegate Access to AI Agents' to match its destination, and should use the same root-relative path convention as other internal docs links (e.g. '/t3n/use-cases/delegate-access-to-agent#payroll').

**Impact:** Developers looking specifically for how to delete or revoke an AI agent's access (a real and important workflow, especially for a payroll use case) are misdirected to a page about granting/delegating access instead, with no actual 'delete access' documentation existing anywhere in the docs. This is confusing at best and could lead developers to believe agent-deletion is undocumented when it may simply be mislabeled.

**Suggested Fix:** Rename the link to 'Delegate Access to AI Agents' to match its target, and/or add a dedicated 'Delete/Revoke Access to AI Agents' page if that capability is meant to be documented separately. Standardize internal link paths to root-relative format across the docs source.


---

## B. Documentation Gaps & Doc Bugs

### DOC-01. No self-serve developer signup on terminal3.io — only enterprise sales form exists

**Severity:** 🔴 Critical  
**Type:** Documentation Gap  
**Category:** Onboarding  
**Location/URL:** https://www.terminal3.io — All navigation links  
**Status:** Open

**Steps to Reproduce:**
1. Go to terminal3.io.
2. Click every button and navigation link looking for 'Sign Up', 'Get Started', or 'Developer Portal'.
3. All paths lead to a 'How can we help?' enterprise contact form.

**Actual Result:** No developer-specific signup path exists on the main website. The only way to reach the developer claim page is via the direct URL terminal3.io/claim-page, which is undiscoverable.

**Expected Result:** A 'Developer Sign Up' or 'Get API Key' button should be visible on the main website, leading directly to the claim page or developer portal.

**Impact:** HIGH — New developers discovering Terminal 3 organically will hit a dead end. The developer onboarding funnel is completely broken for organic traffic.

**Suggested Fix:** Add a prominent 'Start Building' or 'Get API Key' CTA in the main navigation that links to the claim/developer portal page.

### DOC-02. No clear developer onboarding flow on main website

**Severity:** 🔴 Critical  
**Type:** Documentation Gap  
**Category:** Onboarding  
**Location/URL:** https://www.terminal3.io  
**Status:** Open

**Steps to Reproduce:**
1. Visit terminal3.io as a new developer.
2. Try to find: how to create an account, get API credentials, access sandbox, register a DID, access SDK docs.

**Actual Result:** No unified 'Getting Started' flow exists. Each item requires independent discovery across multiple pages.

**Expected Result:** A dedicated 'Getting Started' page covering: account creation, sandbox token claim, API key retrieval, DID registration, and first API call example.

**Impact:** New developers spend significant time searching for basic setup instructions before they can start building.

**Suggested Fix:** Create a dedicated Getting Started / Quick Start page with numbered steps covering the full initial setup sequence.

### DOC-03. DID registration requirement not clearly explained in onboarding

**Severity:** 🟠 High  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** Onboarding docs / API reference  
**Status:** Open

**Steps to Reproduce:**
1. Complete onboarding.
2. Attempt to use VC endpoints with just the API key.
3. Receive error: 'T3N API key not authorized for DID/VC endpoints. Register the DID first.'

**Actual Result:** Error appears with no prior warning that DID registration is a mandatory prerequisite. The onboarding flow does not mention this requirement.

**Expected Result:** Onboarding should clearly state that a DID must be registered before VC operations, and that the API key alone is not sufficient.

**Impact:** Developers may incorrectly assume the API key is invalid or the SDK is malfunctioning, leading to wasted debugging time.

**Suggested Fix:** Add a prerequisite callout box before VC API docs: 'Before using VC APIs, you must register a DID.' Link to the DID registration page.

### DOC-04. Placeholder DIDs silently cause integration failure — no warning in docs

**Severity:** 🟠 High  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** VC/DID documentation  
**Status:** Open

**Steps to Reproduce:**
1. Follow docs to integrate VC features.
2. Use a placeholder DID like 'did:key:my-agent' or 'did:key:phoenix-agent-001'.
3. Observe application behavior.

**Actual Result:** Application silently fails or falls back to simulation mode. No error clearly indicates the DID is invalid.

**Expected Result:** Documentation should prominently warn that DIDs must be cryptographically generated and arbitrary strings are not valid DIDs.

**Impact:** Applications silently fall back to simulation mode, leading developers to believe integration is working when it isn't.

**Suggested Fix:** Add a warning box in DID docs: 'Do not manually create DIDs. Generate them using the VC SDK.' Include a code example.

### DOC-05. DID generation flow is not discoverable — full key generation chain not documented on registration page

**Severity:** 🟠 High  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** DID Registration documentation page  
**Status:** Open

**Steps to Reproduce:**
1. Navigate to DID registration page.
2. Follow instruction: 'Please refer to our VC SDK'.
3. Try to find the correct generation sequence.

**Actual Result:** The page does not show that developers must call: randomKeyBls() → blsG2PublicKeyFromPrivateKey() → bbsDidFromPublicKey() before registering a DID.

**Expected Result:** The full DID generation example should be directly on the DID registration page, not buried in a separate SDK reference.

**Impact:** Developers incorrectly assume DID registration creates the DID for them, causing repeated registration failures.

**Suggested Fix:** Include the complete DID generation code example (all 3 steps) directly on the DID registration documentation page.

### DOC-06. No end-to-end integration example covering full VC workflow

**Severity:** 🟠 High  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** Docs — VC/DID API reference  
**Status:** Open

**Steps to Reproduce:**
1. Attempt to build a complete VC workflow: key gen → DID gen → DID register → issue VC → store VC → generate proof → verify proof.
2. Follow individual API docs for each step.

**Actual Result:** Documentation covers individual APIs in isolation. No complete tutorial project exists that chains all steps together.

**Expected Result:** A complete end-to-end tutorial project showing all 7 steps in sequence with working code.

**Impact:** Developers must piece together multiple documentation pages, significantly increasing onboarding time and error rate.

**Suggested Fix:** Publish a complete tutorial project (e.g., on GitHub) with inline comments covering the full 7-step VC workflow.

### DOC-07. Wallet address source for DID registration is unclear

**Severity:** 🟡 Medium  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** DID Registration API reference  
**Status:** Open

**Steps to Reproduce:**
1. Attempt DID registration: POST with {"did": "...", "wallet_address": "0x..."}.
2. Try to determine where the wallet_address value should come from.

**Actual Result:** Documentation does not explain whether the wallet address is generated automatically, linked to the developer account, or must be self-managed.

**Expected Result:** A dedicated explanation clarifying the wallet_address field: its source, whether it is auto-generated, and how to obtain it.

**Impact:** Developers cannot confidently complete DID registration, creating a blocking step in onboarding.

**Suggested Fix:** Add a 'Wallet Address' explanation section to the DID registration docs. Clarify source and provide an example or generation guide.

### DOC-08. API error messages lack actionable guidance — no links or endpoint hints

**Severity:** 🟡 Medium  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** Staging API — error responses  
**Status:** Open

**Steps to Reproduce:**
1. Make an API call without a registered DID.
2. Observe the error message returned.

**Actual Result:** Error returns: 'T3N API key not authorized for DID/VC endpoints. Register the DID first.' — with no registration endpoint, payload example, or docs link.

**Expected Result:** Error should say: 'DID not registered. Register via POST /v1/did/register. See docs: [link]' — contextual and actionable by HTTP status code.

**Impact:** Developers spend unnecessary time searching for the right registration endpoint instead of being directed there immediately.

**Suggested Fix:** Update error responses to be context-aware: 401 → auth failure message, 404 → DID not found + registration link, 403 → permission scope message.

### DOC-09. No way to determine if SDK requests are live vs. simulated

**Severity:** 🟡 Medium  
**Type:** Documentation Gap  
**Category:** Developer Experience  
**Location/URL:** SDK integration / docs  
**Status:** Open

**Steps to Reproduce:**
1. Integrate the Terminal 3 SDK.
2. Make API calls.
3. Try to determine if requests are hitting live services or returning simulated responses.

**Actual Result:** No health-check endpoint or integration verification mechanism exists. SDK may silently return mocked responses.

**Expected Result:** A health-check endpoint and integration verification guide to confirm live connectivity and successful DID registration.

**Impact:** Developers may believe integration is working when all responses are mocked, leading to broken production deployments.

**Suggested Fix:** Provide a GET /health or GET /v1/status endpoint. Document how to verify live vs. simulated mode. Add an integration checklist.

### DOC-10. Misleading DID error masks actual 401 authentication failure

**Severity:** 🟡 Medium  
**Type:** Documentation Gap / Auth Bug  
**Category:** Onboarding / Authentication  
**Location/URL:** staging.terminal3.io — GET /v1/did  
**Status:** Open

**Steps to Reproduce:**
1. Visit Agent Developer Kit claim page.
2. Complete onboarding and copy the API key.
3. Run: curl -X GET https://staging.terminal3.io/v1/did -H 'x-api-token: <claimed_api_key>'
4. Observe response.

**Actual Result:** 401 Unauthorized returned. SDK/error directs developer to DID registration, but root cause is API key rejection — not missing DID.

**Expected Result:** Either 200 OK (DID found) or 404 Not Found (no DID yet). Error message should identify authentication failure, not DID registration.

**Impact:** Developers waste hours debugging DID generation and registration when the actual issue is an invalid/inactive API key.

**Suggested Fix:** Return contextual errors by HTTP status. For 401: 'Authentication failed. Verify x-api-token.' Add an API key validation step during onboarding.

### DOC-11. Claimed API key returns 401 against documented endpoint — key may not be immediately active

**Severity:** 🟡 Medium  
**Type:** Documentation Gap  
**Category:** Onboarding / Authentication  
**Location/URL:** staging.terminal3.io — GET /v1/did  
**Status:** Open

**Steps to Reproduce:**
1. Complete onboarding and claim API key from Agent Developer Kit page.
2. Use key as x-api-token header.
3. Call GET https://staging.terminal3.io/v1/did.
4. Observe 401.

**Actual Result:** 401 Unauthorized: {"errors":[{"code":"unauthorized","message":"Unauthorized request."}]}

**Expected Result:** 200 OK or 404 depending on DID status. Documentation should clarify if claimed key needs additional activation.

**Impact:** Significant onboarding confusion: claim page says 'Copy your API key and start building' but key is rejected by documented endpoint.

**Suggested Fix:** Clarify whether claimed key is the x-api-token or if additional steps are needed. Provide an API key verification step in onboarding. Improve error specificity (invalid token vs inactive vs wrong environment).

### DOC-12. Endpoint documentation inaccurate or incomplete — team confirmed docs being updated

**Severity:** 🟡 Medium  
**Type:** Documentation Gap  
**Category:** Documentation / Developer Onboarding  
**Location/URL:** docs.terminal3.io — Agent Auth SDK / DID endpoints  
**Status:** Open

**Steps to Reproduce:**
1. Follow available documentation to implement DID lookup/authentication flow.
2. Attempt API calls using documented endpoints.
3. Receive authentication failures.
4. Contact support for clarification.

**Actual Result:** Terminal 3 team responded: 'Please give us a few moments to update the docs to ensure all the endpoints are accurate.' — confirming docs were stale.

**Expected Result:** A complete, accurate, and versioned API endpoint reference clearly separating production, staging, and sandbox environments.

**Impact:** Developers integrate against incorrect endpoints, receive 401 errors, and spend hours debugging valid code due to stale docs.

**Suggested Fix:** Publish a definitive endpoint reference with environment URLs. Add a health-check endpoint. Include a complete Agent Auth integration example. Implement automated link/endpoint validation in CI.

### DOC-13. Introduction documentation page returns 404

**Severity:** 🟢 Low  
**Type:** Documentation Gap  
**Category:** Documentation / Broken Link  
**Location/URL:** https://docs.terminal3.io/t3n/overview/introduction  
**Status:** Open

**Steps to Reproduce:**
1. Open https://docs.terminal3.io/t3n/overview/introduction
2. Observe the response.

**Actual Result:** 404 Page Not Found

**Expected Result:** The Introduction page loads and provides onboarding/introduction information for new developers.

**Impact:** New developers following documentation navigation hit a dead end at the first page, reducing confidence in the docs.

**Suggested Fix:** Restore the missing page or redirect the URL to the correct location. Add automated link validation to the documentation deployment pipeline.

### DOC-14. Product Releases page renders 'null' — no changelog or version history displayed

**Severity:** 🟡 Medium  
**Type:** Documentation Bug  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/releases/product-releases.md  
**Status:** Open

**Steps to Reproduce:**
1. Open the Product Releases page URL.
2. Wait for the page to load.
3. Observe content.

**Actual Result:** Page displays only the text 'null'. No release information, changelog, redirect, or error explanation is provided.

**Expected Result:** A changelog or product release history page with version notes.

**Impact:** Developers cannot access release notes or version history and may miss breaking changes to APIs or SDK behavior.

**Suggested Fix:** Fix the CMS/markdown rendering pipeline for this page. Populate with at least a placeholder release note. Add monitoring for null-content pages.

### DOC-15. ADK Overview does not explain what an 'Ethereum wallet' is or how to create one

**Severity:** 🔴 Critical  
**Type:** Documentation Gap  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/developers/adk/overview/what-is-adk  
**Status:** Open

**Steps to Reproduce:**
1. Read the ADK Overview page.
2. Find: 'One call signs in with your Ethereum wallet'.
3. Search entire documentation for how to create or connect an Ethereum wallet.
4. Find zero guidance — no link, no explanation, no recommended tool.

**Actual Result:** Documentation assumes the reader already has an Ethereum wallet and knows how to use it. No mention of MetaMask, WalletConnect, or any other wallet option anywhere in ADK docs.

**Expected Result:** A clear explanation of what an Ethereum wallet is, how to create one (e.g., MetaMask), and how to connect it to the T3N SDK. Beginner developers should not need prior Web3 knowledge.

**Impact:** CRITICAL — The very first step of SDK authentication requires an Ethereum wallet. Developers without Web3 background (the majority of AI/backend developers) are immediately blocked with no guidance.

**Suggested Fix:** Add a 'Prerequisites' or 'Web3 Wallet Setup' section to the ADK Overview. Recommend MetaMask or WalletConnect with a setup link. Include a short explanation of what an Ethereum wallet is in the context of T3N.

### DOC-16. ADK Overview does not explain what 'fuel' is or how to estimate costs before building

**Severity:** 🔴 Critical  
**Type:** Documentation Gap  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/t3n/how-t3n-works/tee-contracts.md — Fuel section  
**Status:** Open

**Steps to Reproduce:**
1. Read the TEE Contracts page.
2. Find: 'Each contract invocation is assigned a bounded computation budget (fuel)'.
3. Search docs for: fuel cost per operation, how to estimate fuel, what happens when fuel runs out, how to get more fuel.
4. Find no pricing table, no cost estimator, no fuel consumption guide.

**Actual Result:** The claim page states 20,000 tokens allow 'roughly 5,000 protected actions' but documentation never explains the fuel model, consumption rates, or how to optimize for fuel efficiency.

**Expected Result:** A fuel cost table showing approximate consumption per operation type (e.g., 'simple key-value read = 10 fuel', 'HTTP POST call = 500 fuel'). Also needed: what happens when fuel is exhausted mid-execution.

**Impact:** CRITICAL — Developers cannot plan or budget their applications without understanding costs. A developer could exhaust all test tokens in minutes without realizing it.

**Suggested Fix:** Publish a fuel cost reference table. Document what happens on fuel exhaustion (error thrown vs silent fail). Add a fuel estimation guide or calculator. Surface remaining fuel balance in the developer dashboard.

### DOC-17. No Rust-to-WASM contract development guide — docs jump from concept to 'publish' with zero implementation steps

**Severity:** 🔴 Critical  
**Type:** Documentation Gap  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/developers/adk/overview/what-is-adk — Contracts section  
**Status:** Open

**Steps to Reproduce:**
1. Read ADK Overview: 'publish a Rust-to-WASM contract'.
2. Search docs for Rust setup instructions, WASM compilation guide, Cargo.toml configuration, or example contract templates.
3. Find zero guidance on any of these topics.

**Actual Result:** The only code example is conceptual pseudocode on the TEE Contracts page. No working example, no repository link, no compilation command, and no Rust project template exists.

**Expected Result:** A 'Writing Your First TEE Contract' guide covering: Rust toolchain setup, project structure, WASM compilation command, how to publish the compiled binary, and a minimal working example.

**Impact:** CRITICAL — Writing Rust-to-WASM contracts is a non-trivial skill. The documentation jumps from 'here is what contracts can do' to 'publish your contract' with zero implementation guidance. Most developers will be completely blocked.

**Suggested Fix:** Publish a step-by-step 'First TEE Contract' tutorial with: Rust + wasm-pack setup, project template, Cargo.toml config, compilation command, and a minimal end-to-end working example. Link a GitHub starter repo.

### DOC-18. Delegate Access page has two 'Coming Soon' sections with no timeline or workaround

**Severity:** 🟡 Medium  
**Type:** Documentation Gap  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/t3n/data-owner-guide/delegate-access.md  
**Status:** Open

**Steps to Reproduce:**
1. Navigate to the Delegate Access documentation page.
2. Scroll to 'Delegate Access to Human Users' section — reads: 'Coming soon.'
3. Scroll to 'Delegate Access to Third-Party Services' section — reads: 'Coming soon.'

**Actual Result:** Both 'Delegate Access to Human Users' and 'Delegate Access to Third-Party Services' sections exist in the docs with no content — only 'Coming soon.' No timeline, no workaround, no alternative approach.

**Expected Result:** Either complete documentation for these features, or provide a clear timeline for availability, or a note explaining they are not yet available in the sandbox with a suggested workaround.

**Impact:** MEDIUM — Developers building applications requiring these delegation types (most enterprise use cases) have no way to plan around these limitations.

**Suggested Fix:** Replace bare 'Coming soon.' with a structured placeholder: feature status, estimated timeline (even a quarter), known workarounds, and a link to subscribe for updates or changelog.

### DOC-19. Manage Identity and Introduction pages contain dead image code — screenshots permanently hidden via {false && ...}

**Severity:** 🟡 Medium  
**Type:** Documentation Bug  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/t3n/data-owner-guide/manage-identity.md — also Introduction page  
**Status:** Open

**Steps to Reproduce:**
1. Navigate to the Manage Identity documentation page.
2. View the raw markdown/JSX source.
3. Find the block: {false && ( <> [img: profile-light.png] [img: profile-dark.png] )} 
4. Confirm images are permanently hidden. Same pattern appears on the Introduction page.

**Actual Result:** Documentation contains commented-out image blocks using {false && ...} — a JSX pattern that permanently prevents the images from rendering. Users who rely on visual documentation see no screenshots.

**Expected Result:** Either display the profile interface images (light and dark mode) to help users understand the dashboard UI, or remove the dead code entirely.

**Impact:** MEDIUM — Hidden images reduce documentation quality for visual learners. Dead code also indicates incomplete documentation that was never finished.

**Suggested Fix:** Remove the {false && ...} wrapper to render the images, or delete the dead code blocks entirely. Add automated linting to detect permanently-false conditional renders in documentation source.


---

## C. SDK & Developer-Kit Bugs

### SDK-01. Tenant ID is encoded two different ways across official z:<tid>:<map> examples (Rust vs TypeScript)

**Severity:** 🟠 High  
**Type:** SDK / Documentation Bug  
**Category:** Developer Experience  
**Location/URL:** https://docs.terminal3.io/developers/adk/get-started/walkthrough/write-contract.md vs https://docs.terminal3.io/developers/adk/get-started/walkthrough/invoke-contract.md  
**Status:** Open

**Steps to Reproduce:**
1. Open write-contract.md, section 'Reading secrets from the secrets KV map'. Note the Rust example builds the map name as: format!("z:{}:secrets", hex::encode(&tid)) where tid comes from tenant_context::tenant_did().
2. Open invoke-contract.md, step 2 'Invoke your contract'. Note the TypeScript example builds the equivalent name as: `z:${tenantDid.slice("did:t3n:".length)}:travel-contracts` — i.e. it strips the 'did:t3n:' prefix and uses the remaining string directly, with no hex-encoding.
3. Compare both against create-kv-maps.md, which states the SDK builds the full name from a plain 'tail' string (e.g. 'secrets') and the host stores it as z:<tid>:<tail> — implying <tid> is used as a string, not raw bytes.
4. Observe the Rust example is the only one of the three that hex-encodes the identifier.

**Actual Result:** The Rust contract example hex-encodes the tenant DID/identifier before building the z:<tid>:<map> name, while the TypeScript SDK example and the KV-map creation docs both treat <tid> as a plain string slice of the DID. If tenant_did() returns the same kind of value referenced elsewhere (a DID string such as did:t3n:0x...), hex-encoding it would produce a different, non-matching map name than the one the map was actually created under, causing kv_store::get to fail with a not-found/AccessDenied-style error despite the map existing.

**Expected Result:** All official examples that construct a z:<tid>:<map> name from the same underlying tenant identifier should use the same encoding, and the docs should state explicitly what type tenant_context::tenant_did() returns (raw bytes vs. DID string) so contract authors don't have to guess.

**Impact:** A developer following the official write-contract.md walkthrough verbatim can end up with a contract that compiles but fails at runtime with a confusing KV-read error, because the map name it builds does not match the map name created by the tenant SDK. This is exactly the class of error common-errors.md attributes to a tail mismatch, but the walkthrough's own example may be the thing causing it.

**Suggested Fix:** Pick one canonical encoding for the tenant identifier inside z:<tid>:<map> names, document the exact return type of tenant_context::tenant_did(), and update whichever of the two walkthrough examples (Rust or TypeScript) is inconsistent with it.

### SDK-02. Both published OpenAPI spec links in the official docs index return 404

**Severity:** 🟡 Medium  
**Type:** Documentation / API Bug  
**Category:** Documentation  
**Location/URL:** https://docs.terminal3.io/terminal-3-openapi.yml and https://docs.terminal3.io/api-reference/openapi.json  
**Status:** Open

**Steps to Reproduce:**
1. Fetch the documentation index at https://docs.terminal3.io/llms.txt.
2. Note it lists two OpenAPI spec links under 'OpenAPI Specs': 'terminal-3-openapi' (https://docs.terminal3.io/terminal-3-openapi.yml) and 'openapi' (https://docs.terminal3.io/api-reference/openapi.json).
3. Request each URL directly.
4. Observe both return HTTP 404.

**Actual Result:** Both OpenAPI specification URLs listed in Terminal 3's own documentation index return 404 Not Found when requested directly.

**Expected Result:** At least one working OpenAPI spec should be reachable at a URL the docs themselves advertise, so developers and SDK/codegen tools can consume the API definition.

**Impact:** Anyone trying to generate a client, validate request/response shapes, or import the API into tooling like Postman/Insomnia via the documented spec links is blocked. This also undermines confidence in the rest of the docs index, since these are the only two machine-readable API references listed.

**Suggested Fix:** Restore the OpenAPI spec files at the documented paths, or update llms.txt to point at their current live location. Add the spec URLs to automated link-checking in the docs deploy pipeline so this regresses loudly next time.

### SDK-03. Set Up Development Environment page contradicts itself on how the tenant DID is derived

**Severity:** 🟠 High  
**Type:** SDK / Documentation Bug  
**Category:** Developer Experience  
**Location/URL:** https://docs.terminal3.io/developers/adk/get-started/prerequisites/set-up-dev-env.md  
**Status:** Open

**Steps to Reproduce:**
1. Open https://docs.terminal3.io/developers/adk/get-started/prerequisites/set-up-dev-env.md.
2. Read the 'Authenticate to T3N testnet' step. It states the tenant DID 'is an opaque, random did:t3n:<40 hex>, minted when you first signed in' and is 'not derived from your wallet or any key material — your sign-in credential ... is just an authenticator on that DID.'
3. Read the code sample directly above and below that statement on the same page: it computes `const address = eth_get_address(T3N_API_KEY)`, builds the client with `EthSign: metamask_sign(address, undefined, T3N_API_KEY)`, and authenticates with `t3n.authenticate(createEthAuthInput(address))` — i.e. the entire authentication flow is keyed on the wallet address derived from the developer's own API key/private key.
4. Compare: the prose says the DID is NOT derived from wallet/key material, while every line of the adjacent code derives identity from exactly that.

**Actual Result:** The page asserts the tenant DID is random and independent of any wallet or key, then immediately shows an authentication flow that is entirely built around `eth_get_address(T3N_API_KEY)` and signing with that same key — i.e. wallet/key material is the thing the whole flow authenticates with.

**Expected Result:** The explanation and the code sample should agree. Either the DID truly is independent of the signing key (in which case the code/prose should clarify how the link between the two is established only once, at first sign-in, and never again), or the explanation should be corrected to say the DID is bound to whichever key authenticates first, not unrelated to key material as currently worded.

**Impact:** Developers who read the warning literally may assume they can freely rotate or regenerate their API key/wallet without affecting their tenant DID, since the docs explicitly tell them the DID is 'not derived from your wallet or any key material.' If that's wrong in practice, rotating keys could silently break their tenant linkage or create a second, unexpected tenant — exactly the kind of dangerous misunderstanding a 'golden rule' callout box is supposed to prevent, not cause.

**Suggested Fix:** Clarify in plain language what 'not derived from your wallet' actually means in this flow — most likely that the DID is assigned once at first authentication and the wallet/API key is merely the authenticator linked to it thereafter, not a derivation source. Update the wording so the prose and the code example tell the same story.
