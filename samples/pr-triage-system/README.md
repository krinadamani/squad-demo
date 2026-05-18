# pr-triage-system

This sample is an Engineering Intake and PR Triage assistant built with the Squad SDK.
It casts a deterministic team (lead, developer, tester, scribe), runs triage heuristics on an issue/PR payload, and writes review-ready reports.
It can call a real LLM for each role and prints each role's output in the terminal.

## Quick start

1. Install dependencies: npm.cmd install
2. Edit `.env` placeholders in this folder for your provider settings
3. Run with built-in default payload: npm.cmd start
4. Run with a custom payload file: npm.cmd start -- --input fixtures/pr-1842.json

## LLM setup

This sample supports two providers:

- OpenAI via Chat Completions API
- Azure OpenAI via deployment endpoint
- Ollama via local /api/generate

If no provider is configured or a call fails, the app falls back to deterministic role text and annotates the reason.
The app auto-loads variables from `.env` in this sample directory.

### OpenAI

PowerShell:

1. $env:LLM_PROVIDER = "openai"
2. $env:OPENAI_API_KEY = "<your_key>"
3. Optional: $env:OPENAI_MODEL = "gpt-4o-mini"
4. Optional: $env:OPENAI_BASE_URL = "https://api.openai.com/v1"
5. npm.cmd start -- --input fixtures/pr-1842.json

### Azure OpenAI

PowerShell (recommended for resources where API key auth is disabled):

1. az login
2. $env:LLM_PROVIDER = "azure-openai"
3. $env:AZURE_OPENAI_AUTH_MODE = "entra"
4. $env:AZURE_OPENAI_ENDPOINT = "https://<resource>.openai.azure.com"
5. $env:AZURE_OPENAI_DEPLOYMENT = "<deployment_name>"
6. Optional: $env:AZURE_OPENAI_API_VERSION = "2024-10-21"
7. npm.cmd start -- --input fixtures/pr-1842.json

Alternative Azure auth modes:

- Entra with explicit token: set `AZURE_OPENAI_BEARER_TOKEN`
- Key auth (only if enabled on your resource): set `AZURE_OPENAI_AUTH_MODE=key` and `AZURE_OPENAI_API_KEY`
### Ollama

PowerShell:

1. Start Ollama locally and ensure the model is available
2. $env:LLM_PROVIDER = "ollama"
3. Optional: $env:OLLAMA_MODEL = "llama3.1"
4. Optional: $env:OLLAMA_BASE_URL = "http://localhost:11434"
5. npm.cmd start -- --input fixtures/pr-1842.json

### Force deterministic fallback

PowerShell:

1. $env:LLM_PROVIDER = "fallback"
2. npm.cmd start -- --input fixtures/pr-1842.json

## Where data is stored

This sample writes its demo output inside this sample folder so state persists between runs:

- .demo-data/.squad/
- .demo-data/.squad/agents/{agent-name}/charter.md
- .demo-data/.squad/agents/{agent-name}/history.md
- .demo-data/reports/{kind}-{id}.json
- .demo-data/reports/{kind}-{id}.md

## Features

- Resolves or creates a persistent .squad workspace under .demo-data.
- Loads intake payload from CLI input (`--input`) or a built-in default.
- Casts and onboards a deterministic triage team.
- Produces a structured triage report (severity, risks, owner role, actions).
- Calls an LLM per role (lead, developer, tester, scribe) when configured.
- Writes JSON and Markdown report artifacts for human review.

## Prerequisites

- Node.js >= 20
- npm
- If local SDK type errors appear, run this once from repo root: npm.cmd install --include=dev

## Expected behavior

When you run npm.cmd start, you should see:

- Step 1: .squad resolution under .demo-data
- Step 2: intake payload summary
- Step 3: triage team cast
- Step 4: onboarding results with file paths
- Step 5: roster table output
- Step 6: live LLM outputs for each role + triage report generation
- Step 7: matching names across two casts

## Payload schema

Input JSON fields:

- kind: `issue` or `pr`
- id: numeric ticket or PR id
- repo: repository slug
- title: short summary
- description: long text context
- labels: array of labels
- author: actor login/name
- changedFiles: optional array of changed paths
- ciStatus: optional `passing`, `failing`, or `unknown`