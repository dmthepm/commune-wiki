# The grill

One round, written into `dumps/<slug>.answers.md`, then stop. Do not draft in
the same turn: the round is a file the human answers, not a conversation.

## Mechanics

- **Settled** comes first: every fact you resolved from the filesystem, the CLI
  or the dump, one line each, no question mark. Most of what looks like a
  question is a fact you have not looked up yet.
- **The frontier** is what is left: decisions whose answer changes a file. Number
  them `Q1`, `Q2`. Three is a full round; more than five means you did not
  resolve enough into Settled.
- Each question **leads with the recommended answer**, so answering is a yes or
  a correction, not an essay.
- Write the round, print the path, stop. The next turn reads the answers back
  out of the file, so a different context window can pick it up.

## The three rules

1. **A question exists only if the answer changes a file.** Ask it the other way
   in your head: if the opposite answer changes no line in the file set, it is
   not a question — it is a fact, and it belongs under Settled. This is the
   completion criterion for the whole round.
2. **When the answer is taste, show two rendered sentences, never a description
   of them.** Pipe both through `$COMMUNE render - --json` and put them side by
   side under the question. "Should this be punchier?" is not answerable; two
   sentences are.
3. **State graph consequences from `.connect.md`, and only ask about the ones
   the human owns.** "Dropping `[[Noontide]]` leaves it with 0 inbound" is a
   fact for Settled. "This note would be the only thing linking Noontide — keep
   the link?" is a question. Read the numbers out of `at_risk`; never recompute
   them in prose.

## What this is not

Not `~/.claude/skills/grilling`. That skill is not on a stranger's machine, a
model-invoked skill cannot reach a user-invoked one anyway, and its reading of
"round" produced seven questions of which five were settled facts wearing
question marks. The twenty lines above are the whole borrowing.
