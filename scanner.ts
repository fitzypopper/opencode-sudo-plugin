export interface Site {
  readonly start: number
  readonly end: number
}

/**
 * Words after which a new command may begin. `in` and `for` are deliberately
 * absent: `for x in sudo` names sudo as a loop variable, not a command, and
 * `case x in sudo)` uses it as a pattern.
 */
const KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "while",
  "until",
  "do",
  "case",
  "time",
  "coproc",
  "!",
  "{",
  "}",
  "done",
  "fi",
  "esac",
])

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

function isSpace(ch: string) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r"
}

function isSeparator(ch: string) {
  return ch === ";" || ch === "&" || ch === "|"
}

function isTerminator(ch: string) {
  return isSpace(ch) || isSeparator(ch) || ch === "<" || ch === ">" || ch === "(" || ch === ")"
}

/**
 * Read one shell word starting at `start`, concatenating quoted segments so a
 * word like `"su"do` or `'sudo'` resolves to its unquoted value.
 */
function readWord(text: string, start: number) {
  let i = start
  let value = ""
  while (i < text.length) {
    const ch = text[i]!
    if (ch === "'" || ch === '"') {
      i++
      while (i < text.length && text[i] !== ch) {
        if (ch === '"' && text[i] === "\\" && i + 1 < text.length) i++
        if (i < text.length) value += text[i]
        i++
      }
      i++
      continue
    }
    if (ch === "\\" && i + 1 < text.length) {
      i++
      value += text[i]
      i++
      continue
    }
    if (isTerminator(ch)) break
    value += ch
    i++
  }
  return { end: i, value }
}

/**
 * Find every `sudo` that sits in command position: the start of the string or
 * right after a separator, subshell, keyword, or assignment, outside of quotes.
 * Positions index into the original string so callers can splice replacements.
 */
export function findSites(command: string): Site[] {
  const sites: Site[] = []
  let expectCommand = true
  let i = 0
  while (i < command.length) {
    const ch = command[i]!
    if (isSeparator(ch) || ch === "\n" || ch === "`" || ch === "(") {
      expectCommand = true
      i++
      continue
    }
    if (ch === ")") {
      expectCommand = false
      i++
      continue
    }
    if (ch === "<" || ch === ">") {
      i++
      continue
    }
    if (isSpace(ch)) {
      i++
      continue
    }
    const word = readWord(command, i)
    if (expectCommand && word.value === "sudo") sites.push({ start: i, end: word.end })
    // An assignment prefix (`FOO=1 sudo x`) leaves the real command to come.
    if (!ASSIGNMENT.test(word.value)) expectCommand = KEYWORDS.has(word.value)
    i = word.end
  }
  return sites
}

/**
 * Replace every command-position `sudo` with `wrapper`. Returns undefined when
 * the command contains no sudo site.
 */
export function rewriteSites(command: string, wrapper: string): string | undefined {
  const sites = findSites(command)
  if (sites.length === 0) return undefined
  let out = ""
  let last = 0
  for (const site of sites) {
    out += command.slice(last, site.start) + wrapper
    last = site.end
  }
  return out + command.slice(last)
}
