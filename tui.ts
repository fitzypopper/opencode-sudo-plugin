import { Plugin } from "@opencode/plugin/tui"
import { type Policy, Policies, resolvePolicy, writePolicy } from "./policy"

export default Plugin.define({
  id: "opencode.sudo",
  setup(context) {
    const current = (): Policy => resolvePolicy(context.options.policy)

    const apply = (policy: Policy) => {
      writePolicy(policy)
      context.ui.toast.show({ message: `sudo policy: ${policy}`, variant: "success" })
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "opencode.sudo.policy",
          title: "Switch sudo policy",
          description: "ask (GUI prompt), on (cached credentials), or off (deny)",
          group: "Sudo",
          palette: true,
          slash: { name: "sudo", arguments: true },
          run: async (input) => {
            const arg = input?.trim()
            if (arg && (Policies as readonly string[]).includes(arg)) {
              apply(arg as Policy)
              return
            }
            const selected = await context.ui.dialog.select<Policy>({
              title: "Sudo policy",
              current: current(),
              options: [
                { title: "Ask", value: "ask", description: "open a polkit GUI window for every sudo command" },
                { title: "On", value: "on", description: "run sudo with cached credentials, no prompt" },
                { title: "Off", value: "off", description: "deny all sudo commands" },
              ],
            })
            if (selected) apply(selected)
          },
        },
      ],
    }))
  },
})
