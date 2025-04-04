import type {
  LocatorByRoleOptions,
  LocatorOptions,
  LocatorScreenshotOptions,
  UserEventClearOptions,
  UserEventClickOptions,
  UserEventDragAndDropOptions,
  UserEventFillOptions,
  UserEventHoverOptions,
  UserEventSelectOptions,
  UserEventUploadOptions,
} from '@vitest/browser/context'
import type { ParsedSelector } from 'ivya'
import { page, server } from '@vitest/browser/context'
import {
  getByAltTextSelector,
  getByLabelSelector,
  getByPlaceholderSelector,
  getByRoleSelector,
  getByTestIdSelector,
  getByTextSelector,
  getByTitleSelector,
  Ivya,

} from 'ivya'
import { ensureAwaited, getBrowserState } from '../../utils'
import { getElementError } from '../public-utils'
import { escapeForTextSelector } from '../utils'

// we prefer using playwright locators because they are more powerful and support Shadow DOM
export const selectorEngine: Ivya = Ivya.create({
  browser: ((name: string) => {
    switch (name) {
      case 'edge':
      case 'chrome':
        return 'chromium'
      case 'safari':
        return 'webkit'
      default:
        return name as 'webkit' | 'firefox' | 'chromium'
    }
  })(server.config.browser.name),
  testIdAttribute: server.config.browser.locators.testIdAttribute,
})

export abstract class Locator {
  public abstract selector: string

  private _parsedSelector: ParsedSelector | undefined
  protected _container?: Element | undefined
  protected _pwSelector?: string | undefined

  public click(options: UserEventClickOptions = {}): Promise<void> {
    return this.triggerCommand<void>('__vitest_click', this.selector, options)
  }

  public dblClick(options: UserEventClickOptions = {}): Promise<void> {
    return this.triggerCommand<void>('__vitest_dblClick', this.selector, options)
  }

  public tripleClick(options: UserEventClickOptions = {}): Promise<void> {
    return this.triggerCommand<void>('__vitest_tripleClick', this.selector, options)
  }

  public clear(options?: UserEventClearOptions): Promise<void> {
    return this.triggerCommand<void>('__vitest_clear', this.selector, options)
  }

  public hover(options?: UserEventHoverOptions): Promise<void> {
    return this.triggerCommand<void>('__vitest_hover', this.selector, options)
  }

  public unhover(options?: UserEventHoverOptions): Promise<void> {
    return this.triggerCommand<void>('__vitest_hover', 'html > body', options)
  }

  public fill(text: string, options?: UserEventFillOptions): Promise<void> {
    return this.triggerCommand<void>('__vitest_fill', this.selector, text, options)
  }

  public async upload(files: string | string[] | File | File[], options?: UserEventUploadOptions): Promise<void> {
    const filesPromise = (Array.isArray(files) ? files : [files]).map(async (file) => {
      if (typeof file === 'string') {
        return file
      }
      const bas64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
        reader.readAsDataURL(file)
      })

      return {
        name: file.name,
        mimeType: file.type,
        base64: bas64String,
      }
    })
    return this.triggerCommand<void>('__vitest_upload', this.selector, await Promise.all(filesPromise), options)
  }

  public dropTo(target: Locator, options: UserEventDragAndDropOptions = {}): Promise<void> {
    return this.triggerCommand<void>(
      '__vitest_dragAndDrop',
      this.selector,
      target.selector,
      options,
    )
  }

  public selectOptions(
    value: HTMLElement | HTMLElement[] | Locator | Locator[] | string | string[],
    options?: UserEventSelectOptions,
  ): Promise<void> {
    const values = (Array.isArray(value) ? value : [value]).map((v) => {
      if (typeof v !== 'string') {
        const selector = 'element' in v ? v.selector : selectorEngine.generateSelectorSimple(v)
        return { element: selector }
      }
      return v
    })
    return this.triggerCommand('__vitest_selectOptions', this.selector, values, options)
  }

  public screenshot(options: Omit<LocatorScreenshotOptions, 'base64'> & { base64: true }): Promise<{
    path: string
    base64: string
  }>
  public screenshot(options?: LocatorScreenshotOptions): Promise<string>
  public screenshot(options?: LocatorScreenshotOptions): Promise<string | {
    path: string
    base64: string
  }> {
    return page.screenshot({
      ...options,
      element: this,
    })
  }

  protected abstract locator(selector: string): Locator
  protected abstract elementLocator(element: Element): Locator

  public getByRole(role: string, options?: LocatorByRoleOptions): Locator {
    return this.locator(getByRoleSelector(role, options))
  }

  public getByAltText(text: string | RegExp, options?: LocatorOptions): Locator {
    return this.locator(getByAltTextSelector(text, options))
  }

  public getByLabelText(text: string | RegExp, options?: LocatorOptions): Locator {
    return this.locator(getByLabelSelector(text, options))
  }

  public getByPlaceholder(text: string | RegExp, options?: LocatorOptions): Locator {
    return this.locator(getByPlaceholderSelector(text, options))
  }

  public getByTestId(testId: string | RegExp): Locator {
    return this.locator(getByTestIdSelector(server.config.browser.locators.testIdAttribute, testId))
  }

  public getByText(text: string | RegExp, options?: LocatorOptions): Locator {
    return this.locator(getByTextSelector(text, options))
  }

  public getByTitle(title: string | RegExp, options?: LocatorOptions): Locator {
    return this.locator(getByTitleSelector(title, options))
  }

  public filter(filter: LocatorOptions): Locator {
    const selectors = []

    if (filter?.hasText) {
      selectors.push(`internal:has-text=${escapeForTextSelector(filter.hasText, false)}`)
    }

    if (filter?.hasNotText) {
      selectors.push(`internal:has-not-text=${escapeForTextSelector(filter.hasNotText, false)}`)
    }

    if (filter?.has) {
      const locator = filter.has as Locator
      selectors.push(`internal:has=${JSON.stringify(locator._pwSelector || locator.selector)}`)
    }

    if (filter?.hasNot) {
      const locator = filter.hasNot as Locator
      selectors.push(`internal:has-not=${JSON.stringify(locator._pwSelector || locator.selector)}`)
    }

    if (!selectors.length) {
      throw new Error(`Locator.filter expects at least one filter. None provided.`)
    }

    return this.locator(selectors.join(' >> '))
  }

  public and(locator: Locator): Locator {
    return this.locator(`internal:and=${JSON.stringify(locator._pwSelector || locator.selector)}`)
  }

  public or(locator: Locator): Locator {
    return this.locator(`internal:or=${JSON.stringify(locator._pwSelector || locator.selector)}`)
  }

  public query(): Element | null {
    const parsedSelector = this._parsedSelector || (this._parsedSelector = selectorEngine.parseSelector(this._pwSelector || this.selector))
    return selectorEngine.querySelector(parsedSelector, document.documentElement, true)
  }

  public element(): Element {
    const element = this.query()
    if (!element) {
      throw getElementError(this._pwSelector || this.selector, this._container || document.body)
    }
    return element
  }

  public elements(): Element[] {
    const parsedSelector = this._parsedSelector || (this._parsedSelector = selectorEngine.parseSelector(this._pwSelector || this.selector))
    return selectorEngine.querySelectorAll(parsedSelector, document.documentElement)
  }

  public all(): Locator[] {
    return this.elements().map(element => this.elementLocator(element))
  }

  public nth(index: number): Locator {
    return this.locator(`nth=${index}`)
  }

  public first(): Locator {
    return this.nth(0)
  }

  public last(): Locator {
    return this.nth(-1)
  }

  public toString(): string {
    return this.selector
  }

  public toJSON(): string {
    return this.selector
  }

  protected triggerCommand<T>(command: string, ...args: any[]): Promise<T> {
    const commands = getBrowserState().commands
    return ensureAwaited(error => commands.triggerCommand<T>(
      command,
      args,
      error,
    ))
  }
}
