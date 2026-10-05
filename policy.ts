import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const Policies = ["ask", "on", "off"] as const
export type Policy = (typeof Policies)[number]

export const DENIED_MESSAGE =
  'sudo commands are denied: sudo.policy is "off". Run `/sudo on` or `/sudo ask` to re-enable.'

/** Live policy state file shared by the plugin, the TUI picker, and the CLI helper. */
export function policyFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(base, "opencode", "sudo-policy")
}

export function readPolicyFile() {
  try {
    return fs.readFileSync(policyFile(), "utf8")
  } catch {
    return undefined
  }
}

export function writePolicy(policy: Policy) {
  const file = policyFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, policy + "\n")
}

/**
 * Resolve the effective sudo policy. Precedence: OPENCODE_SUDO_POLICY env var,
 * then the sudo-policy file (live toggle, no restart), then the configured
 * default. Anything unrecognized falls through to "ask".
 */
export function resolvePolicy(fallback?: unknown, env = process.env.OPENCODE_SUDO_POLICY, file = readPolicyFile()): Policy {
  for (const candidate of [env, file?.trim(), typeof fallback === "string" ? fallback : undefined]) {
    if (candidate && (Policies as readonly string[]).includes(candidate)) return candidate as Policy
  }
  return "ask"
}

const binaries = new Map<string, string>()

/** Resolve a binary on PATH once per plugin process, falling back to the bare name. */
export function which(binary: string) {
  const cached = binaries.get(binary)
  if (cached) return cached
  let resolved = binary
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue
    const candidate = path.join(dir, binary)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      resolved = candidate
      break
    }
  }
  binaries.set(binary, resolved)
  return resolved
}

/** Wrapper for the `ask` policy: elevate through a polkit GUI prompt. */
export function pkexecWrapper() {
  const sudo = which("sudo")
  const pkexec = which("pkexec")
  // Without polkit there is no GUI to show; fall back to cached credentials
  // rather than hanging on a password prompt that can never appear.
  if (pkexec === "pkexec") return `${sudo} -n`
  return `${pkexec} --disable-internal-agent ${sudo} -n`
}

/** Wrapper for the `on` policy: run sudo non-interactively with cached credentials. */
export function sudoNonInteractive() {
  return `${which("sudo")} -n`
}
