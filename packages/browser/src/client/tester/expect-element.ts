import type { Locator } from '@vitest/browser/context'
import type { ExpectPollOptions } from 'vitest'
import { chai, expect } from 'vitest'
import { matchers } from './expect'
import { processTimeoutOptions } from './utils'

function element<T extends Element | null | Locator>(elementOrLocator: T, options?: ExpectPollOptions): unknown {
  if (elementOrLocator != null && !(elementOrLocator instanceof Element) && !('element' in elementOrLocator)) {
    throw new Error(`Invalid element or locator: ${elementOrLocator}. Expected an instance of Element or Locator, received ${typeof elementOrLocator}`)
  }

  return expect.poll<Element | null>(function element(this: object) {
    if (elementOrLocator instanceof Element || elementOrLocator == null) {
      return elementOrLocator
    }
    chai.util.flag(this, '_poll.element', true)

    const isNot = chai.util.flag(this, 'negate') as boolean
    const name = chai.util.flag(this, '_name') as string
    // element selector uses prettyDOM under the hood, which is an expensive call
    // that should not be called on each failed locator attempt to avoid memory leak:
    // https://github.com/vitest-dev/vitest/issues/7139
    const isLastPollAttempt = chai.util.flag(this, '_isLastPollAttempt')
    // special case for `toBeInTheDocument` matcher
    if (isNot && name === 'toBeInTheDocument') {
      return elementOrLocator.query()
    }

    if (isLastPollAttempt) {
      return elementOrLocator.element()
    }

    const result = elementOrLocator.query()

    if (!result) {
      throw new Error(`Cannot find element with locator: ${JSON.stringify(elementOrLocator)}`)
    }

    return result
  }, processTimeoutOptions(options))
}

expect.extend(matchers)
// Vitest typecheck doesn't pick up this assignment for some reason
Object.assign(expect, { element })
