import { describe, expect, test } from "bun:test"
import { findSites, rewriteSites } from "../scanner"

describe("findSites", () => {
  test("leading sudo", () => {
    expect(findSites("sudo apt update")).toEqual([{ start: 0, end: 4 }])
  })

  test("sudo after separators", () => {
    expect(findSites("make && sudo systemctl restart x")).toEqual([{ start: 8, end: 12 }])
    expect(findSites("make; sudo true")).toEqual([{ start: 6, end: 10 }])
    expect(findSites("make | sudo tee /etc/x")).toEqual([{ start: 7, end: 11 }])
    expect(findSites("make\nsudo true")).toEqual([{ start: 5, end: 9 }])
    expect(findSites("sleep 5 & sudo true")).toEqual([{ start: 10, end: 14 }])
  })

  test("sudo inside subshell and backticks", () => {
    expect(findSites("echo $(sudo whoami)")).toEqual([{ start: 7, end: 11 }])
    expect(findSites("echo `sudo whoami`")).toEqual([{ start: 6, end: 10 }])
    expect(findSites("(sudo true)")).toEqual([{ start: 1, end: 5 }])
  })

  test("sudo after shell keywords", () => {
    expect(findSites("if sudo test -f /etc/x; then echo ok; fi")).toEqual([{ start: 3, end: 7 }])
    expect(findSites("while sudo -n true; do sleep 1; done")).toEqual([{ start: 6, end: 10 }])
    expect(findSites("time sudo true")).toEqual([{ start: 5, end: 9 }])
    expect(findSites("! sudo true")).toEqual([{ start: 2, end: 6 }])
  })

  test("sudo after an assignment prefix", () => {
    expect(findSites("FOO=1 sudo -u bob true")).toEqual([{ start: 6, end: 10 }])
    expect(findSites("DEBIAN_FRONTEND=noninteractive sudo apt install -y curl")).toEqual([
      { start: 31, end: 35 },
    ])
  })

  test("no site when sudo is an argument", () => {
    expect(findSites("echo sudo")).toEqual([])
    expect(findSites("cat sudo")).toEqual([])
    expect(findSites("grep -r sudo .")).toEqual([])
    expect(findSites("command sudo true")).toEqual([])
  })

  test("no site inside quotes", () => {
    expect(findSites('echo "sudo"')).toEqual([])
    expect(findSites("echo 'sudo ls'")).toEqual([])
    expect(findSites('echo "run sudo please" && true')).toEqual([])
  })

  test("no site in a redirect target or loop variable", () => {
    expect(findSites("echo hi > sudo")).toEqual([])
    expect(findSites("for sudo in a b; do echo; done")).toEqual([])
    expect(findSites("for x in sudo; do echo; done")).toEqual([])
    expect(findSites("FOO=sudo make")).toEqual([])
  })

  test("quoted command name still counts", () => {
    expect(findSites('"sudo" true')).toEqual([{ start: 0, end: 6 }])
    expect(findSites("'sudo' true")).toEqual([{ start: 0, end: 6 }])
  })

  test("path-qualified sudo is not rewritten", () => {
    expect(findSites("/usr/bin/sudo true")).toEqual([])
    expect(findSites("./sudo true")).toEqual([])
    expect(findSites("mysudo true")).toEqual([])
  })
})

describe("rewriteSites", () => {
  test("replaces every site with the wrapper", () => {
    expect(rewriteSites("sudo apt update", "pkexec sudo -n")).toBe("pkexec sudo -n apt update")
    expect(rewriteSites("cd /tmp && sudo ls && sudo id", "sudo -n")).toBe(
      "cd /tmp && sudo -n ls && sudo -n id",
    )
  })

  test("returns undefined without sites", () => {
    expect(rewriteSites("echo sudo", "pkexec sudo -n")).toBeUndefined()
    expect(rewriteSites("ls -la", "pkexec sudo -n")).toBeUndefined()
  })
})
