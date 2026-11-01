#!/usr/bin/env bun
import Agent from "agl-ai"
import { providers } from "agl-ai"
import * as museProvider from "agl-ai/providers/muse"
import { spawnSync } from "child_process"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname, join } from "path"

# Load .env from project dir (so `d` picks up MUSE_API_KEY without `bun --env-file`)
# Searches cwd and the package root (where this file lives). First found wins, does not override existing env.
loadDotEnv = ->
  candidates = []
  try candidates.push resolve process.cwd(), ".env" catch then null
  try candidates.push resolve import.meta.dir, "..", ".env" catch then null
  try candidates.push resolve import.meta.dir, "..", "..", ".env" catch then null
  try candidates.push join dirname(process.argv[1] ? ""), "..", ".env" catch then null
  try candidates.push join dirname(process.argv[1] ? ""), ".env" catch then null
  seen = new Set()
  for p in candidates when p and not seen.has p
    seen.add p
    try
      if existsSync p
        text = readFileSync p, "utf8"
        for line in text.split "\n"
          line = line.trim()
          continue if not line or line.startsWith "#"
          # allow optional export prefix
          line = line.replace /^export\s+/, ""
          m = line.match /^([^=]+)=(.*)$/
          continue unless m
          k = m[1].trim()
          v = m[2].trim()
          # strip surrounding single/double quotes
          if (v.startsWith('"') and v.endsWith('"')) or (v.startsWith("'") and v.endsWith("'"))
            v = v.slice 1, -1
          # only set if not already set (explicit env wins)
          if not process.env[k]?
            process.env[k] = v
        break
    catch then continue

loadDotEnv()

# Register Muse provider with agl-ai (keeps agl upstream untouched; see src/providers/muse.mjs)
# This enables `muse:`-prefixed models without modifying /workspace/agl (read-only in sandbox).
providers.muse = museProvider

# ---------------------------------------------------------------------------
# Microagent: Arch Linux bash command generator
# Single decision: translate natural language into one valid bash shell command.
# ---------------------------------------------------------------------------

# Deterministic clipboard — try Wayland, then X11, then macOS, then WSL.
copyToClipboard = (text) ->
  candidates = [
    { cmd: "wl-copy", args: [] }
    { cmd: "xclip", args: ["-selection", "clipboard"] }
    { cmd: "xsel",  args: ["--clipboard", "--input"] }
    { cmd: "pbcopy", args: [] }
    { cmd: "clip.exe", args: [] }
  ]
  for {cmd, args} in candidates
    try
      res = spawnSync cmd, args, input: text, encoding: "utf8", stdio: ["pipe","ignore","ignore"]
      if res.status is 0
        return true
      # command found but failed -> try next
      if res.error?.code isnt "ENOENT"
        continue
    catch e
      if e?.code is "ENOENT"
        continue
      continue
  false

# Usage helper
printUsage = ->
  console.error "Usage: d [prompt]"
  console.error ""
  console.error "  d \"list all node_modules folders recursively\""
  console.error "  d \"show disk usage of / sorted by size\""
  console.error "  d \"install ripgrep with pacman\""
  console.error ""
  console.error "Generates a single Arch Linux bash command for the given natural language prompt."
  console.error "The command is printed to stdout and copied to the clipboard (wl-copy / xclip / xsel)."

# ---------------------------------------------------------------------------
# Microagent factory — one decision, one output_tool, one run
# ---------------------------------------------------------------------------

systemPrompt = """
You are a focused Arch Linux bash microagent. Your sole job is to translate the user's natural language request into ONE valid Arch Linux bash shell command.

Constraints and quality bar:
- Output exactly one bash command as a single string — no explanation, no markdown, no surrounding quotes, no placeholder <...>.
- The command must be syntactically valid bash (zsh/fish syntax is forbidden) and runnable on a standard Arch Linux system.
- Prefer idiomatic Arch tools: pacman (sudo pacman -S --needed / -Qs / -Qi / -Rs), yay/paru for AUR, systemctl/journalctl, ls/find/fd, grep/rg, sed/awk, curl/wget, docker/podman, git, etc.
- For package installation, use `sudo pacman -S --needed <pkg>`; for AUR packages use `yay -S <pkg>`. Do not invent package names.
- Quote and escape correctly: handle filenames with spaces, glob safety, and variable expansion. Prefer single quotes for literals, double quotes when expansion needed.
- When the request implies multiple steps, chain with `&&` or `;` or use a one-liner subshell, but keep it as ONE command string (newlines are not allowed — use `;` or `&&`).
- Prefer safe, non-destructive defaults. Do not add `sudo rm -rf` unless the user explicitly asks for destructive operations.
- Do not output comments, explanations, or trailing newlines inside the command. The command itself may include `#` only if it is valid shell syntax.
- If the request is ambiguous, choose the most common Arch Linux interpretation.
- Always assume bash as the shell.

Examples of correct mappings:
- "list files in current dir with sizes" → `ls -lh`
- "find large files over 100M" → `find . -type f -size +100M -exec ls -lh {} \\;`
- "show disk usage sorted" → `du -sh * | sort -hr`
- "install neovim" → `sudo pacman -S --needed neovim`
"""

# Model selection / fallback. If the user pinned D_MODEL, use it directly.
# Otherwise prefer the user's `default` model (resolves via
# ~/.config/agl/config.yaml default_model) but give it only a 1s window with no
# retries. If it is unreachable, fall through to the Muse provider so `d` always
# has a model to talk to.
overrideModel  = process.env.D_MODEL
museModel      = "muse:muse-spark-1.3-contributor"
DEFAULT_TIMEOUT = 1000

outputTool =
  description: "Return the single Arch Linux bash command that fulfills the user's request."
  parameters:
    command:
      type: "string"
      description: "A single valid Arch Linux bash shell command. Must be syntactically correct bash, no placeholders, no markdown, no extra explanation. Chain steps with && or ; if needed, but keep it one command string."
  required: ["command"]

# Build a fresh agent and run it; normalize the output_tool result to the command.
runSpec = (spec, userPrompt, factoryOpts = {}) ->
  agentOpts =
    model: spec
    system_prompt: systemPrompt
    output_tool: outputTool
  if factoryOpts.timeout_ms?
    agentOpts.timeout_ms = factoryOpts.timeout_ms
  if factoryOpts.retries?
    agentOpts.retries = factoryOpts.retries
  agent = await Agent.factory agentOpts
  result = await agent.run
    prompt: "<user-request>#{userPrompt}</user-request>"
  if typeof result is "string"
    return result
  if result?.command?
    return String result.command
  if result?.output?
    return String result.output
  return String result ? ""

# Single microagent wrapper function: try `default` (1s, no retry); fall back to muse.
generateCommand = (userPrompt) ->
  if overrideModel
    return await runSpec overrideModel, userPrompt
  try
    return await runSpec "default", userPrompt, timeout_ms: DEFAULT_TIMEOUT, retries: 0
  catch err
    if process.env.DEBUG
      console.error "[d] default model unavailable (#{err?.message ? String err}); falling back to #{museModel}"
    return await runSpec museModel, userPrompt

# ---------------------------------------------------------------------------
# Deterministic CLI boundary — I/O, validation, stdout, clipboard
# ---------------------------------------------------------------------------

prompt = process.argv.slice(2).join " "

if not prompt?.trim()
  printUsage()
  process.exit 1

try
  command = await generateCommand prompt.trim()
  command = String(command ? "").trim()
  if not command
    console.error "error: model returned empty command"
    process.exit 1

  # Deterministic normalization: trim, ensure no surrounding markdown fences
  if command.startsWith "```"
    command = command.replace /^```[a-z]*\n?/, ""
    command = command.replace /\n```$/, ""
    command = command.trim()

  # Output to stdout (the contract: command on stdout)
  console.log command

  # Also put on clipboard — best effort, warn on failure but do not fail the command output
  copied = copyToClipboard command
  unless copied
    console.error "[d] warning: could not copy to clipboard (install wl-clipboard, xclip, or xsel)"
  process.exit 0
catch err
  console.error "[d] error: #{err?.message ? String err}"
  if process.env.DEBUG
    console.error err.stack ? err
  process.exit 1
