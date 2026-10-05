import { Plugin } from "@opencode/plugin"
import { DENIED_MESSAGE, pkexecWrapper, resolvePolicy, sudoNonInteractive } from "./policy"
import { findSites, rewriteSites } from "./scanner"

export default Plugin.define({
  id: "opencode.sudo",
  async setup(ctx) {
    const policy = () => resolvePolicy(ctx.options.policy)

    const shell = await ctx.shell.hook("create.before", (event) => {
      const current = policy()
      if (current === "off") return
      const wrapper = current === "ask" ? pkexecWrapper() : sudoNonInteractive()
      const rewritten = rewriteSites(event.command, wrapper)
      if (rewritten) event.command = rewritten
    })

    const permission = await ctx.permission.hook("evaluate", (event) => {
      if (policy() !== "off") return
      if (event.action !== "shell") return
      if (!event.resources.some((resource) => findSites(resource).length > 0)) return
      event.effect = "deny"
      event.message = DENIED_MESSAGE
    })

    return () => Promise.all([shell.dispose(), permission.dispose()]).then(() => undefined)
  },
})
