import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Policies, resolvePolicy, writePolicy } from "../policy"

const originalXdgd = process.env.XDG_CONFIG_HOME
const originalEnv = process.env.OPENCODE_SUDO_POLICY

afterEach(() => {
  if (originalXdgd === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdgd
  if (originalEnv === undefined) delete process.env.OPENCODE_SUDO_POLICY
  else process.env.OPENCODE_SUDO_POLICY = originalEnv
})

describe("resolvePolicy", () => {
  test("defaults to ask", () => {
    expect(resolvePolicy(undefined, "", "")).toBe("ask")
  })

  test("env wins over file and fallback", () => {
    expect(resolvePolicy("off", "on", "ask")).toBe("on")
  })

  test("file wins over fallback", () => {
    expect(resolvePolicy("off", "", "on")).toBe("on")
  })

  test("fallback applies last", () => {
    expect(resolvePolicy("off", "", "")).toBe("off")
  })

  test("unrecognized values fall through", () => {
    expect(resolvePolicy("bogus", "nope", " invalid ")).toBe("ask")
    expect(resolvePolicy(42, "on!", "\toff\n")).toBe("off")
  })
})

describe("writePolicy", () => {
  test("round-trips through the state file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-sudo-test-"))
    process.env.XDG_CONFIG_HOME = dir
    for (const policy of Policies) {
      writePolicy(policy)
      expect(resolvePolicy(undefined, "", undefined)).toBe(policy)
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
